-- ═══════════════════════════════════════════════════════════════════════════
-- REVISADA Y APLICADA (20/10/2026). Revisión de Facu sobre la propuesta de
-- Horacio: SIN ING_DONACIONES — no se pidió y no se necesita; si algún día
-- hace falta, se crea entonces (una cuenta nueva aparece sola en el P&L).
-- Los nombres de cuentas quedaron confirmados por Facu, sin esperar más
-- rondas con el contador.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ingreso extraordinario (1/3) · las cuentas
--
-- Un cobro que no nace de ninguna `cuota` —donación, un servicio puntual a
-- un tercero (estacionamiento, uso de instalaciones, un alquiler puntual),
-- cualquier otro ingreso que no sea inscripción, partido, sponsor o bar— no
-- tiene hoy una cuenta de ingreso a la que imputarse. Estas tres son nuevas.
--
-- Los NOMBRES SON PROVISORIOS. Horacio los confirma con el contador del
-- cliente antes de aplicar esta migración — en particular si la venta de un
-- activo fijo corresponde como ingreso o si debería salir por baja de
-- activo, y si el estacionamiento es puntual o recurrente (ver
-- docs/coordinacion.md, pendientes).
insert into cuenta (id, codigo, nombre, tipo, imputable, padre_id)
values
  (gen_random_uuid(), 'ING_SERVICIOS', 'Servicios a terceros', 'ingreso', true, null),
  (gen_random_uuid(), 'ING_OTROS',     'Otros ingresos',       'ingreso', true, null)
on conflict (codigo) do nothing;
