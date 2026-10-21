-- Prueba de ajustar/condonar/cancelar cuota, autocontenida (begin/rollback),
-- roles reales. Nada de esto queda aplicado.
--
-- Versión AMPLIADA (21/10, decisión de Facu) del script original de Horacio:
-- tres puertas con permisos separados (editar: admin·finanzas·operador;
-- condonar/cancelar: admin·finanzas), tipo cancelacion, y v_cobranza_kpi
-- excluyendo condonadas/canceladas. Los casos 1-3 y 6-10 son los suyos, con
-- las llamadas adaptadas a las puertas; 4, 5 y 11 cambian de sentido o son
-- nuevos.
--
-- Cómo correrlo: pegar el archivo entero en el SQL Editor de Supabase (o
-- psql) y ejecutar de una vez. Cada RAISE EXCEPTION de un caso que falla
-- aborta la transacción en el acto, con el mensaje de qué caso fue. Si
-- todo pasa, el último RAISE EXCEPTION ('TODOS LOS CASOS OK') es el que se
-- ve — y como ya aborta la transacción él solo, el ROLLBACK final no deja
-- nada aplicado de todas formas.

begin;

-- ═══ La migración propuesta, entera (copia de
-- supabase/migrations/20261020120000_ajustar_cuota.sql — si editás una,
-- editá la otra) ═══

-- ═══════════════════════════════════════════════════════════════════════════
-- APLICADA EL 21/10/2026, CON OK DE FACU (script de prueba: TODOS LOS CASOS OK)
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


-- ═══ Setup: un usuario real para los tres roles ════════════════════════
do $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users limit 1;
  if v_uid is null then
    raise exception 'No hay usuarios en auth.users — no se puede simular un rol real.';
  end if;
  perform set_config('test.uid', v_uid::text, true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated',
                     'app_metadata', json_build_object('rol', 'admin'))::text, true);
set local role authenticated;

-- ── Caso 1 · admin ajusta monto Y vencimiento de una cuota impaga sin pagos ──
do $$
declare
  v_cuota_id uuid; v_monto_viejo numeric; v_vence_viejo date;
  v_ajuste_id uuid; v_fila record;
begin
  select id, monto, vence_at into v_cuota_id, v_monto_viejo, v_vence_viejo
    from cuota
   where pagado_at is null
     and not exists (select 1 from pago_imputacion where cuota_id = cuota.id)
     and not exists (select 1 from anticipo_uso where cuota_id = cuota.id)
   limit 1;
  if v_cuota_id is null then
    raise exception 'No hay ninguna cuota impaga sin pagos para probar — sembrá datos antes.';
  end if;

  v_ajuste_id := ajustar_cuota(v_cuota_id, 'Prueba: corrección de monto y fecha',
                                v_monto_viejo + 1000, v_vence_viejo + 7);

  select * into v_fila from cuota_ajuste where id = v_ajuste_id;
  if v_fila.tipo <> 'ajuste' then
    raise exception 'FALLÓ caso 1: tipo quedó "%", esperaba "ajuste"', v_fila.tipo;
  end if;
  if v_fila.monto_anterior <> v_monto_viejo or v_fila.monto_nuevo <> v_monto_viejo + 1000 then
    raise exception 'FALLÓ caso 1: montos anterior/nuevo no coinciden';
  end if;
  if v_fila.vence_at_anterior <> v_vence_viejo or v_fila.vence_at_nuevo <> v_vence_viejo + 7 then
    raise exception 'FALLÓ caso 1: vencimientos anterior/nuevo no coinciden';
  end if;
  if v_fila.created_by is null then
    raise exception 'FALLÓ caso 1: created_by quedó null';
  end if;

  perform set_config('test.cuota1', v_cuota_id::text, true);
  raise notice 'OK caso 1: admin ajusta, cuota_ajuste queda con tipo/anterior/nuevo/usuario/fecha';
end $$;

-- ── Caso 2 · sin motivo, rechazado ──────────────────────────────────────────
do $$
declare v_fallo boolean := false;
begin
  begin
    perform ajustar_cuota(current_setting('test.cuota1')::uuid, '', 999999);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%motivo%' then
      raise exception 'FALLÓ caso 2: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 2: aceptó sin motivo'; end if;
  raise notice 'OK caso 2: sin motivo, rechazado';
end $$;

-- ── Caso 3 · ni monto ni vencimiento, rechazado ──────────────────────────────
do $$
declare v_fallo boolean := false;
begin
  begin
    perform ajustar_cuota(current_setting('test.cuota1')::uuid, 'Motivo sin cambios');
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%no hay nada para ajustar%' then
      raise exception 'FALLÓ caso 3: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 3: aceptó sin cambios'; end if;
  raise notice 'OK caso 3: sin monto ni vencimiento, rechazado';
end $$;

-- ── Caso 4 · finanzas AHORA edita (antes: rechazado — Facu separó permisos) ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated',
                     'app_metadata', json_build_object('rol', 'finanzas'))::text, true);
do $$
declare v_ajuste_id uuid;
begin
  v_ajuste_id := ajustar_cuota(current_setting('test.cuota1')::uuid,
                               'Ajuste de finanzas: reestructuración', 777777);
  if (select tipo from cuota_ajuste where id = v_ajuste_id) <> 'ajuste' then
    raise exception 'FALLÓ caso 4: el ajuste de finanzas no quedó registrado';
  end if;
  raise notice 'OK caso 4: finanzas edita una cuota (permiso separado)';
end $$;

-- ── Caso 5 · operador: edita SÍ · condona NO · cancela NO · ve historial ────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated',
                     'app_metadata', json_build_object('rol', 'operador'))::text, true);
do $$
declare v_fallo boolean := false; v_filas int; v_ajuste_id uuid;
begin
  -- 5a · edita
  v_ajuste_id := ajustar_cuota(current_setting('test.cuota1')::uuid,
                               'Ajuste de operador: renegociación con el equipo', 888888);
  if v_ajuste_id is null then raise exception 'FALLÓ caso 5a: operador no pudo editar'; end if;

  -- 5b · condonar, rechazado por rol
  begin
    perform condonar_cuota(current_setting('test.cuota1')::uuid, 'Intento de operador', 0);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%administrador o finanzas%' then
      raise exception 'FALLÓ caso 5b: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 5b: operador pudo condonar'; end if;

  -- 5c · cancelar, rechazado por rol
  begin
    perform cancelar_cuota(current_setting('test.cuota1')::uuid, 'Intento de operador');
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%administrador o finanzas%' then
      raise exception 'FALLÓ caso 5c: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 5c: operador pudo cancelar'; end if;

  -- 5d · ve el historial (la cuenta corriente le muestra la etiqueta)
  select count(*) into v_filas from cuota_ajuste;
  if v_filas = 0 then
    raise exception 'FALLÓ caso 5d: operador ve 0 filas en cuota_ajuste, esperaba al menos 1';
  end if;
  raise notice 'OK caso 5: operador edita; condonar y cancelar rechazados; ve % fila(s) de historial', v_filas;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated',
                     'app_metadata', json_build_object('rol', 'admin'))::text, true);

-- ── Caso 6 · ajuste normal que coincide con lo pagado, rechazado ────────────
-- (pide usar Condonar) · y de paso, monto menor a lo pagado, también
-- rechazado · y el ajuste válido (mayor, no igual) sí se acepta.
do $$
declare
  v_cuota_id uuid; v_tercero_id uuid; v_monto numeric;
  v_pago_id uuid; v_fallo boolean := false;
begin
  select c.id, c.monto, et.tercero_id into v_cuota_id, v_monto, v_tercero_id
    from cuota c join equipo_torneo et on et.id = c.equipo_torneo_id
   where c.pagado_at is null and c.monto > 100
     and c.id <> current_setting('test.cuota1')::uuid
     and not exists (select 1 from pago_imputacion where cuota_id = c.id)
     and not exists (select 1 from anticipo_uso where cuota_id = c.id)
   limit 1;
  if v_cuota_id is null then raise exception 'No hay otra cuota impaga disponible para el caso 6'; end if;

  insert into pago (tercero_id, fecha, monto, medio_pago, registrado_por)
  values (v_tercero_id, current_date, v_monto / 2, 'transferencia', current_setting('test.uid')::uuid)
  returning id into v_pago_id;
  insert into pago_imputacion (pago_id, cuota_id, monto) values (v_pago_id, v_cuota_id, v_monto / 2);

  -- 6a · monto menor a lo pagado, rechazado
  begin
    perform ajustar_cuota(v_cuota_id, 'Intento de bajar por debajo de lo pagado', (v_monto / 2) - 10);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%no puede ser menor que lo ya pagado%' then
      raise exception 'FALLÓ caso 6a: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 6a: aceptó un monto menor al pagado'; end if;

  -- 6b · ajuste normal que coincide con lo pagado, rechazado — pide Condonar
  v_fallo := false;
  begin
    perform ajustar_cuota(v_cuota_id, 'Ajuste que por error salda la cuota', v_monto / 2);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%usá "Condonar"%' then
      raise exception 'FALLÓ caso 6b: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 6b: un ajuste normal pudo saldar la cuota'; end if;

  -- 6c · ajuste válido (mayor a lo pagado, no igual) — aceptado
  perform ajustar_cuota(v_cuota_id, 'Ajuste válido, mayor a lo pagado', (v_monto / 2) + 500);

  perform set_config('test.cuota2', v_cuota_id::text, true);
  perform set_config('test.cuota2_imputado', (v_monto / 2)::text, true);
  raise notice 'OK caso 6: menor a lo pagado rechazado; ajuste=lo pagado rechazado (pide Condonar); ajuste válido aceptado';
end $$;

-- ── Caso 7 · condonación con monto distinto a lo pagado, rechazada; cancelar
--    una cuota CON pagos, rechazado ─────────────────────────────────────────
do $$
declare v_cuota_id uuid; v_imputado numeric; v_fallo boolean := false;
begin
  v_cuota_id := current_setting('test.cuota2')::uuid;
  v_imputado := current_setting('test.cuota2_imputado')::numeric;

  begin
    perform condonar_cuota(v_cuota_id, 'Condonación con monto incorrecto', v_imputado + 1);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%exactamente a lo ya pagado%' then
      raise exception 'FALLÓ caso 7a: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 7a: condonación con monto incorrecto fue aceptada'; end if;

  v_fallo := false;
  begin
    perform cancelar_cuota(v_cuota_id, 'Cancelar una cuota que ya tiene pagos');
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%condoná el remanente%' then
      raise exception 'FALLÓ caso 7b: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 7b: se pudo cancelar una cuota con pagos'; end if;

  raise notice 'OK caso 7: condonación con monto incorrecto y cancelación con pagos, ambas rechazadas';
end $$;

-- ── Caso 8 · condonación pura (sin ningún pago) ─────────────────────────────
do $$
declare
  v_cuota_id uuid; v_ajuste_id uuid; v_saldo numeric; v_pagado_at date;
begin
  select id into v_cuota_id
    from cuota
   where pagado_at is null
     and not exists (select 1 from pago_imputacion where cuota_id = cuota.id)
     and not exists (select 1 from anticipo_uso where cuota_id = cuota.id)
     and id not in (current_setting('test.cuota1')::uuid, current_setting('test.cuota2')::uuid)
   limit 1;
  if v_cuota_id is null then raise exception 'No hay otra cuota impaga sin pagos para el caso 8'; end if;

  v_ajuste_id := condonar_cuota(v_cuota_id, 'Condonación pura, nunca se pagó nada', 0);

  if (select tipo from cuota_ajuste where id = v_ajuste_id) <> 'condonacion' then
    raise exception 'FALLÓ caso 8: cuota_ajuste.tipo no quedó en condonacion';
  end if;

  select pagado_at into v_pagado_at from cuota where id = v_cuota_id;
  if v_pagado_at is distinct from current_date then
    raise exception 'FALLÓ caso 8: pagado_at quedó en %, esperaba hoy (%)', v_pagado_at, current_date;
  end if;

  select saldo into v_saldo from v_deuda_detalle where cuota_id = v_cuota_id;
  if v_saldo <> 0 then
    raise exception 'FALLÓ caso 8: v_deuda_detalle.saldo quedó en %, esperaba 0', v_saldo;
  end if;

  raise notice 'OK caso 8: condonación pura — pagado_at = hoy, saldo = 0 en v_deuda_detalle';
end $$;

-- ── Caso 8b · cancelar una cuota virgen: monto 0, saldada hoy, tipo cancelacion ──
do $$
declare
  v_cuota_id uuid; v_ajuste_id uuid; v_fila record; v_saldo numeric;
begin
  select id into v_cuota_id
    from cuota
   where pagado_at is null
     and not exists (select 1 from pago_imputacion where cuota_id = cuota.id)
     and not exists (select 1 from anticipo_uso where cuota_id = cuota.id)
     and id not in (current_setting('test.cuota1')::uuid, current_setting('test.cuota2')::uuid)
   limit 1;
  if v_cuota_id is null then raise exception 'No hay otra cuota impaga sin pagos para el caso 8b'; end if;

  v_ajuste_id := cancelar_cuota(v_cuota_id, 'Esta cuota no correspondía al plan');

  select * into v_fila from cuota_ajuste where id = v_ajuste_id;
  if v_fila.tipo <> 'cancelacion' then
    raise exception 'FALLÓ caso 8b: tipo quedó "%", esperaba cancelacion', v_fila.tipo;
  end if;
  if v_fila.monto_nuevo <> 0 then
    raise exception 'FALLÓ caso 8b: monto_nuevo quedó en %, esperaba 0', v_fila.monto_nuevo;
  end if;
  if (select monto from cuota where id = v_cuota_id) <> 0 then
    raise exception 'FALLÓ caso 8b: cuota.monto no quedó en 0';
  end if;
  if (select pagado_at from cuota where id = v_cuota_id) is distinct from current_date then
    raise exception 'FALLÓ caso 8b: pagado_at no quedó en hoy';
  end if;
  select saldo into v_saldo from v_deuda_detalle where cuota_id = v_cuota_id;
  if coalesce(v_saldo, 0) <> 0 then
    raise exception 'FALLÓ caso 8b: saldo quedó en %, esperaba 0', v_saldo;
  end if;

  raise notice 'OK caso 8b: cancelación — monto 0, pagado_at hoy, tipo cancelacion, saldo 0';
end $$;

-- ── Caso 9 · vencimiento sobre cuota de partido, rechazado ──────────────────
do $$
declare v_cuota_id uuid; v_fallo boolean := false;
begin
  select id into v_cuota_id
    from cuota
   where pagado_at is null and jornada_id is not null
   limit 1;
  if v_cuota_id is null then
    raise exception 'No hay ninguna cuota de partido (jornada_id not null) impaga para el caso 9';
  end if;

  begin
    perform ajustar_cuota(v_cuota_id, 'Intento de mover el vencimiento a mano', null, current_date + 10);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%vence con su jornada%' then
      raise exception 'FALLÓ caso 9: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 9: se pudo mover el vencimiento de una cuota de partido'; end if;
  raise notice 'OK caso 9: vencimiento de cuota de partido rechazado';
end $$;

-- ── Caso 10 · condonar el remanente de un pago parcial REAL, y reabrir
--    anulando ese pago ──────────────────────────────────────────────────────
do $$
declare
  v_cuota_id uuid; v_tercero_id uuid; v_monto numeric;
  v_pago_id uuid; v_ajuste_id uuid;
  v_pagado_at date; v_saldo numeric;
begin
  select c.id, c.monto, et.tercero_id into v_cuota_id, v_monto, v_tercero_id
    from cuota c join equipo_torneo et on et.id = c.equipo_torneo_id
   where c.pagado_at is null and c.monto > 100
     and c.id not in (current_setting('test.cuota1')::uuid, current_setting('test.cuota2')::uuid)
     and not exists (select 1 from pago_imputacion where cuota_id = c.id)
     and not exists (select 1 from anticipo_uso where cuota_id = c.id)
   limit 1;
  if v_cuota_id is null then raise exception 'No hay otra cuota impaga disponible para el caso 10'; end if;

  -- Pago real, vía registrar_cobro (no un insert directo): necesita
  -- asiento_id para que anular_pago lo acepte después. Fecha distinta de
  -- hoy, a propósito, para distinguir "la fecha del pago real" de "hoy"
  -- cuando se verifique pagado_at más abajo.
  v_pago_id := registrar_cobro(
    p_tercero_id   => v_tercero_id,
    p_monto        => v_monto / 2,
    p_medio        => 'transferencia',
    p_fecha        => current_date - 5,
    p_imputaciones => jsonb_build_array(jsonb_build_object('cuota_id', v_cuota_id, 'monto', v_monto / 2)),
    p_responsable_id => current_setting('test.uid')::uuid
  );

  v_ajuste_id := condonar_cuota(v_cuota_id, 'Condono el remanente de este pago parcial', v_monto / 2);

  select pagado_at into v_pagado_at from cuota where id = v_cuota_id;
  if v_pagado_at is distinct from (current_date - 5) then
    raise exception
      'FALLÓ caso 10a: pagado_at quedó en %, esperaba la fecha del pago real (%)',
      v_pagado_at, current_date - 5;
  end if;

  select saldo into v_saldo from v_deuda_detalle where cuota_id = v_cuota_id;
  if v_saldo <> 0 then
    raise exception 'FALLÓ caso 10a: v_deuda_detalle.saldo quedó en %, esperaba 0', v_saldo;
  end if;

  -- Reabrir: anular el pago real borra su pago_imputacion, y
  -- trg_sync_cuota_pagada recalcula sola —el monto de la cuota sigue en lo
  -- condonado, así que con 0 imputado el saldo vuelve a ser positivo.
  perform anular_pago(v_pago_id, 'Prueba: reabrir la cuota condonada');

  select pagado_at into v_pagado_at from cuota where id = v_cuota_id;
  if v_pagado_at is not null then
    raise exception 'FALLÓ caso 10b: pagado_at sigue en % después de anular el pago, esperaba null', v_pagado_at;
  end if;

  select saldo into v_saldo from v_deuda_detalle where cuota_id = v_cuota_id;
  if v_saldo <= 0 then
    raise exception 'FALLÓ caso 10b: v_deuda_detalle.saldo quedó en %, esperaba > 0', v_saldo;
  end if;

  raise notice
    'OK caso 10: condonación del remanente de un pago real queda saldada con la fecha del pago (%); '
    'anular ese pago la reabre (pagado_at null, saldo % > 0)',
    current_date - 5, v_saldo;
end $$;

-- ── Caso 11 · v_cobranza_kpi excluye la condonada ENTERA (num y denom) ──────
--
-- cuota2 quedó del caso 6 con un pago parcial real (imputado) y monto =
-- imputado + 500. Si la exclusión funciona, al condonarla el KPI pierde su
-- monto COMPLETO del comprometido (no solo los 500 perdonados) y su imputado
-- del cobrado — salió entera, no cuenta como cobrada ni como incobrable.
do $$
declare
  v_cuota_id uuid; v_imputado numeric; v_torneo_id uuid;
  v_dev0 numeric; v_cob0 numeric; v_dev1 numeric; v_cob1 numeric;
begin
  v_cuota_id := current_setting('test.cuota2')::uuid;
  v_imputado := current_setting('test.cuota2_imputado')::numeric;
  select et.torneo_id into v_torneo_id
    from cuota c join equipo_torneo et on et.id = c.equipo_torneo_id
   where c.id = v_cuota_id;

  select comprometido, cobrado into v_dev0, v_cob0 from v_cobranza_kpi where torneo_id = v_torneo_id;

  perform condonar_cuota(v_cuota_id, 'Condonación para probar la exclusión del KPI', v_imputado);

  select comprometido, cobrado into v_dev1, v_cob1 from v_cobranza_kpi where torneo_id = v_torneo_id;

  if v_dev1 <> v_dev0 - (v_imputado + 500) then
    raise exception
      'FALLÓ caso 11: comprometido pasó de % a %, esperaba que bajara el monto entero (%)',
      v_dev0, v_dev1, v_imputado + 500;
  end if;
  if v_cob1 <> v_cob0 - v_imputado then
    raise exception
      'FALLÓ caso 11: cobrado pasó de % a %, esperaba que bajara lo imputado (%)',
      v_cob0, v_cob1, v_imputado;
  end if;

  raise notice 'OK caso 11: la condonada salió entera del KPI (comprometido -%, cobrado -%)',
    v_imputado + 500, v_imputado;
end $$;

reset role;

-- Si llegaste hasta acá sin que nada abortara antes, los casos (1 a 11, con
-- subcasos en 5, 6, 7 y 8) pasaron.
do $$ begin raise exception 'TODOS LOS CASOS OK'; end $$;

rollback;
