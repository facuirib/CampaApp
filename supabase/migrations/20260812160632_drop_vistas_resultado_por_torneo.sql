-- ── Se van las dos vistas de resultado POR TORNEO ──────────────────────────
--
-- `v_resultado_producto` y `v_comparador_torneos` partían el resultado por
-- torneo, con «Estructura permanente» como una fila más. Eso contradice el
-- principio de negocio unificado (arquitectura.md §1.d): no hay rentabilidad
-- por torneo, predio ni categoría, porque repartir los costos compartidos
-- exigiría un criterio arbitrario.
--
-- Las reemplaza el P&L a nivel EMPRESA: v_pl_mensual + v_pl_mensual_item +
-- v_pl_mensual_total + v_pl_kpi.
--
-- ── Y `v_comparador_torneos` además estaba MAL ─────────────────────────────
--
-- Multiplicaba los importes por la cantidad de equipos: mostraba $481.936.000
-- de ingresos de Clausura contra los $17.212.000 reales — factor exacto 28,
-- que son los equipos. Un fan-out de join contra equipo_torneo.
--
-- No se arregla: se borra. Arreglar una vista que no debería existir es
-- trabajo que hay que volver a tirar, y el número correcto lo da la matriz.
--
-- Verificado antes de dropear: no las consume ninguna pantalla -la que las
-- usaba, /resultados, se reescribió en este mismo commit-, ninguna otra vista
-- ni función depende de ellas (pg_depend vacío), y la referencia que quedaba
-- en scripts/verificar.sql se cambió por v_pl_mensual.
--
-- Sin `cascade`, a propósito: si algo dependiera, queremos que falle acá y no
-- enterarnos por una pantalla rota.

drop view if exists public.v_resultado_producto;
drop view if exists public.v_comparador_torneos;
