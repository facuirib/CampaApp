-- ═══════════════════════════════════════════════════════════════
-- RLS · cheque — duodécima tabla del bloque 10
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- 3 funciones tocan cheque, ninguna es SECURITY DEFINER (confirmado):
-- pagar_gasto y registrar_cobro (dan de alta, INSERT), y
-- cambiar_estado_cheque (UPDATE del estado/asiento_cierre_id).
-- Necesita policy de select/insert/update.
--
-- Sin delete: un cheque no se borra (regla 4, se anula/rechaza vía
-- cambiar_estado_cheque, que ya es un UPDATE cubierto).
--
-- ⚠️ pagar_gasto y registrar_cobro TAMBIÉN tocan gasto/pago/asiento —
-- esas tablas necesitan su propia policy, en otra migración. Esta solo
-- cubre cheque en sí.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "cheque_select_autenticado" on cheque;
create policy "cheque_select_autenticado"
  on cheque for select
  to authenticated
  using (true);

drop policy if exists "cheque_insert_autenticado" on cheque;
create policy "cheque_insert_autenticado"
  on cheque for insert
  to authenticated
  with check (true);

drop policy if exists "cheque_update_autenticado" on cheque;
create policy "cheque_update_autenticado"
  on cheque for update
  to authenticated
  using (true)
  with check (true);

-- ⚠️ NO EJECUTAR hasta confirmar con Facu:
-- alter table cheque enable row level security;

comment on table cheque is
  'Cheques recibidos/emitidos. RLS propuesto 22/08: select/insert/update '
  'para authenticated. pagar_gasto, registrar_cobro y '
  'cambiar_estado_cheque NO son SECURITY DEFINER, necesitan policy '
  'explícita. Sin delete (regla 4). ENABLE pendiente de confirmación de '
  'Facu.';