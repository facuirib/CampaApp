-- ═══════════════════════════════════════════════════════════════
-- RLS · predio — cuarta tabla del bloque 10
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- Catálogo de predios (Tirolesa, Aeropuerto). Sin funciones de escritura
-- (crear_predio no existe, confirmado) — se carga a mano. Solo lectura
-- para authenticated, mismo patrón que audit_log.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "predio_select_autenticado" on predio;
create policy "predio_select_autenticado"
  on predio for select
  to authenticated
  using (true);

-- ⚠️ NO EJECUTAR hasta confirmar con Facu:
-- alter table predio enable row level security;

comment on table predio is
  'Catálogo de predios. RLS propuesto 22/08: solo lectura para '
  'authenticated. Sin funciones de escritura hoy (se carga a mano). '
  'ENABLE pendiente de confirmación de Facu.';