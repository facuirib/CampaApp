-- ═══════════════════════════════════════════════════════════════
-- tercero · campos de facturación por defecto
-- PROPUESTA, NO APLICAR sin revisión (regla 11 · toca ARCA/fiscal).
--
-- Ajuste sobre la decisión anterior (25/08): tercero SÍ guarda un
-- default de facturación, editable puntualmente en cada cobro —
-- no todo se pide en el momento como se había definido antes.
--
-- Aditivo puro: las 3 columnas nacen NULL, no rompe nada existente.
-- Verificado con BEGIN...ROLLBACK contra la base real (25/08).
-- ═══════════════════════════════════════════════════════════════

alter table tercero
  add column doc_tipo_default               smallint,
  add column doc_nro_default                text,
  add column condicion_iva_receptor_default smallint;

comment on column tercero.doc_tipo_default is
  'Tipo de documento por defecto para facturar a este tercero (80=CUIT, 96=DNI, 99=Consumidor Final sin identificar — según FEParamGetTiposDoc de ARCA). NULL si no se cargó — se pide al facturar.';
comment on column tercero.doc_nro_default is
  'Número de documento por defecto (CUIT/DNI). NULL si no se cargó.';
comment on column tercero.condicion_iva_receptor_default is
  'Condición de IVA por defecto (según FEParamGetCondicionIvaReceptor de ARCA — 1=RI, 5=Consumidor Final, 6=Monotributo, etc). NULL si no se cargó — se pide al facturar. Editable puntualmente por cobro.';
