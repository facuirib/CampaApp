-- ═══════════════════════════════════════════════════════════════════════════
-- Los sueldos del cashflow salen de `tercero`, no de `sueldo_socio`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug vivo, introducido en 20260829140000. Esa versión hacía `from sueldo_socio`,
-- que es **una fila por VIGENCIA**: con una sola por socio funcionaba de
-- casualidad, pero en cuanto alguien cargara la segunda —«desde septiembre cobra
-- $2,5M»— el socio aparecía DOS veces por mes, con el sueldo nuevo y el viejo.
--
-- Medido en ROLLBACK insertando esa segunda vigencia:
--
--     antes del arreglo   $25.550.000 proyectados   (duplicaba)
--     lo correcto         $18.350.000
--     después             $18.350.000 ✅
--
-- Sobreproyectaba exactamente el sueldo viejo, y hacia el lado pesimista —el que
-- nadie cuestiona—. Sin la segunda vigencia el número no cambia: $15.550.000 y
-- saldo $186.809.500, igual que antes.
--
-- El arreglo es el `from`: `tercero` da una fila por socio, y `sueldo_vigente()`
-- resuelve cuál rige en cada mes, que es su trabajo. El neteo por socio queda
-- igual.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view v_cashflow_comprometido as

-- ① Cuotas de equipos con saldo (entrada)
select
  greatest(ec.vence_at, current_date) as fecha,
  ec.vence_at                         as fecha_original,
  'comprometido'::text                as nivel,
  'cuota_equipo'::text                as origen,
  t.nombre                            as detalle,
  ec.saldo                            as monto,
  ec.vence_at < current_date          as arrastrada,
  ec.id                               as origen_id,
  et.tercero_id
from v_estado_cuota ec
join equipo_torneo et on et.id = ec.equipo_torneo_id
join tercero t on t.id = et.tercero_id
where ec.saldo > 0 and ec.estado <> 'suspendida'

union all

-- ② Cuotas de sponsors sin cobrar (entrada)
select
  greatest(q.fecha_cobro, current_date), q.fecha_cobro,
  'comprometido', 'cuota_sponsor', q.sponsor, q.monto,
  q.fecha_cobro < current_date, q.cuota_id, q.sponsor_id
from v_cuotas_sponsor q
where q.cobrado_at is null

union all

-- ③ Compromisos pendientes (entrada o salida, según sentido)
select
  greatest(cm.vence_at, current_date), cm.vence_at,
  'comprometido', 'compromiso_' || cm.tipo, coalesce(t.nombre, cm.descripcion),
  case when cm.sentido = 'pagar' then -cm.monto else cm.monto end,
  cm.vence_at < current_date, cm.id, cm.tercero_id
from compromiso cm
left join tercero t on t.id = cm.tercero_id
where cm.estado = 'pendiente'

union all

-- ④ Cheques pendientes (entrada o salida, según sentido)
select
  greatest(ch.fecha_cobro, current_date), ch.fecha_cobro,
  'comprometido', 'cheque_' || ch.sentido, coalesce(t.nombre, 'Cheque ' || ch.numero),
  case when ch.sentido = 'emitido' then -ch.monto else ch.monto end,
  ch.fecha_cobro < current_date, ch.id, ch.tercero_id
from cheque ch
left join tercero t on t.id = ch.tercero_id
where ch.estado = 'pendiente'

union all

-- ⑤ Gastos devengados y no pagados (salida)
select
  greatest(g.devengado_at, current_date), g.devengado_at,
  'comprometido', 'gasto_impago', cg.nombre, -g.total,
  g.devengado_at < current_date, g.id, null::uuid
from gasto g
join cat_gasto cg on cg.id = g.cat_gasto_id
join v_gasto_detalle d on d.gasto_id = g.id
where g.pagado_at is null and g.devengado_at is not null and d.estado <> 'anulado'

union all

-- ⑥ Sueldos de socios ya devengados y no retirados (salida, exigible ya)
select
  current_date, current_date,
  'comprometido', 'sueldo_socio', t.nombre || ' · saldo a favor',
  -greatest(v.saldo, 0),
  true, v.socio_id, v.socio_id
from v_saldo_socio v
join tercero t on t.id = v.socio_id
where v.activo and v.saldo > 0

union all

-- ⑦ Sueldos de socios a devengar, mes a mes hasta el fin del ejercicio (salida)
--
-- El `least/greatest` es la absorción del adelanto: mientras el acumulado no
-- supere lo que el socio ya se llevó de más, el mes sale en cero o recortado.
select
  f.fin, f.fin,
  'comprometido', 'sueldo_socio', f.nombre || ' · sueldo ' || to_char(f.fin, 'MM/YYYY'),
  -least(f.sueldo, greatest(f.acumulado - f.adelanto, 0)),
  false, f.socio_id, f.socio_id
from (
  select
    t.id as socio_id,
    t.nombre,
    sueldo_vigente(t.id, m.fin) as sueldo,
    greatest(-v.saldo, 0) as adelanto,
    m.fin,
    sum(sueldo_vigente(t.id, m.fin)) over (partition by t.id order by m.fin) as acumulado
  from tercero t
  join v_saldo_socio v on v.socio_id = t.id
  cross join (
    select (date_trunc('month', d) + interval '1 month - 1 day')::date as fin
    from generate_series(
           date_trunc('month', current_date + interval '1 month'),
           date_trunc('month', (select max(fecha_hasta) from ejercicio)),
           '1 month') d
  ) m
  where t.tipo = 'socio' and t.activo
) f
where least(f.sueldo, greatest(f.acumulado - f.adelanto, 0)) > 0;

comment on view v_cashflow_comprometido is
  'Plata cierta con fecha: cuotas de equipos y sponsors por cobrar, compromisos, cheques, gastos devengados impagos y sueldos de socios. Los sueldos netean por socio —el adelanto de quien retiró de más se absorbe contra sus próximos meses— para no contarlo dos veces ni convertirlo en un ingreso.';
