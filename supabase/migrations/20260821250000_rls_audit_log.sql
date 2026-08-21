-- ═══════════════════════════════════════════════════════════════
-- RLS · audit_log — segunda tabla del bloque 10
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- Log de auditoría, escrito por fn_audit() (SECURITY DEFINER — corre con
-- permisos elevados, no depende del rol de quien dispara el trigger).
-- Confirmado: prosecdef = true. Por eso la política es solo lectura —
-- ningún usuario necesita (ni debería poder) insertar/editar/borrar el
-- log a mano; el trigger sigue escribiendo igual con RLS activo, porque
-- SECURITY DEFINER lo exime.
--
-- Sin política de insert/update/delete a propósito: eso significa que
-- ningún usuario (ni siquiera autenticado) puede escribir ahí
-- directamente — solo el trigger. Es la postura correcta para un log:
-- que nadie pueda maquillar su propio rastro.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "audit_log_select_autenticado" on audit_log;
create policy "audit_log_select_autenticado"
  on audit_log for select
  to authenticated
  using (true);

-- ⚠️ NO EJECUTAR hasta confirmar con Facu:
-- alter table audit_log enable row level security;

comment on table audit_log is
  'Log de auditoría (6 tablas sensibles). RLS propuesto 21/08: solo '
  'lectura para authenticated. Sin policy de escritura a propósito — '
  'fn_audit() es SECURITY DEFINER y escribe igual con RLS activo; ningún '
  'usuario debe poder escribir el log a mano. ENABLE pendiente de '
  'confirmación de Facu.';