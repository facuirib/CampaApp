-- Limpieza manual de un pago/ficha de prueba.
-- psql $DATABASE_URL -f scripts/limpiar_pago_prueba.sql
--
-- Excepción a la regla 4 (el asiento nunca se edita ni se borra, se anula con
-- contraasiento): esto es un delete crudo, válido solo para datos de prueba
-- que nunca debieron persistir. NO usar este patrón para revertir un cobro
-- real — para eso existe anular_asiento().
--
-- NO se ejecutó contra la base hosted (regla 11) — queda guardado para
-- correrlo a mano cuando se confirme.

-- 1. Borrar imputaciones del pago
delete from pago_imputacion where pago_id = '3f252148-97d7-496e-adac-19eb6e56b7df'::uuid;

-- 2. Borrar líneas del asiento y el asiento
delete from asiento_linea where asiento_id = 'c967ce92-d2fd-48fd-b7e4-1a02633b809c'::uuid;
delete from asiento where id = 'c967ce92-d2fd-48fd-b7e4-1a02633b809c'::uuid;

-- 3. Borrar el pago
delete from pago where id = '3f252148-97d7-496e-adac-19eb6e56b7df'::uuid;

-- 4. Borrar las cuotas y la ficha
delete from cuota where equipo_torneo_id = '80bbea05-c768-4fad-9dc2-785845b7c01c'::uuid;
delete from equipo_torneo where id = '80bbea05-c768-4fad-9dc2-785845b7c01c'::uuid;