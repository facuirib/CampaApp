-- ═══════════════════════════════════════════════════════════════
-- RLS · activo — novena tabla del bloque 10
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- Bienes de uso (activos). Sin función de escritura (confirmado: no
-- hay crear_activo ni ningún insert into activo en pg_proc) — se carga
-- a mano. Solo lectura para authenticated, mismo patrón que las 8
-- tablas anteriores.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "activo_select_autenticado" on activo;
create policy "activo_select_autenticado"
  on activo for select
  to authenticated
  using (true);

-- ⚠️ NO EJECUTAR hasta confirmar con Facu:
-- alter table activo enable row level security;

comment on table activo is
  'Bienes de uso (activos). RLS propuesto 22/08: solo lectura para '
  'authenticated. Sin función de escritura hoy (carga manual). ENABLE '
  'pendiente de confirmación de Facu.';