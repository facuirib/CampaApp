-- ═══════════════════════════════════════════════════════════════════════════
-- v_presupuesto_vs_real_kpi · agregar el rollup por CORTE
--
-- ⚠️ PROPUESTA · NO APLICADA.
--
-- ── Qué le faltaba ─────────────────────────────────────────────────────────
--
-- La vista agrupa por `(tramo, estado)` con tramo ∈ pasado · en_curso · futuro.
-- La pantalla ofrece dos cortes —«hasta hoy» y «año completo»— y **«hasta hoy»
-- son DOS tramos**, así que para mostrar un número por estado el front tendría
-- que sumar `pasado + en_curso`.
--
-- Eso es exactamente lo que la regla 1 prohíbe, y no es un tecnicismo: hoy son
-- dos filas, mañana alguien agrega un tramo y la suma del front queda corta sin
-- que nada avise.
--
-- ── El arreglo ─────────────────────────────────────────────────────────────
--
-- La vista pasa a emitir TRES niveles en la misma columna `tramo`:
--
--     pasado · en_curso · futuro    los tramos, como hasta ahora
--     hasta_hoy                     el rollup de pasado + en_curso
--     todo                          el rollup de los tres
--
-- La pantalla elige la fila que necesita y no suma nada. Los tramos finos
-- siguen expuestos porque la señal de calidad de dato —presupuesto en meses
-- CERRADOS sin gasto cargado— vive en `pasado` y se perdería en el rollup.
--
-- Que las filas se solapen es deliberado: **no hay que sumar esta vista
-- entera**, hay que elegir un nivel. El comentario lo dice para que nadie
-- intente totalizarla.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_presupuesto_vs_real_kpi as
with clasificado as (
  select
    case when v.mes >  date_trunc('month', current_date)::date then 'futuro'
         when v.mes =  date_trunc('month', current_date)::date then 'en_curso'
         else                                                       'pasado'
    end as tramo,
    v.*
  from v_presupuesto_vs_real v
),
niveles as (
  -- el tramo fino
  select tramo, estado, cat_gasto_id, presupuestado, real, desvio from clasificado
  union all
  -- el rollup comparable
  select 'hasta_hoy', estado, cat_gasto_id, presupuestado, real, desvio
    from clasificado where tramo in ('pasado', 'en_curso')
  union all
  -- el rollup completo
  select 'todo', estado, cat_gasto_id, presupuestado, real, desvio from clasificado
)
select
  tramo,
  estado,
  count(*)::int                       as filas,
  count(distinct cat_gasto_id)::int   as categorias,
  sum(presupuestado)::numeric(16,2)   as presupuestado,
  sum(real)::numeric(16,2)            as real,
  sum(desvio)::numeric(16,2)          as desvio
from niveles
group by tramo, estado;

comment on view public.v_presupuesto_vs_real_kpi is
  'Totales del vs-real por (tramo, estado). `tramo` tiene CINCO valores en dos '
  'niveles: los finos —pasado, en_curso, futuro— y los rollups —hasta_hoy '
  '(pasado+en_curso) y todo—. LAS FILAS SE SOLAPAN A PROPÓSITO: hay que ELEGIR '
  'un nivel, nunca sumar la vista entera. Los tramos finos existen porque la '
  'señal de calidad de dato —presupuesto en meses CERRADOS sin gasto cargado— '
  'vive en `pasado` y el rollup la esconde. Y no hay total por tramo entre '
  'estados a propósito: sumar los cuatro da −$126.500.000, que se lee como un '
  'ahorro y son los meses que no pasaron.';
