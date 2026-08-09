-- ═══════════════════════════════════════════════════════════════════════════
-- v_resultado_cambio_total — el resultado por diferencia de cambio, en una fila
--
-- `v_resultado_cambio` es por PERÍODO, y la pantalla de USD necesita además el
-- acumulado para un KpiCard. Sin esta vista habría que sumar los meses en el
-- front, que es exactamente el `.reduce()` que la regla 1 prohíbe.
--
-- Suma `v_resultado_cambio` y no `asiento_linea` directamente, por el mismo
-- motivo que `v_sponsor_kpi` suma `v_sponsor_lista`: el KpiCard de arriba y la
-- tabla mensual de abajo salen de la MISMA fuente, así que no pueden discrepar
-- ni aunque mañana la vista mensual cambie de criterio.
--
-- Es una agregación sin `group by`: devuelve UNA fila siempre, también sin
-- operaciones —con ceros y `meses = 0`—, así que la pantalla nunca se queda sin
-- el número.
--
-- Sólo lectura, aditiva: no toca `usd_operacion`, ni el diario, ni las vistas
-- que ya existen.
--
-- ── Qué NO es este número ──────────────────────────────────────────────────
--
-- Es resultado REALIZADO, y sólo eso. `FIN_DIF_CAMBIO` la escribe únicamente
-- `vender_usd`, cuando compara lo recibido contra la salida a promedio
-- ponderado; `comprar_usd` no la toca. Una suba del dólar con los dólares
-- todavía en caja no aparece acá y no tiene que aparecer: no se ganó nada
-- hasta que se vende.
--
-- El sistema además no puede calcular una tenencia a valor de mercado aunque
-- quisiera: no hay ninguna cotización del día en el schema. La valuación es al
-- costo (§3.7).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_resultado_cambio_total as
select
  coalesce(sum(resultado), 0)  as resultado,
  coalesce(sum(ganancias), 0)  as ganancias,
  coalesce(sum(perdidas), 0)   as perdidas,
  count(*)                     as meses
from v_resultado_cambio;

comment on view public.v_resultado_cambio_total is
  'El resultado por diferencia de cambio acumulado, en una fila, para el KPI de '
  '/usd. Suma v_resultado_cambio para que el KpiCard y la tabla mensual no '
  'puedan discrepar. Es resultado REALIZADO: sólo lo escribe vender_usd.';
