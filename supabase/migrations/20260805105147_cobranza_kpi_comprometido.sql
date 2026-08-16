-- ============================================================================
-- CAMPA · v_cobranza_kpi: `devengado` pasa a llamarse `comprometido`
--
-- Bajo percibido puro (decisión 1) una cuota NO devenga nada: el único evento
-- contable de ingreso es el cobro. Esa columna es `sum(cuota.monto)`, o sea
-- LO COMPROMETIDO según el tarifario — un número operativo, no contable.
--
-- Llamarlo "devengado" invita a leerlo como si estuviera en el libro diario, y
-- no está: las cuotas no generan asiento.
--
-- ── Por qué ALTER VIEW y no CREATE OR REPLACE ───────────────────────────────
--
-- `create or replace view` NO PUEDE renombrar columnas: Postgres responde
-- "cannot change name of view column". La alternativa sería drop + create,
-- que obliga a retranscribir el cuerpo entero de la vista y abre la puerta a
-- que se cuele un cambio no intencional.
--
-- `alter view ... rename column` toca EXCLUSIVAMENTE el nombre de la columna.
-- El resto de la definición queda garantizadamente intacto, que es justo lo que
-- un renombre quirúrgico necesita.
--
-- ── Alcance: solo esta vista ────────────────────────────────────────────────
--
-- `devengado` existe en CUATRO vistas y en tres es CORRECTO. NO se tocan:
--
--   · v_saldo_socio.devengado           socios devengan de verdad (decisión 68)
--   · v_socio_detalle_mensual.devengado ídem
--   · v_estado_sponsor.devengado        devengo lineal (decisión 73)
--
-- Un find-and-replace de "devengado" rompería la semántica correcta de esas
-- tres. Por eso el renombre va por ALTER de una columna puntual y no por una
-- pasada global.
--
-- ── Seguridad del cambio ────────────────────────────────────────────────────
--
-- Relevado: NINGUNA vista ni función del schema depende de v_cobranza_kpi
-- (pg_depend vacío). El único consumidor es app/cobranza/kpis/page.tsx, que se
-- ajusta en el mismo commit.
--
-- Queda pendiente y aparte: equipo_torneo.total_facturado y la columna
-- homónima de v_cuenta_corriente_equipo. Ese caso es distinto —hay una COLUMNA
-- BASE detrás, mantenida por trg_sync_total_facturado— y se decide por separado.
-- ============================================================================

alter view v_cobranza_kpi rename column devengado to comprometido;

comment on view v_cobranza_kpi is
  'KPIs de cobranza por torneo. `comprometido` es la suma de cuota.monto: lo '
  'pactado según el tarifario, NO un saldo contable — bajo percibido puro las '
  'cuotas no generan asiento (decisión 1).';
