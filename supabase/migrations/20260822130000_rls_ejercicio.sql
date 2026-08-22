-- ═══════════════════════════════════════════════════════════════
-- RLS · ejercicio — séptima tabla del bloque 10
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- Ejercicios contables (períodos anuales). Sin función de escritura
-- (crear_ejercicio no existe, confirmado) — se carga a mano. Solo
-- lectura para authenticated, mismo patrón que las 6 tablas anteriores.
--
-- Nota: NO propongo policy para torneo todavía — depende de
-- crear_torneo, que sigue sin aplicar (propuesta de ayer, sin
-- confirmar). Sin esa función en la base no puedo verificar si necesita
-- policy de insert o no. Se propone cuando crear_torneo esté aplicada.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "ejercicio_select_autenticado" on ejercicio;
create policy "ejercicio_select_autenticado"
  on ejercicio for select
  to authenticated
  using (true);

-- ⚠️ NO EJECUTAR hasta confirmar con Facu:
-- alter table ejercicio enable row level security;

comment on table ejercicio is
  'Ejercicios contables (períodos anuales). RLS propuesto 22/08: solo '
  'lectura para authenticated. Sin función de escritura hoy. ENABLE '
  'pendiente de confirmación de Facu.';