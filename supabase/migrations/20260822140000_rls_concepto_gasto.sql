-- ═══════════════════════════════════════════════════════════════
-- RLS · concepto_gasto — octava tabla del bloque 10
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- Catálogo de conceptos de gasto (sub-nivel de cat_gasto). Sin función
-- de escritura (crear_concepto no existe, confirmado) — se carga a
-- mano. Solo lectura para authenticated, mismo patrón que las 7 tablas
-- anteriores de este bloque.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "concepto_gasto_select_autenticado" on concepto_gasto;
create policy "concepto_gasto_select_autenticado"
  on concepto_gasto for select
  to authenticated
  using (true);

-- ⚠️ NO EJECUTAR hasta confirmar con Facu:
-- alter table concepto_gasto enable row level security;

comment on table concepto_gasto is
  'Catálogo de conceptos de gasto (sub-nivel de cat_gasto). RLS '
  'propuesto 22/08: solo lectura para authenticated. Sin función de '
  'escritura hoy. ENABLE pendiente de confirmación de Facu.';