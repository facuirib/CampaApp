-- ═══════════════════════════════════════════════════════════════
-- RLS · plantilla_mail — primera tabla del bloque 10
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu, tabla por
-- tabla, como acordado en su ofrecimiento (coordinacion.md, 21/08).
--
-- Tabla de configuración global del club (plantillas de mail), sin
-- columna de dueño ni de scope (torneo/predio). No hay roles todavía
-- (eso es el resto del bloque 10) — la política de esta primera etapa
-- es la más simple posible: exigir sesión autenticada, sin distinguir
-- quién. Hoy, sin RLS, cualquiera con la anon key (con o sin login)
-- puede leer y escribir. Con esto, al menos se exige estar logueado.
--
-- Cuando existan roles, esta política se puede refinar (ej. solo admin
-- edita, cualquiera autenticado lee) — no es el alcance de hoy.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "plantilla_mail_select_autenticado" on plantilla_mail;
create policy "plantilla_mail_select_autenticado"
  on plantilla_mail for select
  to authenticated
  using (true);

drop policy if exists "plantilla_mail_insert_autenticado" on plantilla_mail;
create policy "plantilla_mail_insert_autenticado"
  on plantilla_mail for insert
  to authenticated
  with check (true);

drop policy if exists "plantilla_mail_update_autenticado" on plantilla_mail;
create policy "plantilla_mail_update_autenticado"
  on plantilla_mail for update
  to authenticated
  using (true)
  with check (true);

-- delete no tiene política — nadie borra plantillas por diseño.

-- ⚠️ NO EJECUTAR hasta confirmar con Facu:
-- alter table plantilla_mail enable row level security;

comment on table plantilla_mail is
  'Plantillas de mail del club. RLS propuesto 21/08 (bloque 10, primera '
  'tabla): exige sesión autenticada para leer/escribir, sin distinción de '
  'rol (no hay roles todavía). ENABLE pendiente de confirmación explícita '
  'de Facu.';