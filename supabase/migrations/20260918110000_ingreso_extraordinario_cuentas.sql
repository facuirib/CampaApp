-- ═══════════════════════════════════════════════════════════════════════════
-- PROPUESTA, NO APLICAR — pendiente de revisión de Facu y de confirmar
-- cuentas con el contador del cliente.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ingreso extraordinario (1/3) · las cuentas
--
-- Un cobro que no nace de ninguna `cuota` —donación, venta de un bien,
-- cualquier otro ingreso que no sea inscripción, partido, sponsor o bar— no
-- tiene hoy una cuenta de ingreso a la que imputarse. Estas tres son nuevas.
--
-- Los NOMBRES SON PROVISORIOS. Horacio los confirma con el contador del
-- cliente antes de aplicar esta migración — en particular si "Venta de
-- bienes" corresponde como ingreso o si debería salir por baja de activo
-- (ver docs/coordinacion.md, pendientes).
insert into cuenta (id, codigo, nombre, tipo, imputable, padre_id)
values
  (gen_random_uuid(), 'ING_DONACIONES',  'Donaciones',      'ingreso', true, null),
  (gen_random_uuid(), 'ING_VENTA_BIENES', 'Venta de bienes', 'ingreso', true, null),
  (gen_random_uuid(), 'ING_OTROS',       'Otros ingresos',  'ingreso', true, null)
on conflict (codigo) do nothing;
