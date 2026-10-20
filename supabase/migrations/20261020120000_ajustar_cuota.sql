-- ═══════════════════════════════════════════════════════════════════════════
-- PROPUESTA, NO APLICAR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ajustar_cuota · corregir monto y/o vencimiento de una cuota impaga
--
-- ── Por qué la guarda vive en la función y no en RLS ─────────────────────
--
-- `cuota_update_autenticado` (20260822200000_rls_cuota_imputacion.sql) es
-- `using(true)` a propósito: los triggers de sync (`sync_cuota_pagada`,
-- `sync_cuota_vence_at`) escriben en `cuota` con los permisos de quien
-- disparó el UPDATE original sobre `pago_imputacion`/`jornada`, y una policy
-- restrictiva ahí rompería esos triggers para cualquier rol que no fuera
-- admin. Por eso "solo admin" es un `if` adentro de esta función, no algo
-- que la RLS pueda hacer por nosotros.
--
-- ── Por qué no reemplaza a audit_log ───────────────────────────────────────
--
-- `trg_audit_cuota` (001_schema.sql) ya registra el before/after completo de
-- la fila en cada UPDATE, automático, con usuario y fecha. `cuota_ajuste`
-- existe sólo porque `audit_log` no tiene lugar para el motivo, y porque leer
-- acá para una pantalla de historial es más simple que parsear jsonb.
--
-- ── condonar_cuota NO es una función aparte ────────────────────────────────
--
-- Condonar es el mismo camino que ajustar, con dos reglas de más: el monto
-- nuevo tiene que ser EXACTAMENTE lo ya pagado (pago_imputacion +
-- anticipo_uso) y no se toca el vencimiento. `tipo` queda escrito en
-- `cuota_ajuste` para que la pantalla sepa, después, si lo que saldó la
-- cuota fue un cobro real o una condonación.
--
-- Un ajuste NORMAL que de casualidad dejara el saldo en cero se rechaza: si
-- "monto nuevo = lo ya pagado" se permitiera con `tipo='ajuste'`, la cuota
-- quedaría saldada sin que `cuota_ajuste` lo distinga de una condonación —
-- exactamente el dato que la pantalla necesita para la etiqueta "Condonada".
create table public.cuota_ajuste (
  id                uuid primary key default gen_random_uuid(),
  cuota_id          uuid not null references cuota(id),
  tipo              text not null default 'ajuste' check (tipo in ('ajuste', 'condonacion')),
  monto_anterior    numeric(16,2) not null,
  monto_nuevo       numeric(16,2) not null,
  vence_at_anterior date not null,
  vence_at_nuevo    date not null,
  motivo            text not null,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);

comment on table public.cuota_ajuste is
  'Historial de ajustes y condonaciones de cuota: qué cambió, de qué tipo, '
  'por qué, quién y cuándo. audit_log ya registra el before/after completo '
  'de la fila (trg_audit_cuota); esta tabla agrega el motivo y el tipo, que '
  'audit_log no distingue.';

alter table public.cuota_ajuste enable row level security;

-- select: admin y finanzas (finanzas necesita ver el historial para
-- conciliar cobranza, aunque no pueda crear ajustes). insert: solo admin,
-- que es quien puede llamar a ajustar_cuota.
create policy cuota_ajuste_select_rol on public.cuota_ajuste
  for select to authenticated using (auth_rol() = any (array['admin', 'finanzas']));

create policy cuota_ajuste_insert_admin on public.cuota_ajuste
  for insert to authenticated with check (auth_rol() = 'admin');
-- Sin UPDATE ni DELETE: un ajuste no se corrige editando su propio
-- registro — se hace OTRO ajuste, que queda como fila nueva. Mismo
-- principio que un asiento (regla 4), a escala de esta tabla chica.

create or replace function public.ajustar_cuota(
  p_cuota_id   uuid,
  p_motivo     text,
  p_monto      numeric default null,
  p_vence_at   date default null,
  p_tipo       text default 'ajuste',
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id         uuid;
  v_monto_anterior  numeric(16,2);
  v_vence_anterior  date;
  v_pagado_at       date;
  v_jornada_id      uuid;
  v_imputado        numeric(16,2);
  v_monto_nuevo     numeric(16,2);
  v_vence_nuevo     date;
  v_pagado_at_nuevo date;
  v_fecha_pago      date;
  v_filas           int;
  v_ajuste_id       uuid;
begin
  if coalesce(auth_rol(), '') <> 'admin' then
    raise exception
      'Ajustar una cuota es sólo de administrador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'El ajuste necesita un motivo: por qué se cambia esta cuota.';
  end if;

  if p_tipo not in ('ajuste', 'condonacion') then
    raise exception 'Tipo de ajuste inválido: "%". Los válidos son ajuste y condonacion.', p_tipo;
  end if;

  if p_monto is null and p_vence_at is null then
    raise exception 'Indicá un monto nuevo, un vencimiento nuevo, o los dos — no hay nada para ajustar.';
  end if;

  select monto, vence_at, pagado_at, jornada_id
    into v_monto_anterior, v_vence_anterior, v_pagado_at, v_jornada_id
    from cuota
   where id = p_cuota_id;

  if not found then
    raise exception 'La cuota % no existe', p_cuota_id;
  end if;

  if v_pagado_at is not null then
    raise exception
      'La cuota % ya está pagada — no se ajusta; si fue un error, se anula el cobro.',
      p_cuota_id;
  end if;

  -- Las cuotas de partido vencen con su jornada (sync_cuota_vence_at /
  -- mover_jornada las mueve solas). Editar vence_at a mano acá las
  -- desalinearía del calendario sin que nada lo vuelva a corregir.
  if p_vence_at is not null and v_jornada_id is not null then
    raise exception
      'Esta cuota vence con su jornada — el vencimiento no se edita a mano. '
      'Para correr la fecha, usá mover_jornada().';
  end if;

  v_pagado_at_nuevo := null;

  if p_monto is not null then
    -- Lo ya pagado: imputaciones directas + anticipo aplicado, el mismo
    -- cálculo que usan v_deuda_detalle y sync_cuota_pagada.
    select coalesce(sum(pi.monto), 0)
         + coalesce((select sum(au.monto) from anticipo_uso au where au.cuota_id = p_cuota_id), 0)
      into v_imputado
      from pago_imputacion pi
     where pi.cuota_id = p_cuota_id;

    if p_monto < v_imputado then
      raise exception
        'El monto nuevo (%) no puede ser menor que lo ya pagado de esta cuota (%).',
        p_monto, v_imputado;
    end if;

    if p_tipo = 'condonacion' then
      if p_monto <> v_imputado or p_vence_at is not null then
        raise exception
          'Una condonación lleva el monto exactamente a lo ya pagado (%) y no '
          'toca el vencimiento. Para otro cambio, usá un ajuste normal.',
          v_imputado;
      end if;

      -- La cuota queda saldada con la misma lógica que sync_cuota_pagada:
      -- la fecha del último pago real, si hubo alguno. Si no hubo ninguno
      -- (condonación pura, sin un peso cobrado), la de hoy — tiene que
      -- quedar resuelta igual, o las vistas que miran pagado_at/vence_at en
      -- vez de saldo (v_estado_cuota, por ejemplo) la siguen viendo vencida.
      select max(p.fecha) into v_fecha_pago
        from pago_imputacion pi
        join pago p on p.id = pi.pago_id
       where pi.cuota_id = p_cuota_id;
      select greatest(coalesce(v_fecha_pago, '1900-01-01'), coalesce(max(fecha), '1900-01-01'))
        into v_fecha_pago
        from anticipo_uso where cuota_id = p_cuota_id;
      v_pagado_at_nuevo := case when v_fecha_pago = '1900-01-01' then current_date else v_fecha_pago end;

    elsif p_monto = v_imputado then
      -- Un ajuste normal nunca salda la cuota en silencio: si el monto
      -- nuevo coincide con lo ya pagado, ES una condonación, se la haya
      -- llamado así o no — se rechaza y se pide el botón correcto, para que
      -- cuota_ajuste.tipo diga la verdad de lo que pasó.
      raise exception
        'Este ajuste deja la cuota saldada (monto nuevo = lo ya pagado, %) — '
        'usá "Condonar" en vez de un ajuste normal.',
        v_imputado;
    end if;
  elsif p_tipo = 'condonacion' then
    raise exception 'Una condonación necesita un monto — no hay nada que condonar sin eso.';
  end if;

  v_monto_nuevo := coalesce(p_monto, v_monto_anterior);
  v_vence_nuevo := coalesce(p_vence_at, v_vence_anterior);
  v_user_id := coalesce(p_created_by, auth.uid());

  if v_user_id is null then
    raise exception 'Falta responsable del ajuste: se requiere p_created_by o sesión autenticada.';
  end if;

  update cuota
     set monto = v_monto_nuevo,
         vence_at = v_vence_nuevo,
         pagado_at = v_pagado_at_nuevo
   where id = p_cuota_id
     and pagado_at is null;

  -- La cuota pudo pagarse entre el SELECT de arriba y este UPDATE —no hay
  -- lock explícito—. La RLS de cuota es using(true), así que nunca va a
  -- denegar en silencio acá, pero contar filas es la misma disciplina que ya
  -- costó aprender con otros UPDATE mudos en este proyecto.
  get diagnostics v_filas = row_count;

  if v_filas = 0 then
    raise exception
      'El ajuste no se aplicó (0 filas). La cuota % puede haberse pagado justo ahora — revisála de nuevo.',
      p_cuota_id;
  end if;

  insert into cuota_ajuste (
    cuota_id, tipo, monto_anterior, monto_nuevo, vence_at_anterior, vence_at_nuevo, motivo, created_by
  ) values (
    p_cuota_id, p_tipo, v_monto_anterior, v_monto_nuevo, v_vence_anterior, v_vence_nuevo, trim(p_motivo), v_user_id
  )
  returning id into v_ajuste_id;

  return v_ajuste_id;
end;
$function$;

comment on function public.ajustar_cuota(uuid, text, numeric, date, text, uuid) is
  'Admin corrige monto y/o vencimiento de una cuota impaga, con motivo '
  'obligatorio. condonar = llamar con p_tipo=''condonacion'' y p_monto = lo '
  'ya pagado (pago_imputacion + anticipo_uso): deja la cuota saldada con la '
  'misma lógica que sync_cuota_pagada. Un ajuste normal que coincida con lo '
  'ya pagado se rechaza — eso es una condonación, se llama por su nombre. '
  'Rechaza cuotas ya pagadas, montos menores a lo ya pagado, y cambios de '
  'vencimiento en cuotas de partido (vencen con su jornada). No genera '
  'asiento —la cuota nunca generó uno— ni reemplaza audit_log, lo '
  'complementa con el motivo y el tipo.';
