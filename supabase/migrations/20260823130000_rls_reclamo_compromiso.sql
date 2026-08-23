-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · las policies que le faltaban a `reclamo` y `compromiso`
-- NO ACTIVA RLS en ninguna de las dos: solo escribe las policies.
--
-- Las dos venían con policy de SELECT únicamente, clasificadas como
-- «solo lectura». Las dos se escriben, y con RLS activo el INSERT falla:
--
--     new row violates row-level security policy for table "reclamo"
--     new row violates row-level security policy for table "compromiso"
--
-- Probado en rollback antes de escribir esto, no deducido. Por eso quedaron
-- afuera de la Fase 2 — se encienden cuando les toque su fase, ya con policy.
--
-- ── Por qué se escaparon del inventario ────────────────────────────────────
--
-- El relevamiento buscó escritores en `pg_proc`. Correcto para casi todo, pero
-- deja dos puntos ciegos:
--
--   · `reclamo` lo escribe una SERVER ACTION —`/reclamos/acciones.ts`—, no una
--     función de Postgres. `pg_proc` no la ve. Y escribir directo a una tabla
--     desde una Server Action es una vía legítima acá: la convención de
--     CLAUDE.md la contempla para cuando no hay función que valide.
--
--   · `compromiso` sí lo escribe una función, `generar_cuotas_plan`, pero **no
--     es SECURITY DEFINER**: corre con el rol de quien la llama, así que RLS se
--     le aplica igual. La distinción no es «¿hay función?» sino «¿esa función
--     esquiva RLS?».
--
-- La diferencia con `audit_log`, que sí entró en la Fase 2 aunque se escriba:
-- `fn_audit` **es** SECURITY DEFINER. Verificado con RLS activo — una operación
-- auditada llevó la tabla de 1190 a 1191 filas.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── reclamo · INSERT, y solo INSERT ────────────────────────────────────────
--
-- La Server Action hace `.insert(...)` y nada más: las otras tres referencias
-- del front son `.select`.
--
-- **Sin UPDATE, y es deliberado.** Un reclamo es la FOTO de lo que se reclamó,
-- y el código lo dice donde se escribe: «Congelados: es la foto de cuánto debía
-- cuando se le reclamó. Si mañana paga, el reclamo tiene que seguir diciendo lo
-- que decía». Guarda el texto resuelto y no la plantilla por la misma razón.
--
-- Darle UPDATE sería abrir una puerta que el diseño cerró a propósito. Si algún
-- día hace falta —corregir un destino mal tipeado— se agrega ahí, con su motivo.

drop policy if exists "reclamo_insert_autenticado" on reclamo;
create policy "reclamo_insert_autenticado"
  on reclamo for insert
  to authenticated
  with check (true);


-- ── compromiso · INSERT y UPDATE ───────────────────────────────────────────
--
-- `generar_cuotas_plan` hoy solo INSERTA, así que el INSERT es lo verificado.
--
-- El UPDATE va igual, por lo mismo que en `tercero`: la tabla tiene `estado`
-- ('pendiente' | …) y `cumplido_at`, o sea que **la transición de estado está
-- prevista en el modelo** aunque todavía no exista quién la haga. Y el costo de
-- equivocarse es asimétrico: un INSERT sin policy falla fuerte y se ve, pero un
-- UPDATE sin policy **afecta 0 filas sin error** — un compromiso que se marca
-- cumplido y sigue figurando pendiente, en silencio.
--
-- ⚠️ Es carril de Horacio. Si preferís que vaya solo con INSERT hasta que exista
-- el escritor del estado, cambialo — está sin activar, no cuesta nada.

drop policy if exists "compromiso_insert_autenticado" on compromiso;
create policy "compromiso_insert_autenticado"
  on compromiso for insert
  to authenticated
  with check (true);

drop policy if exists "compromiso_update_autenticado" on compromiso;
create policy "compromiso_update_autenticado"
  on compromiso for update
  to authenticated
  using (true)
  with check (true);


-- ⚠️ NINGUNA de las dos se activa acá. El ENABLE va en la Fase 3, con su propia
-- verificación:
-- alter table reclamo    enable row level security;
-- alter table compromiso enable row level security;

comment on table reclamo is
  'Reclamos enviados: la foto de lo que se reclamó, congelada. RLS con policies '
  'select + insert para authenticated (23/08). Sin update: un reclamo no se '
  'edita. La escribe la Server Action /reclamos/acciones.ts. ENABLE pendiente.';
