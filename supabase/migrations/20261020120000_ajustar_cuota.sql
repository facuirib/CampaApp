-- ═══════════════════════════════════════════════════════════════════════════
-- PROPUESTA AMPLIADA — NO APLICAR SIN OK DE FACU
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Diseño original de Horacio (20/10): ajustar_cuota con tipos ajuste y
-- condonacion, todo solo-admin. AMPLIADA el 21/10 por decisión de Facu, que
-- convirtió la excepción puntual en flexibilidad para REESTRUCTURAR cómo
-- paga un equipo durante el torneo:
--
--   · TRES tipos: ajuste (editar monto/vencimiento) · condonacion (perdonar
--     el remanente) · cancelacion (sacar del plan una cuota sin ningún pago).
--   · PERMISOS SEPARADOS: editar es gestión diaria → admin·finanzas·operador;
--     condonar y cancelar hacen desaparecer deuda → admin·finanzas.
--   · Condonadas y canceladas EXCLUIDAS de v_cobranza_kpi (ver abajo).
--   · Sin segundo nivel de aprobación ni tope de monto (decisión del cliente).
--
-- ── Una lógica, tres puertas ───────────────────────────────────────────────
--
-- El patrón es el de crear_jornada/crear_playoff: TODA la validación vive en
-- ajustar_cuota_nucleo (interna, sin guarda — no se llama desde el front), y
-- las tres funciones públicas son puertas finitas: guarda de rol + delegación
-- con el tipo fijado. Así cada puerta nombra exactamente sus roles —que es lo
-- que el verificador lee del fuente— y no hay una función con dos guardas
-- adentro que el catálogo no pueda contar bien. La alternativa (un solo
-- ajustar_cuota con `if p_tipo`) dejaba al verificador viendo la UNIÓN de
-- roles y al catálogo mintiendo sobre quién puede condonar.
--
-- ── Por qué la guarda vive en la función y no en RLS ─────────────────────
--
-- `cuota_update_autenticado` (20260822200000_rls_cuota_imputacion.sql) es
-- `using(true)` a propósito: los triggers de sync (`sync_cuota_pagada`,
-- `sync_cuota_vence_at`) escriben en `cuota` con los permisos de quien
-- disparó el UPDATE original sobre `pago_imputacion`/`jornada`, y una policy
-- restrictiva ahí rompería esos triggers para cualquier rol que no fuera
-- admin. Por eso el rol es un `if` adentro de cada puerta, no algo que la
-- RLS pueda hacer por nosotros.
--
-- ── Por qué no reemplaza a audit_log ───────────────────────────────────────
--
-- `trg_audit_cuota` (001_schema.sql) ya registra el before/after completo de
-- la fila en cada UPDATE, automático, con usuario y fecha. `cuota_ajuste`
-- existe sólo porque `audit_log` no tiene lugar para el motivo ni el tipo, y
-- porque leer acá para una pantalla de historial es más simple que parsear
-- jsonb.
--
-- ── Qué asienta cada tipo: NADA, y es correcto ─────────────────────────────
--
-- La cuota nunca generó asiento (concepto 1: ingresos por percibido — el
-- ingreso nace en registrar_cobro, al cobrar). Editar, condonar o cancelar
-- una cuota impaga cambia PLANIFICACIÓN, no contabilidad: no hay Deudores
-- que revertir, no se toca caja, el P&L no se entera. Lo que sí cambia es lo
-- operativo —mora, cartera, cashflow esperado— y eso sale de `cuota`, que es
-- exactamente lo que estas funciones editan.

create table public.cuota_ajuste (
  id                uuid primary key default gen_random_uuid(),
  cuota_id          uuid not null references cuota(id),
  tipo              text not null default 'ajuste'
                      check (tipo in ('ajuste', 'condonacion', 'cancelacion')),
  monto_anterior    numeric(16,2) not null,
  monto_nuevo       numeric(16,2) not null,
  vence_at_anterior date not null,
  vence_at_nuevo    date not null,
  motivo            text not null,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);

comment on table public.cuota_ajuste is
  'Historial de ajustes, condonaciones y cancelaciones de cuota: qué cambió, '
  'de qué tipo, por qué, quién y cuándo. audit_log ya registra el '
  'before/after completo de la fila (trg_audit_cuota); esta tabla agrega el '
  'motivo y el tipo, que audit_log no distingue.';

alter table public.cuota_ajuste enable row level security;

-- select: los cuatro roles de oficina — la cuenta corriente del equipo
-- muestra la etiqueta Condonada/Cancelada y el historial, y la ven operador
-- y read-only además de admin/finanzas. Esconder la fila no esconde nada (el
-- saldo ya delata el ajuste); mostrarla explica.
create policy cuota_ajuste_select_rol on public.cuota_ajuste
  for select to authenticated
  using (auth_rol() = any (array['admin', 'finanzas', 'operador', 'read-only']));

-- insert: quien puede crear ajustes — y un cinturón por tipo: el operador
-- solo puede insertar filas tipo 'ajuste'. La guarda real vive en las
-- puertas; esto es la misma regla dicha en la capa de abajo, por si alguna
-- vez algo escribe sin pasar por ellas.
create policy cuota_ajuste_insert_rol on public.cuota_ajuste
  for insert to authenticated
  with check (
    auth_rol() = any (array['admin', 'finanzas', 'operador'])
    and (tipo = 'ajuste' or auth_rol() = any (array['admin', 'finanzas']))
  );
-- Sin UPDATE ni DELETE: un ajuste no se corrige editando su propio
-- registro — se hace OTRO ajuste, que queda como fila nueva. Mismo
-- principio que un asiento (regla 4), a escala de esta tabla chica.

-- ── El núcleo: toda la validación, ninguna guarda de rol ────────────────────
create or replace function public.ajustar_cuota_nucleo(
  p_cuota_id   uuid,
  p_motivo     text,
  p_monto      numeric,
  p_vence_at   date,
  p_tipo       text,
  p_created_by uuid
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
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'El ajuste necesita un motivo: por qué se cambia esta cuota.';
  end if;

  if p_tipo not in ('ajuste', 'condonacion', 'cancelacion') then
    raise exception
      'Tipo de ajuste inválido: "%". Los válidos son ajuste, condonacion y cancelacion.', p_tipo;
  end if;

  if p_tipo = 'cancelacion' then
    if p_monto is not null or p_vence_at is not null then
      raise exception
        'Cancelar no lleva monto ni vencimiento: saca la cuota del plan, no la edita.';
    end if;
  elsif p_monto is null and p_vence_at is null then
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

  -- Lo ya pagado: imputaciones directas + anticipo aplicado, el mismo
  -- cálculo que usan v_deuda_detalle y sync_cuota_pagada. Se necesita para
  -- los tres tipos: tope del ajuste, monto exacto de la condonación, y la
  -- exigencia de cero pagos de la cancelación.
  select coalesce(sum(pi.monto), 0)
       + coalesce((select sum(au.monto) from anticipo_uso au where au.cuota_id = p_cuota_id), 0)
    into v_imputado
    from pago_imputacion pi
   where pi.cuota_id = p_cuota_id;

  v_pagado_at_nuevo := null;

  if p_tipo = 'cancelacion' then
    -- Cancelar = la cuota nunca debió estar en el plan. Con un peso pagado
    -- eso ya no es cierto: hay plata real imputada acá, y "sacar la cuota"
    -- dejaría ese pago apuntando a una deuda que no existió. Para eso están
    -- los otros circuitos.
    if v_imputado > 0 then
      raise exception
        'Esta cuota ya tiene % pagado — no se cancela: condoná el remanente, '
        'o anulá los cobros primero si todo fue un error.',
        v_imputado;
    end if;

    v_monto_nuevo := 0;
    v_pagado_at_nuevo := current_date;

  elsif p_monto is not null then
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

    v_monto_nuevo := p_monto;
  elsif p_tipo = 'condonacion' then
    raise exception 'Una condonación necesita un monto — no hay nada que condonar sin eso.';
  else
    v_monto_nuevo := v_monto_anterior;
  end if;

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

comment on function public.ajustar_cuota_nucleo(uuid, text, numeric, date, text, uuid) is
  'El núcleo compartido de ajustar/condonar/cancelar cuota: toda la '
  'validación, ninguna guarda de rol. INTERNA — no se llama desde el front: '
  'las tres puertas (ajustar_cuota, condonar_cuota, cancelar_cuota) ponen la '
  'guarda y delegan acá con el tipo fijado. No genera asiento: la cuota '
  'nunca generó uno (percibido).';

-- ── Puerta 1 · editar — gestión diaria: admin, finanzas y operador ──────────
create or replace function public.ajustar_cuota(
  p_cuota_id   uuid,
  p_motivo     text,
  p_monto      numeric default null,
  p_vence_at   date default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas', 'operador'])) then
    raise exception
      'Editar una cuota es de administrador, finanzas u operador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  return ajustar_cuota_nucleo(p_cuota_id, p_motivo, p_monto, p_vence_at, 'ajuste', p_created_by);
end;
$function$;

comment on function public.ajustar_cuota(uuid, text, numeric, date, uuid) is
  'Editar monto y/o vencimiento de una cuota impaga, con motivo obligatorio. '
  'Reestructurar cómo paga un equipo es gestión diaria: admin, finanzas y '
  'operador. Rechaza cuotas pagadas, montos menores a lo ya pagado, '
  'vencimientos de cuotas de partido (vencen con su jornada), y el ajuste '
  'que de casualidad salda la cuota (eso es condonar, y se llama por su '
  'nombre). La validación vive en ajustar_cuota_nucleo.';

-- ── Puerta 2 · condonar — hace desaparecer deuda: admin y finanzas ──────────
create or replace function public.condonar_cuota(
  p_cuota_id   uuid,
  p_motivo     text,
  p_monto      numeric,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Condonar una cuota es de administrador o finanzas. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  -- p_monto es la CONFIRMACIÓN: tiene que ser exactamente lo ya pagado (el
  -- núcleo lo exige). Si entre que la pantalla leyó el saldo y este click
  -- entró un pago, los números ya no coinciden y la llamada falla — que es
  -- lo correcto: se estaría condonando otra cosa que la que se miró.
  return ajustar_cuota_nucleo(p_cuota_id, p_motivo, p_monto, null, 'condonacion', p_created_by);
end;
$function$;

comment on function public.condonar_cuota(uuid, text, numeric, uuid) is
  'Perdonar el saldo impago de una cuota: el monto queda exactamente en lo '
  'ya pagado y la cuota se salda (pagado_at = fecha del último pago real, u '
  'hoy si nunca se pagó nada). Solo admin y finanzas — hace desaparecer '
  'deuda. p_monto confirma lo ya pagado; si no coincide, rechaza. Queda en '
  'cuota_ajuste con tipo condonacion y fuera de v_cobranza_kpi.';

-- ── Puerta 3 · cancelar — saca del plan una cuota sin pagos: admin y finanzas ─
create or replace function public.cancelar_cuota(
  p_cuota_id   uuid,
  p_motivo     text,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Cancelar una cuota es de administrador o finanzas. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  return ajustar_cuota_nucleo(p_cuota_id, p_motivo, null, null, 'cancelacion', p_created_by);
end;
$function$;

comment on function public.cancelar_cuota(uuid, text, uuid) is
  'Sacar del plan una cuota impaga SIN ningún pago: monto a 0, saldada hoy, '
  'tipo cancelacion en cuota_ajuste y fuera de v_cobranza_kpi. Con un peso '
  'pagado rechaza (eso es condonar el remanente, o anular los cobros). Solo '
  'admin y finanzas — hace desaparecer deuda. La fila NO se borra: el '
  'historial la referencia, y una cuota que existió y se canceló son dos '
  'hechos (regla 4, a escala de cuota).';

-- ── v_cobranza_kpi: condonadas y canceladas afuera ──────────────────────────
--
-- Decisión de Facu (21/10), sobre el riesgo que Horacio dejó anotado: una
-- condonación NO es cobranza —ni lograda ni fallida—, así que sale entera
-- del KPI: del numerador (su plata cobrada no infla la tasa) y del
-- denominador (su monto no la deprime), y de dias_promedio_cobro (su
-- pagado_at no es un cobro real).
--
-- El corte es "el ÚLTIMO ajuste es condonacion/cancelacion Y la cuota sigue
-- saldada": si se reabrió (se anuló el pago que la completaba y
-- trg_sync_cuota_pagada le borró pagado_at), vuelve a contar — es deuda
-- real de nuevo. Mismo criterio que la etiqueta de la pantalla.
create or replace view v_cobranza_kpi as
select
  t.id as torneo_id,
  t.nombre,
  -- `comprometido`, no "devengado": renombrada el 05/08 (percibido puro —
  -- la cuota no devenga nada). create or replace exige conservar el nombre.
  sum(c.monto)                                   as comprometido,
  sum(coalesce(i.imputado, 0))                   as cobrado,
  round(100.0 * sum(coalesce(i.imputado,0))
        / nullif(sum(c.monto),0), 1)             as tasa_cobranza,
  round(avg(case when c.pagado_at is not null
                 then c.pagado_at - c.vence_at end), 1)
                                                 as dias_promedio_cobro,
  sum(case when c.vence_at >= current_date
           then c.monto - coalesce(i.imputado,0) else 0 end)
                                                 as por_vencer,
  sum(case when c.vence_at <  current_date
           then c.monto - coalesce(i.imputado,0) else 0 end)
                                                 as vencido
from cuota c
join equipo_torneo et on et.id = c.equipo_torneo_id
join torneo t         on t.id  = et.torneo_id
left join (
  select cuota_id, sum(monto) as imputado
    from pago_imputacion
   group by cuota_id
) i on i.cuota_id = c.id
where not (
  c.pagado_at is not null
  and exists (
    select 1
      from cuota_ajuste ca
     where ca.cuota_id = c.id
       and ca.tipo in ('condonacion', 'cancelacion')
       and ca.created_at = (select max(ca2.created_at)
                              from cuota_ajuste ca2
                             where ca2.cuota_id = c.id)
  )
)
group by t.id, t.nombre;

comment on view v_cobranza_kpi is
  'KPIs de cobranza por torneo, desde cuota (operativo, no contable): '
  '`comprometido` es la suma de cuota.monto según tarifario. Las '
  'cuotas condonadas o canceladas VIGENTES (último ajuste de ese tipo y '
  'todavía saldadas) quedan afuera entera: no son cobranza lograda ni '
  'fallida. Si una se reabre (pago anulado), vuelve a contar.';
