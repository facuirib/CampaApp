-- ═══════════════════════════════════════════════════════════════════════════
-- Gasto en cuotas · plan_pago gana cat_gasto_id
-- APLICADA el 17/09/2026 — probada primero con begin/rollback (plan de 3
-- cuotas, primera cuota devengada, gasto real generado y vinculado; caso
-- 'eventual' sin torneo rechazado correctamente). Reflota plan_pago/
-- compromiso, que existen desde 001_schema.sql sin ningún escritor en
-- runtime (confirmado en docs/arquitectura.md:3064-3066).
--
-- `plan_pago` está vacía hoy (0 filas, verificado), así que el `not null`
-- de más abajo no rompe nada al aplicarse — si para cuando esto se aplique
-- ya no fuera cierto, este ALTER hay que revisarlo antes, no correrlo igual.
--
-- Por qué acá y no en `compromiso`: `devengar_cuota_plan` (próxima migración)
-- necesita la categoría en el momento del DEVENGO, que puede ser meses
-- después del alta del plan — vive en `plan_pago`, no en cada `compromiso`,
-- para no repetir el mismo dato en N filas.
--
-- Los tres CHECK son cierre de un gap del schema original: `plan_pago` nunca
-- tuvo validación de que `cuotas_total`/`monto_cuota` fueran positivos ni de
-- que `dia_vencimiento` cayera en un rango seguro. No se notó porque nunca
-- hubo un escritor — se cierra ahora, de una, ya que se toca la tabla.
-- ═══════════════════════════════════════════════════════════════════════════

alter table plan_pago
  add column cat_gasto_id uuid not null references cat_gasto(id);

comment on column plan_pago.cat_gasto_id is
  'La categoría con la que se devenga cada cuota, vía devengar_cuota_plan → '
  'registrar_gasto. Vive acá y no en compromiso porque el devengo es mensual '
  'y necesita la categoría en un momento que puede ser meses después del '
  'alta del plan — repetirla en cada compromiso sería la misma categoría N '
  'veces sin motivo.';

alter table plan_pago
  add constraint chk_plan_pago_cuotas_total   check (cuotas_total > 0),
  add constraint chk_plan_pago_monto_cuota    check (monto_cuota > 0),
  -- 1–28: generar_cuotas_plan arma cada vencimiento con
  -- date_trunc('month', ...) + (dia_vencimiento - 1) días. Con 29/30/31 un
  -- plan que arranca en un mes de 31 días corre bien casi siempre, pero en
  -- febrero (28 o 29 días) el resultado se pasa al mes siguiente — la cuota
  -- de febrero vence en marzo, silenciosamente. Capar a 28 lo evita en los
  -- doce meses del año, siempre.
  add constraint chk_plan_pago_dia_vencimiento check (dia_vencimiento between 1 and 28);
