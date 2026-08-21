-- ═══════════════════════════════════════════════════════════════════════════
-- Los dos agregados del vs-real: por estado/tramo, y el acumulado por categoría
--
-- ⚠️ PROPUESTA · NO APLICADA.
--
-- ── Por qué no alcanza con la vista de detalle ─────────────────────────────
--
-- `v_presupuesto_vs_real` da una fila por (categoría, ámbito, mes). La pantalla
-- necesita totales, y por la regla 1 no los puede sumar el front.
--
-- ── Por qué agrupa por ESTADO y no da un total único ───────────────────────
--
-- Esto es lo importante de esta vista, y no es una decisión de presentación.
--
-- El desvío global sumado crudo da **−$126.500.000**, y eso NO significa que se
-- ahorraron 126 millones: son los 37 meses `sin_ejecutar` que **todavía no
-- pasaron**. Un total único acá produce un número plausible y falso — el peor
-- modo de falla, el mismo que ya nos mordió con el `× jornadas` del
-- presupuesto y con el doble conteo del estimado.
--
-- Los cuatro estados responden preguntas distintas y **no se suman entre sí**:
--
--   excedido         gasté de más en algo que planeé      → revisar el gasto
--   dentro           gasté menos de lo planeado           → puede ser bueno
--   sin_presupuesto  gasté en algo que NO planeé          → falta la línea
--   sin_ejecutar     todavía no gasté lo planeado         → no es un ahorro
--
-- ── El tramo · TRES valores, no dos ───────────────────────────────────────
--
--   pasado     meses ya cerrados
--   en_curso   el mes corriente
--   futuro     lo que no llegó
--
-- La separación de `pasado` y `en_curso` **no es cosmética**, y se decidió
-- midiendo. Los $42.000.000 de `sin_ejecutar` anteriores al futuro se reparten:
--
--     pasado (cerrado)   $32.900.000   14 filas — Alquileres y Sueldos adm.
--     mes en curso        $9.100.000    3 filas — + Guardias
--
-- El mes en curso es el **22%**, y significa algo distinto: todavía puede
-- ejecutarse. Un mes CERRADO con presupuesto y sin un solo gasto cargado es
-- una **señal de calidad de dato** —o no se cargó, o no se gastó— y merece
-- mirarse aparte. Mezclarlos exageraría la señal en un quinto.
--
-- El futuro se expone igual y no se filtra acá: esconderlo ocultaría cuánto
-- presupuesto queda por ejecutar. Lo que no hay que hacer es sumarlo con lo
-- ejecutado — eso es lo que produce el −$126.500.000.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_presupuesto_vs_real_kpi as
select
  case when v.mes >  date_trunc('month', current_date)::date then 'futuro'
       when v.mes =  date_trunc('month', current_date)::date then 'en_curso'
       else                                                      'pasado'
  end                                              as tramo,
  v.estado,
  count(*)::int                                    as filas,
  count(distinct v.cat_gasto_id)::int              as categorias,
  sum(v.presupuestado)::numeric(16,2)              as presupuestado,
  sum(v.real)::numeric(16,2)                       as real,
  sum(v.desvio)::numeric(16,2)                     as desvio
from v_presupuesto_vs_real v
group by 1, v.estado;

comment on view public.v_presupuesto_vs_real_kpi is
  'Totales del vs-real por (tramo, estado). El tramo tiene TRES valores '
  '—pasado, en_curso, futuro— y no dos: un mes CERRADO con presupuesto y sin '
  'gasto cargado es una señal de calidad de dato, mientras que el mes corriente '
  'todavía puede ejecutarse. NO da un total único a propósito: '
  'sumar los cuatro estados crudos da −$126.500.000, que se lee como «ahorramos '
  '126 millones» y son los meses que todavía no pasaron. Los estados responden '
  'preguntas distintas y no se suman: excedido (gasté de más en algo que '
  'planeé), dentro, sin_presupuesto (gasté en algo que no planeé) y '
  'sin_ejecutar (todavía no gasté, no es un ahorro). El tramo separa lo '
  'comparable —meses cerrados y el corriente— de lo que no llegó.';


-- ═══════════════════════════════════════════════════════════════════════════
-- v_presupuesto_vs_real_anual · el acumulado del año, por categoría
--
-- ── Por qué hace falta además del mensual ──────────────────────────────────
--
-- El prorrateo por calendario tiene dos supuestos que **el mensual exagera y el
-- acumulado neutraliza**:
--
--   · `por_mes` reparte uniforme. Un aguinaldo en junio y diciembre da
--     «excedido» esos dos meses y «dentro» los otros diez, sin que nada esté mal.
--   · `por_partido` asume que el gasto cae en el mes de la jornada. Si el
--     árbitro factura a 30 días, el real llega un mes tarde y **los dos meses
--     dan desvío**, uno de más y otro de menos, compensándose.
--
-- Mirado por año esos desfases desaparecen: la plata se gastó o no se gastó.
-- Por eso la pantalla muestra los dos y no uno — el mensual dice *cuándo*, el
-- anual dice *cuánto*.
--
-- El `estado` se recalcula sobre el acumulado, no se hereda: una categoría
-- puede tener meses «excedido» y cerrar el año «dentro», y esa es justamente la
-- información que el mensual no da.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_presupuesto_vs_real_anual as
select
  v.cat_gasto_id,
  v.categoria,
  v.naturaleza,
  v.torneo_id,
  v.ambito,
  v.es_estructura,

  sum(v.presupuestado)::numeric(16,2)                          as presupuestado,
  sum(v.real)::numeric(16,2)                                   as real,
  sum(v.desvio)::numeric(16,2)                                 as desvio,
  count(*) filter (where v.real > 0)::int                      as meses_con_gasto,
  count(*) filter (where v.estado = 'excedido')::int           as meses_excedidos,

  case when sum(v.presupuestado) = 0 then null
       else round(100 * sum(v.desvio) / sum(v.presupuestado), 2)
  end                                                          as desvio_pct,

  case
    when sum(v.presupuestado) = 0            then 'sin_presupuesto'
    when sum(v.real) = 0                     then 'sin_ejecutar'
    when sum(v.real) > sum(v.presupuestado)  then 'excedido'
    else                                          'dentro'
  end                                                          as estado

from v_presupuesto_vs_real v
group by v.cat_gasto_id, v.categoria, v.naturaleza, v.torneo_id, v.ambito, v.es_estructura;

comment on view public.v_presupuesto_vs_real_anual is
  'El vs-real acumulado del ejercicio, por (categoría, ámbito). Complementa al '
  'mensual y no lo reemplaza: el prorrateo por calendario supone que el gasto '
  'cae en el mes de su jornada o repartido uniforme, y un aguinaldo o una '
  'factura a 30 días desfasan el mensual sin que nada esté mal. El acumulado '
  'los neutraliza. `meses_excedidos` conserva lo que el acumulado esconde: una '
  'categoría puede cerrar el año dentro del presupuesto habiéndose pasado en '
  'algunos meses. El estado se recalcula sobre el total, no se hereda.';
