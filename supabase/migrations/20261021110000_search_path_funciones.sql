-- ═══════════════════════════════════════════════════════════════════════════
-- HARDENING · search_path fijo en todas las funciones de public
-- APLICADA EL 21/10/2026 (auditoría de seguridad, OK de Facu)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Los advisors marcaban 140 funciones con search_path MUTABLE (WARN): una
-- función que resuelve nombres por el search_path de la sesión puede ser
-- desviada a objetos de otro schema si alguien controla ese path. Con
-- `set search_path = public, pg_temp` cada función resuelve siempre contra
-- public — las referencias a otros schemas que ya eran explícitas
-- (auth.users, auth.jwt()) no cambian, porque van calificadas.
--
-- `public, pg_temp` y no '' (la otra recomendación): el schema vacío
-- obligaría a calificar CADA tabla en 140 cuerpos. Esto cierra el vector con
-- cero reescritura. Verificado después de aplicar: suite completa verde
-- (invariantes, permisos vivos, smoke de vistas, casos de cuota).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.firma);
  end loop;
end $$;
