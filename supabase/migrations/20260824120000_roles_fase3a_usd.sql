-- ═══════════════════════════════════════════════════════════════════════════
-- Roles · Fase 3a · comprar y vender USD, solo admin
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La única operación sensible del modelo que se separa **por policy limpia**.
-- Las otras dos —anular un asiento suelto, rechazar un cheque— comparten
-- función con operaciones que otros roles sí pueden, así que su restricción va
-- dentro de la función (Fase 3b).
--
-- ── Por qué ésta sí se separa ──────────────────────────────────────────────
--
-- `usd_operacion.INSERT` tiene dos escritores, `comprar_usd` y `vender_usd`, y
-- las dos **son la misma operación sensible**. No hay una tercera función que
-- escriba esa tabla por otro motivo, así que restringir la policy es
-- exactamente restringir la operación — sin daño colateral.
--
-- El circuito completo es `usd_operacion[I]` + `crear_asiento`. Nada más.
--
-- ── El fallo es limpio ─────────────────────────────────────────────────────
--
-- Era la duda razonable: `comprar_usd` crea el asiento **antes** de insertar en
-- `usd_operacion`, así que podía quedar un asiento sin su operación. Medido con
-- rol `operador`:
--
--     comprar_usd   → violates RLS for table "usd_operacion"
--     asiento       83 → 83
--     asiento_linea 172 → 172
--
-- La excepción propaga y revierte el bloque entero. Y con `admin`, la misma
-- compra: `usd_operacion` 5 → 6, `asiento` 83 → 84.
--
-- ── Lo que esto NO hace ────────────────────────────────────────────────────
--
-- No le saca un botón a nadie: **no hay pantalla de compra/venta**. `/usd` es
-- solo lectura —posición, tenencia y el chequeo de sincronía— y las dos
-- menciones a `comprar_usd` en el front son comentarios. Esto cierra una puerta
-- de la API.
--
-- Si algún día se construye esa pantalla, hay que recordar que solo admin la va
-- a poder usar. El operador **sigue leyendo** todo: `usd_operacion`,
-- `v_tenencia_usd` y `v_usd_sincronia` quedan intactas — la policy de SELECT no
-- se toca, como siempre.

drop policy usd_operacion_insert_autenticado on usd_operacion;

create policy usd_operacion_insert_autenticado
  on usd_operacion for insert
  to authenticated
  with check (auth_rol() = 'admin');

comment on policy usd_operacion_insert_autenticado on usd_operacion is
  'Solo admin compra o vende dólares. Se separa por policy y no por guarda en función porque sus dos escritores —comprar_usd y vender_usd— son la misma operación sensible: no hay una tercera función que escriba esta tabla por otro motivo.';
