-- ═══════════════════════════════════════════════════════════════
-- RLS · movimiento_fondo — décima tabla del bloque 10
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- registrar_movimiento_fondo NO es SECURITY DEFINER (confirmado:
-- prosecdef=false) — necesita policy de insert explícita, o se rompe
-- con RLS activo. Select también para poder leer los movimientos.
--
-- Sin policy de update/delete: un movimiento de fondo es un registro
-- contable (como gasto/pago), no se edita ni se borra — no hay función
-- para eso, coherente con el resto del sistema (regla 4, se corrige con
-- contraasiento, no con UPDATE).
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "movimiento_fondo_select_autenticado" on movimiento_fondo;
create policy "movimiento_fondo_select_autenticado"
  on movimiento_fondo for select
  to authenticated
  using (true);

drop policy if exists "movimiento_fondo_insert_autenticado" on movimiento_fondo;
create policy "movimiento_fondo_insert_autenticado"
  on movimiento_fondo for insert
  to authenticated
  with check (true);

-- ⚠️ NO EJECUTAR hasta confirmar con Facu:
-- alter table movimiento_fondo enable row level security;

comment on table movimiento_fondo is
  'Movimientos del fondo de inversión (colocación/rescate). RLS '
  'propuesto 22/08: select/insert para authenticated. '
  'registrar_movimiento_fondo NO es SECURITY DEFINER, necesita policy '
  'explícita. Sin update/delete — se corrige con contraasiento. ENABLE '
  'pendiente de confirmación de Facu.';