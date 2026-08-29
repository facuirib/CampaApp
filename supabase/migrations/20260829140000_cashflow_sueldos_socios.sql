-- ═══════════════════════════════════════════════════════════════════════════
-- Los sueldos de socios entran al cashflow como salida COMPROMETIDA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Era la única fuente cierta que la proyección no veía. `v_cashflow_comprometido`
-- ya traía salidas —`compromiso`, `cheque_emitido`, `gasto_impago`— pero ninguna
-- daba filas: los 13 gastos impagos están todos anulados, y no hay cheques ni
-- compromisos pendientes. Los sueldos, en cambio, faltaban de verdad.
--
-- Faltaban por una razón concreta: `devengar_sueldos_socios` escribe **asiento
-- directo y no pasa por `gasto`**. Por eso no aparecen en `gasto_impago`, y
-- tampoco en el presupuesto —la línea «Sueldos administrativos» es de empleados,
-- no de los dueños—. **Y por eso mismo no puede haber doble conteo con el
-- estimado: los sueldos de socios no tocan ninguna de las tablas de las que el
-- estimado deriva.**
--
-- ── El neteo por socio, que es lo que hace que el número sea correcto ─────
--
-- Un socio puede haber retirado MÁS de lo devengado. Es un adelanto, y trae dos
-- trampas si se lo ignora:
--
--   · Proyectar su sueldo futuro completo cuenta **dos veces** la plata que ya
--     se llevó.
--   · Proyectar su saldo negativo como salida lo convierte en un **ingreso** —
--     como si fuera a devolverla, que no va a pasar.
--
-- Se resuelve absorbiendo el adelanto contra los primeros sueldos, que es lo que
-- ocurre en la realidad: el mes que viene cobra menos hasta emparejar. Con Agus
-- —$450.000 de adelanto sobre un sueldo de $1.350.000— septiembre sale $900.000
-- y los demás meses completos.
--
--   salida_total(socio) = max(0, saldo + Σ sueldos futuros)
--
-- Guille: 3.400.000 + 4 × 1.800.000 = 10.600.000
-- Agus:    −450.000 + 4 × 1.350.000 =  4.950.000
--
-- ── Las dos clases de fila ────────────────────────────────────────────────
--
-- · **El saldo ya devengado y no retirado** va en `CURRENT_DATE` con
--   `arrastrada = true`. No tiene fecha propia —el socio retira cuando quiere—
--   y la lectura prudente para una proyección de caja es que lo exigible en
--   cualquier momento se proyecte como exigible ya. Es el mismo idioma que la
--   vista usa para lo vencido.
--
-- · **Los sueldos futuros**, uno por socio y por mes, hasta el fin del
--   ejercicio. Hasta el ejercicio y no hasta la última jornada: el sueldo se
--   paga corra o no el torneo.
--
-- ── Alcance ──────────────────────────────────────────────────────────────
--
-- Sólo esta vista. `v_cashflow`, `v_cashflow_mensual` y `v_cashflow_quiebre`
-- derivan de ella y heredan las salidas sin tocarlas.
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
    s.socio_id,
    t.nombre,
    s.monto as sueldo,
    greatest(-v.saldo, 0) as adelanto,
    m.fin,
    sum(s.monto) over (partition by s.socio_id order by m.fin) as acumulado
  from sueldo_socio s
  join tercero t on t.id = s.socio_id
  join v_saldo_socio v on v.socio_id = s.socio_id
  cross join (
    select (date_trunc('month', d) + interval '1 month - 1 day')::date as fin
    from generate_series(
           date_trunc('month', current_date + interval '1 month'),
           date_trunc('month', (select max(fecha_hasta) from ejercicio)),
           '1 month') d
  ) m
  where t.activo
) f
where least(f.sueldo, greatest(f.acumulado - f.adelanto, 0)) > 0;

comment on view v_cashflow_comprometido is
  'Plata cierta con fecha: cuotas de equipos y sponsors por cobrar, compromisos, cheques, gastos devengados impagos y sueldos de socios. Los sueldos netean por socio —el adelanto de quien retiró de más se absorbe contra sus próximos meses— para no contarlo dos veces ni convertirlo en un ingreso.';
