-- ═══════════════════════════════════════════════════════════════
-- RLS · cat_gasto — tercera tabla del bloque 10
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- Catálogo de categorías de gasto. A diferencia de audit_log, las
-- funciones de escritura (crear/editar/desactivar_cat_gasto) NO son
-- SECURITY DEFINER (confirmado: prosecdef=false) — corren con los
-- permisos del usuario que las llama. Sin policy de insert/update, esas
-- funciones se romperían con RLS activo.
--
-- Política: lectura y escritura abiertas a cualquier autenticado, mismo
-- criterio que plantilla_mail — no hay roles diferenciados todavía (no
-- se puede restringir "solo admin edita categorías" sin inventar un rol
-- que no existe). Sin policy de delete: no hay borrado físico, solo
-- desactivar_cat_gasto (que es un UPDATE, ya cubierto).
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "cat_gasto_select_autenticado" on cat_gasto;
create policy "cat_gasto_select_autenticado"
  on cat_gasto for select
  to authenticated
  using (true);

drop policy if exists "cat_gasto_insert_autenticado" on cat_gasto;
create policy "cat_gasto_insert_autenticado"
  on cat_gasto for insert
  to authenticated
  with check (true);

drop policy if exists "cat_gasto_update_autenticado" on cat_gasto;
create policy "cat_gasto_update_autenticado"
  on cat_gasto for update
  to authenticated
  using (true)
  with check (true);

-- ⚠️ NO EJECUTAR hasta confirmar con Facu:
-- alter table cat_gasto enable row level security;

comment on table cat_gasto is
  'Catálogo de categorías de gasto. RLS propuesto 21/08: select/insert/'
  'update para authenticated (sin roles todavía). Las funciones de '
  'escritura NO son SECURITY DEFINER, por eso necesitan policy explícita '
  '(a diferencia de audit_log). ENABLE pendiente de confirmación de Facu.';