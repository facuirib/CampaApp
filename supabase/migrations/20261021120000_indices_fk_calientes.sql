-- ═══════════════════════════════════════════════════════════════════════════
-- PERFORMANCE · índices para los FKs de las tablas que crecen
-- APLICADA EL 21/10/2026 (auditoría de performance, OK de Facu)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Los advisors marcaban 97 FKs sin índice. Con el volumen actual no duele;
-- con un torneo andando, pago/gasto/asiento/compromiso/comprobante son las
-- que suman filas todas las semanas y las que los joins de las vistas
-- recorren. Se indexan SOLO esas (más cuota_ajuste, nueva y consultada por
-- cuota en la ficha) — el resto de los 97 son tablas chicas o frías: un
-- índice sin uso también cuesta (cada insert lo mantiene).
--
-- Los 7 índices que el advisor marca "sin uso" NO se tocan: las estadísticas
-- son posteriores al borrado del 20/10 — no hay historia para juzgarlos.

create index if not exists idx_pago_tercero          on pago (tercero_id);
create index if not exists idx_pago_cuota            on pago (cuota_id);
create index if not exists idx_pago_jornada          on pago (jornada_id);
create index if not exists idx_pago_predio           on pago (predio_id);
create index if not exists idx_pago_asiento          on pago (asiento_id);
create index if not exists idx_pago_registrado_por   on pago (registrado_por);

create index if not exists idx_gasto_concepto        on gasto (concepto_id);
create index if not exists idx_gasto_torneo          on gasto (torneo_id);
create index if not exists idx_gasto_predio          on gasto (predio_id);
create index if not exists idx_gasto_proveedor       on gasto (proveedor_id);
create index if not exists idx_gasto_activo          on gasto (activo_id);
create index if not exists idx_gasto_asiento_dev     on gasto (asiento_dev_id);
create index if not exists idx_gasto_asiento_pag     on gasto (asiento_pag_id);

create index if not exists idx_asiento_predio        on asiento (predio_id);
create index if not exists idx_asiento_jornada       on asiento (jornada_id);
create index if not exists idx_asiento_anulado_por   on asiento (anulado_por);
create index if not exists idx_asiento_created_by    on asiento (created_by);

create index if not exists idx_compromiso_tercero    on compromiso (tercero_id);
create index if not exists idx_compromiso_gasto      on compromiso (gasto_id);
create index if not exists idx_compromiso_plan       on compromiso (plan_id);
create index if not exists idx_compromiso_cheque     on compromiso (cheque_id);
create index if not exists idx_compromiso_torneo     on compromiso (torneo_id);
create index if not exists idx_compromiso_asiento    on compromiso (asiento_id);

create index if not exists idx_comprobante_cond_iva  on comprobante (condicion_iva_receptor_id);
create index if not exists idx_comprobante_emitida   on comprobante (emitida_por);
create index if not exists idx_comprobante_ingreso   on comprobante (ingreso_extraordinario_id);

create index if not exists idx_cuota_ajuste_cuota    on cuota_ajuste (cuota_id);
create index if not exists idx_cuota_ajuste_autor    on cuota_ajuste (created_by);
