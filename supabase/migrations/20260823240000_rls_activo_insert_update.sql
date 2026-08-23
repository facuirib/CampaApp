-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · CORRECCIÓN · `activo` sin policy de INSERT — el alta está ROTA hoy
-- ⚠️ ESCRITA, NO APLICADA. Espera confirmación de Facu.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `activo` se encendió en la **Fase 2**, clasificada como «solo lectura» porque
-- **ninguna función de Postgres la escribe**. Tiene una sola policy: SELECT.
--
-- Pero la escribe el **front**, directo desde un Client Component:
--
--     app/activos/nuevo/page.tsx:102
--       await supabase.from('activo').insert({ nombre, categoria, ... })
--
-- Verificado con rol `authenticated` y `bypassrls = false`:
--
--     SELECT sobre activo   1 fila                                          ✅
--     INSERT como /nuevo    «new row violates row-level security policy
--                            for table "activo"»                            🔴
--     UPDATE                **0 filas, sin excepción**                      🔴
--
-- **El alta de activo está rota en producción desde que se aplicó la Fase 2.**
--
-- ── Por qué se nos pasó ────────────────────────────────────────────────────
--
-- Es exactamente el punto ciego que documentamos después: **una escritura del
-- front no aparece en `pg_proc`**. En la Fase 2 el relevamiento fue por
-- funciones; el doble chequeo —funciones **y** grep del front— recién se
-- instauró en la Fase 3, y desde entonces todas las tandas pasaron por él.
-- `activo` quedó del lado viejo de esa línea.
--
-- Se barrieron **las 31 tablas ya encendidas** buscando el mismo error. Hay dos
-- que el front escribe directo:
--
--   activo    solo SELECT                    🔴 rota
--   reclamo   tiene INSERT desde la Fase 3   ✅ verificada, anda (6 → 7)
--
-- Ninguna otra. `plantilla_mail` la escribe una Server Action pero sigue
-- apagada.
--
-- ── Qué agrega esta migración ──────────────────────────────────────────────
--
-- INSERT, para que el alta vuelva a andar. Y UPDATE, porque `activo` tiene
-- `estado`, `fecha_baja` y `motivo_baja`: **la baja de un activo es un UPDATE**,
-- y hoy mediría 0 filas sin decir nada. La pantalla de baja no está construida
-- todavía — mejor que la policy esté antes de que alguien la escriba y pierda
-- una tarde buscando por qué el activo no se da de baja.
--
-- Sin DELETE: nadie borra activos, y la baja es un cambio de estado.

create policy activo_insert_autenticado
  on activo for insert
  to authenticated
  with check (true);

create policy activo_update_autenticado
  on activo for update
  to authenticated
  using (true)
  with check (true);

comment on policy activo_insert_autenticado on activo is
  'Corrección de Fase 2: activo se clasificó como solo-lectura porque ninguna función la escribe, pero /activos/nuevo hace .from(activo).insert() directo desde el cliente. Sin esta policy el alta de activo falla con "new row violates row-level security policy".';
comment on policy activo_update_autenticado on activo is
  'La baja de un activo es un UPDATE de estado/fecha_baja/motivo_baja. Sin esta policy mediría 0 filas sin excepción — el silencio del UPDATE.';
