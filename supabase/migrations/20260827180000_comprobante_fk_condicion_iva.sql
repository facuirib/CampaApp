-- ═══════════════════════════════════════════════════════════════════════════
-- comprobante.condicion_iva_receptor_id → condicion_iva_receptor
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Faltaba la foreign key. Las otras dos referencias al mismo catálogo la
-- tienen —`emisor.condicion_iva_id` y `tercero.condicion_iva_receptor_default`—
-- y ésta quedó afuera por olvido, no por una razón.
--
-- No es un id interno cualquiera. Es la **condición del receptor frente al
-- IVA**: se le informa a ARCA al pedir el CAE —es el campo de la RG 5616,
-- cuya ausencia rechaza la emisión con el error 10242— y se imprime en la
-- factura. O sea que un valor que no existe en el catálogo produce dos daños
-- distintos: una factura que ARCA no autoriza, o peor, una autorizada que
-- imprime una condición fiscal equivocada.
--
-- ── Cómo apareció ────────────────────────────────────────────────────────
--
-- No lo encontró una revisión: lo encontró PostgREST. Al armar el PDF de la
-- #407 se pidió el join `comprobante → condicion_iva_receptor` y contestó que
-- no conocía la relación, porque la relación la deduce de las foreign keys.
-- El generador tuvo que resolverlo con una consulta aparte.
--
-- Vale la pena anotarlo: la falta de FK no rompía nada visible —el id 5 existe
-- y todo funcionaba—, y se manifestó como una molestia de otro sistema.
--
-- ── El momento ───────────────────────────────────────────────────────────
--
-- Con una sola fila. Agregar una FK valida todas las existentes, y hacerlo con
-- miles de comprobantes emitidos implicaría descubrir ahí si alguno quedó
-- apuntando al vacío, con la migración a medio correr. Verificado antes: 1
-- fila, 0 huérfanas, el id 5 («Consumidor Final») existe en el catálogo de 11.
--
-- ── Por qué NO ACTION y no RESTRICT ──────────────────────────────────────
--
-- Los dos impiden borrar del catálogo una condición que un comprobante usa,
-- que es lo que se busca: el comprobante es un documento histórico e inmutable
-- y no puede quedar apuntando al vacío porque alguien limpió una tabla de
-- referencia. La diferencia entre ambos sólo aparece con constraints
-- diferibles, y ésta no lo es.
--
-- Se usa NO ACTION porque es lo que ya tienen las otras dos. Tres referencias
-- al mismo catálogo con dos cláusulas distintas sugerirían una distinción que
-- no existe, y el próximo que las lea va a perder un rato buscándola.
-- ═══════════════════════════════════════════════════════════════════════════

alter table comprobante
  add constraint comprobante_condicion_iva_fk
  foreign key (condicion_iva_receptor_id)
  references condicion_iva_receptor(id);

comment on column comprobante.condicion_iva_receptor_id is
  'Condición del receptor frente al IVA, congelada al emitir. Es el campo de la RG 5616 que se informa a ARCA y se imprime en la factura, así que apunta al catálogo por foreign key: no puede quedar en un valor inexistente.';
