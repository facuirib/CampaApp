-- ═══════════════════════════════════════════════════════════════
-- RLS · usd_operacion — undécima tabla del bloque 10
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- comprar_usd y vender_usd NO son SECURITY DEFINER (confirmado ayer:
-- prosecdef=false en ambas) — necesitan policy de insert explícita.
-- Mismo patrón que movimiento_fondo: select+insert, sin update/delete
-- (registro contable, se corrige con contraasiento).
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "usd_operacion_select_autenticado" on usd_operacion;
create policy "usd_operacion_select_autenticado"
  on usd_operacion for select
  to authenticated
  using (true);

drop policy if exists "usd_operacion_insert_autenticado" on usd_operacion;
create policy "usd_operacion_insert_autenticado"
  on usd_operacion for insert
  to authenticated
  with check (true);

-- ⚠️ NO EJECUTAR hasta confirmar con Facu:
-- alter table usd_operacion enable row level security;

comment on table usd_operacion is
  'Operaciones de compra/venta de USD. RLS propuesto 22/08: select/'
  'insert para authenticated. comprar_usd/vender_usd NO son SECURITY '
  'DEFINER, necesitan policy explícita. Sin update/delete. ENABLE '
  'pendiente de confirmación de Facu.';