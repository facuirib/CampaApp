-- ═══════════════════════════════════════════════════════════════════════════
-- v_presupuesto_vs_real · el desvío, mes a mes y por categoría
--
-- ⚠️ PROPUESTA · NO APLICADA.
--
-- Lee `v_presupuesto_total` (mía) y `v_gasto_categoria_mes` (de Horacio, con
-- `cat_gasto_id` y `torneo_id` desde 20260820180000 — sin esas dos columnas
-- esto sólo se podía unir por NOMBRE de categoría, y un renombre lo rompía en
-- silencio).
--
-- ── El problema, y por qué el prorrateo va escrito acá ─────────────────────
--
-- El presupuesto es un TOTAL DEL EJERCICIO sin fecha; el gasto real tiene
-- fecha. Para compararlos mes a mes hay que repartir el presupuesto, y cada
-- unidad se reparte distinto.
--
-- `v_cashflow_estimado` YA hace ese reparto —por jornadas, por días de cancha,
-- por mes— y la tentación es reusarlo. **No se puede, por tres razones:**
--
--   1. Viene NETEADO: descuenta el gasto real (el fix de doble conteo del
--      19-20/08). Restarle el real otra vez sería descontarlo dos veces.
--
--   2. Sólo mira el FUTURO (`fecha > CURRENT_DATE`): 5 meses de 12. Y el
--      vs-real vive en el pasado, que es donde hay gasto que comparar. Julio
--      no existe ahí, y julio tiene $2.200.000 de gasto real.
--
--   3. El mes en curso queda PARTIDO: agosto da $14.200.000 en el estimado
--      contra $26.350.000 de presupuesto real del mes — sólo cuenta las
--      jornadas que faltan. Comparar eso contra el real de agosto inventaría
--      un desvío de $12.150.000.
--
-- Así que el prorrateo se escribe de nuevo: **misma lógica de las tres ramas,
-- sin el filtro de futuro y sin el NOT EXISTS**.
--
-- ── La validación del método ───────────────────────────────────────────────
--
-- Un prorrateo es correcto si REPARTE el total sin perder ni inventar plata.
-- Verificado antes de escribir esto: los 12 meses suman **$139.300.000**, que
-- es exactamente `sum(v_presupuesto_total.total_presupuestado)`.
--
-- ── Por qué FULL OUTER JOIN y por qué `is not distinct from` ───────────────
--
-- FULL porque hay filas de los dos lados sin contraparte: categorías con
-- presupuesto y sin gasto (los meses que no llegaron), y categorías con gasto
-- y sin presupuesto (26 de 32 no están presupuestadas).
--
-- Y el join de `torneo_id` va con **`is not distinct from`**, no con `=`: el
-- ámbito «estructura permanente» es `torneo_id IS NULL` en las dos puntas, y
-- `NULL = NULL` es NULL — la fila se perdería **en silencio**. Hoy no se nota
-- porque no hay gasto real de estructura vigente; se nota el día que se cargue
-- el primer alquiler. Es el mismo cuidado que el `NULLS NOT DISTINCT` de los
-- unique de presupuesto.
--
-- ── Los cuatro estados ─────────────────────────────────────────────────────
--
--   sin_presupuesto  presupuestado = 0 y real > 0
--   sin_ejecutar     presupuestado > 0 y real = 0
--   excedido         real > presupuestado
--   dentro           real <= presupuestado, con los dos > 0
--
-- `sin_presupuesto` **no es un desvío del 100%**: es «esto nunca se
-- presupuestó», y son $4.100.000 hoy —el 46% del gasto real—. Mezclarlo con un
-- excedido de verdad distorsionaría cualquier total de desvío.
--
-- `sin_ejecutar` **no es un ahorro**: incluye los meses futuros, donde el
-- presupuesto simplemente no llegó a ejecutarse. Se incluyen a propósito
-- —esconderlos ocultaría el presupuesto que queda por gastar— y la pantalla
-- ofrece el corte «hasta el mes en curso».
--
-- ── Dos supuestos que conviene tener presentes ─────────────────────────────
--
-- · `por_mes` reparte UNIFORME. Un aguinaldo en junio y diciembre aparecería
--   como excedido en esos dos meses y como ahorro en los otros diez, sin que
--   nada esté mal.
-- · `por_partido` asume que el gasto cae en el mes de la jornada. Si el árbitro
--   factura a 30 días, el real aparece un mes después y **los dos meses dan
--   desvío**, compensándose entre sí.
--
-- Las dos se neutralizan mirando el ACUMULADO del año, que el mensual exagera.
-- Por eso la pantalla debería mostrar los dos.
--
-- El desvío se mide contra `total` (devengado) y no contra `pagado`: el
-- presupuesto es de GASTO, no de caja.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_presupuesto_vs_real as
with bruto as (
  -- ── por_partido · se reparte según las jornadas de cada mes ─────────────
  select date_trunc('month', j.fecha)::date            as mes,
         pt.cat_gasto_id,
         pt.torneo_id,
         pt.base * pt.cantidad *
           case when j.es_playoff then j.cantidad_partidos::numeric
                else ( select count(*)::numeric / 2::numeric
                         from equipo_torneo et where et.serie_id = j.serie_id)
           end                                          as monto
    from v_presupuesto_total pt
    join categoria c on c.torneo_id = pt.torneo_id
    join serie s     on s.categoria_id = c.id
    join jornada j   on j.serie_id = s.id
   where pt.unidad = 'por_partido'
     and j.estado <> 'suspendida'

  union all
  -- ── por_dia_cancha · según los días de cancha de cada mes ───────────────
  select date_trunc('month', dct.fecha)::date, pt.cat_gasto_id, pt.torneo_id,
         pt.base * pt.cantidad
    from v_presupuesto_total pt
    join v_dia_cancha_torneo dct on dct.torneo_id = pt.torneo_id
   where pt.unidad = 'por_dia_cancha'

  union all
  -- ── por_mes · uniforme, un mes por cada mes del ejercicio ───────────────
  select m.mes, pt.cat_gasto_id, pt.torneo_id, pt.base * pt.cantidad
    from v_presupuesto_total pt
    join ejercicio e on e.id = pt.ejercicio_id
    cross join lateral (
      select generate_series(
               date_trunc('month', e.fecha_desde::timestamptz),
               date_trunc('month', e.fecha_hasta::timestamptz),
               '1 mon')::date as mes) m
   where pt.unidad = 'por_mes'

  -- `anual` y `unico` quedan afuera a propósito: no tienen una fecha que los
  -- ubique en un mes, y repartirlos entre doce sería inventar un criterio.
  -- Hoy ninguna línea los usa; el día que aparezca, hay que decidirlo.
),
presupuesto_mes as (
  select mes, cat_gasto_id, torneo_id, sum(monto)::numeric(16,2) as presupuestado
    from bruto group by mes, cat_gasto_id, torneo_id
),
real_mes as (
  select make_date(anio, mes, 1) as mes,
         cat_gasto_id, torneo_id,
         sum(total)::numeric(16,2)    as real_devengado,
         sum(pagado)::numeric(16,2)   as real_pagado,
         sum(gastos)::int             as gastos
    from v_gasto_categoria_mes
   where cat_gasto_id is not null
   group by 1, cat_gasto_id, torneo_id
)
select
  coalesce(p.mes, r.mes)                               as mes,
  coalesce(p.cat_gasto_id, r.cat_gasto_id)             as cat_gasto_id,
  cg.nombre                                            as categoria,
  cg.naturaleza,
  coalesce(p.torneo_id, r.torneo_id)                   as torneo_id,
  coalesce(t.nombre, 'Estructura permanente')          as ambito,
  coalesce(p.torneo_id, r.torneo_id) is null           as es_estructura,

  coalesce(p.presupuestado, 0)::numeric(16,2)          as presupuestado,
  coalesce(r.real_devengado, 0)::numeric(16,2)         as real,
  coalesce(r.real_pagado, 0)::numeric(16,2)            as real_pagado,
  coalesce(r.gastos, 0)                                as gastos,

  -- Positivo = gastó de más. Es la lectura que interesa: el desvío se mira
  -- para saber cuánto se pasó, no cuánto sobró.
  (coalesce(r.real_devengado, 0) - coalesce(p.presupuestado, 0))::numeric(16,2)
                                                       as desvio,

  -- NULL y no infinito: sin presupuesto no hay porcentaje que calcular.
  case when coalesce(p.presupuestado, 0) = 0 then null
       else round(100 * (coalesce(r.real_devengado,0) - p.presupuestado)
                      / p.presupuestado, 2)
  end                                                  as desvio_pct,

  case
    when coalesce(p.presupuestado, 0) = 0                          then 'sin_presupuesto'
    when coalesce(r.real_devengado, 0) = 0                         then 'sin_ejecutar'
    when r.real_devengado > p.presupuestado                        then 'excedido'
    else                                                                'dentro'
  end                                                  as estado

from presupuesto_mes p
full outer join real_mes r
  on  r.mes          = p.mes
  and r.cat_gasto_id = p.cat_gasto_id
  -- `is not distinct from`: el ámbito estructura es NULL en las dos puntas.
  and r.torneo_id is not distinct from p.torneo_id
left join cat_gasto cg on cg.id = coalesce(p.cat_gasto_id, r.cat_gasto_id)
left join torneo t     on t.id  = coalesce(p.torneo_id, r.torneo_id);

comment on view public.v_presupuesto_vs_real is
  'Presupuesto contra gasto real, por (categoría, ámbito, mes). El presupuesto '
  'se prorratea por calendario —por_partido según las jornadas del mes, '
  'por_dia_cancha según los días, por_mes uniforme— y el reparto suma el total '
  'exacto del ejercicio. NO reusa v_cashflow_estimado: aquél viene neteado del '
  'gasto real, sólo cubre el futuro y parte el mes en curso. El desvío es real '
  'menos presupuestado (positivo = gastó de más) contra el DEVENGADO, porque el '
  'presupuesto es de gasto y no de caja. Cuatro estados: sin_presupuesto '
  '(nunca se presupuestó, no es un desvío del 100%), sin_ejecutar (incluye los '
  'meses futuros, no es un ahorro), excedido y dentro. `anual` y `unico` no se '
  'prorratean: no tienen fecha que los ubique.';
