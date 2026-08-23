-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · FASE 3 · TANDA B · 5 tablas de escritor único
-- movimiento_fondo · usd_operacion · anticipo_uso · compromiso · reclamo
-- RLS queda en 22/51.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Las cinco tienen un solo camino de escritura, y en cuatro de ellas es un
-- INSERT. Se agrupan porque el circuito de cada una entra en una llamada.
--
-- ── Cada escritor, ejercitado con RLS activo y rol `authenticated` ─────────
--
-- (`bypassrls = false` verificado dentro de la transacción, y midiendo FILAS.)
--
--   movimiento_fondo  registrar_movimiento_fondo   0 → 1   ✅
--   usd_operacion     comprar_usd + vender_usd     5 → 7   ✅  (con p_created_by,
--                                                                que agregó Horacio)
--   anticipo_uso      aplicar_anticipo             0 → 1   ✅
--   compromiso        generar_cuotas_plan          0 → 3   ✅  (3 cuotas del plan)
--   compromiso        UPDATE del estado            1 fila  ✅  (no queda en silencio)
--   reclamo           INSERT de la Server Action   6 → 7   ✅
--
-- Lecturas y vistas: v_tenencia_usd, v_anticipo_saldo, v_calendario_pagos,
-- v_reclamo_equipo, v_dependencia_fondo. Descuadre 0.
--
-- ── Dos cosas que costó montar, y vale dejar escritas ──────────────────────
--
-- **El anticipo no se crea con `registrar_cobro`.** Esa función EXIGE que la
-- imputación iguale el monto del pago: con un sobrante rechaza con «La
-- imputación suma X y el pago es de Y». El sobrante lo hace `imputar_pago`, que
-- sí lo admite y deja el resto como anticipo. Para ejercitar `aplicar_anticipo`
-- hubo que ir por ahí: pago → `imputar_pago` parcial → anticipo → aplicar.
--
-- **`aplicar_anticipo` dispara `sync_cuota_pagada`, que escribe `cuota`.**
-- `cuota` es del núcleo y tiene RLS apagado, así que hoy no molesta — pero
-- cuando le toque la Fase 5, su policy de UPDATE tiene que estar, o este
-- circuito se corta desde una tabla que ni se nombra acá. Ya está escrita
-- (Horacio la puso justamente por los triggers).
--
-- ── Nota sobre `plan_pago`, activada en la Tanda A ─────────────────────────
--
-- Se activó como «sin escritores en runtime», y es cierto: ninguna función ni
-- pantalla la escribe. Pero para armar este test hubo que insertar un plan a
-- mano, como `authenticated` y con RLS ya encendido, y **pasó** — la policy de
-- INSERT que tenía escrita lo cubre. Buena señal para el día que exista el alta.

alter table movimiento_fondo enable row level security;
alter table usd_operacion    enable row level security;
alter table anticipo_uso     enable row level security;
alter table compromiso       enable row level security;
alter table reclamo          enable row level security;
