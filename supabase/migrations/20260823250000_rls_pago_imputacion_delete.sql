-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · la policy de DELETE que le falta a `pago_imputacion`
-- SIN `ENABLE`. Precondición dura de la Fase 5.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `pago_imputacion` tiene SELECT e INSERT. Le falta DELETE, y
-- `cambiar_estado_cheque` **borra** al rechazar un cheque:
--
--     if v_ch.pago_id is not null then
--       delete from pago_imputacion where pago_id = v_ch.pago_id;
--     end if;
--
-- Es el paso que **reabre la deuda**. Sacar las imputaciones hace que
-- `trg_sync_cuota_pagada` recalcule `pagado_at` y la cuota vuelva a deber.
--
-- ── Por qué es una precondición y no un pendiente ──────────────────────────
--
-- Sin esta policy, con el núcleo encendido, el rechazo de un cheque **falla en
-- silencio y a medias**. El DELETE afecta 0 filas sin excepción, y los otros
-- cuatro pasos ocurren normalmente:
--
--   ① el cheque queda «rechazado»                                    ocurre
--   ② `anular_asiento` revierte el asiento del cobro                  ocurre
--   ③ `delete from pago_imputacion`                                   **0 filas**
--   ④ la deuda se reabre                                              NO ocurre
--   ⑤ `trg_sync_cuota_pagada` recalcula `pagado_at`                   NO se dispara
--
-- Resultado: la pantalla dice que el rechazo salió bien, la contabilidad quedó
-- revertida, el cheque figura rechazado — y **el equipo sigue sin deber la
-- plata que nunca entró**. La cobranza no tiene forma de verlo: la cuota
-- aparece pagada.
--
-- Es el peor modo de falla del sistema: parcial, mudo, y del lado del dinero.
--
-- ── Verificado en rollback ─────────────────────────────────────────────────
--
-- Con las 6 tablas del núcleo encendidas + esta policy, rol `authenticated` y
-- `bypassrls = false`: el rechazo completo corre y los cinco pasos ocurren,
-- incluido el ③ que borra 1 → 0 y el ④ que devuelve el saldo de la cuota.
-- Sin la policy, medido en la misma prueba, el ③ mide 0 y la cuota queda
-- pagada. Detalle en `coordinacion.md`.
--
-- ── NO activa RLS ─────────────────────────────────────────────────────────
--
-- `pago_imputacion` sigue apagada. El `ENABLE` del núcleo va junto, en
-- `20260823260000`, y **se coordina con Horacio** — es su carril y pidió
-- revisarlo con más cuidado que el resto.

create policy pago_imputacion_delete_autenticado
  on pago_imputacion for delete
  to authenticated
  using (true);

comment on policy pago_imputacion_delete_autenticado on pago_imputacion is
  'Fase 5 · cambiar_estado_cheque borra las imputaciones del pago al rechazar un cheque: es el paso que reabre la deuda (trg_sync_cuota_pagada recalcula pagado_at en el DELETE). Sin esta policy el rechazo falla en silencio y a medias: el cheque queda rechazado y el asiento revertido, pero el equipo sigue sin deber la plata que nunca entró.';
