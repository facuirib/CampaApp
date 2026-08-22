-- ═══════════════════════════════════════════════════════════════
-- RLS · serie + categoria — quinta y sexta tabla del bloque 10
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- Catálogos de series y categorías del torneo. Sin funciones de
-- escritura (crear_serie/crear_categoria no existen, confirmado) — se
-- cargan a mano. Solo lectura para authenticated, mismo patrón que
-- audit_log/predio.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "serie_select_autenticado" on serie;
create policy "serie_select_autenticado"
  on serie for select
  to authenticated
  using (true);

drop policy if exists "categoria_select_autenticado" on categoria;
create policy "categoria_select_autenticado"
  on categoria for select
  to authenticated
  using (true);

-- ⚠️ NO EJECUTAR hasta confirmar con Facu:
-- alter table serie enable row level security;
-- alter table categoria enable row level security;

comment on table serie is
  'Series del torneo (A, B, C...). RLS propuesto 22/08: solo lectura '
  'para authenticated. Sin funciones de escritura hoy. ENABLE pendiente '
  'de confirmación de Facu.';
comment on table categoria is
  'Categorías del torneo (Libre, +30, +35...). RLS propuesto 22/08: solo '
  'lectura para authenticated. Sin funciones de escritura hoy. ENABLE '
  'pendiente de confirmación de Facu.';