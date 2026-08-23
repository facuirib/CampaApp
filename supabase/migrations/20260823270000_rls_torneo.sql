-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · `torneo` — policies + ENABLE. RLS 37 → 38/51.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `torneo` era la última tabla real sin policies. Estaba así por una razón
-- concreta: **no la escribía nadie**. Sin escritores no se puede saber qué
-- operaciones tiene que cubrir la policy, y por eso quedó atada a K2.
--
-- `20260821280000_k2_crear_torneo` —la alta mínima que escribió Horacio— se
-- aplica junto con ésta y crea el primer escritor. Recién ahí la policy se
-- puede escribir con el doble chequeo normal.
--
-- ── Escritores, con doble chequeo ──────────────────────────────────────────
--
--   crear_torneo   INSERT   común (pasa por policy)   ← nueva, misma tanda
--
-- Grep del front: hoy `torneo` se lee en `/presupuesto`, `/cobranza`,
-- `/catalogos/tarifario` y `/gastos/nuevo`, y **ninguna la escribe**. La
-- pantalla nueva `/torneos/nuevo` va por `rpc('crear_torneo')`, no por
-- `.from().insert()` — o sea que el punto ciego de `pg_proc` no aplica.
--
-- Sin triggers.
--
-- ── Por qué lleva UPDATE si todavía nadie actualiza ────────────────────────
--
-- Un torneo tiene datos que se corrigen después del alta: el nombre, las fechas
-- de inicio y fin —que muchas veces no se saben al crearlo— y el `ejercicio_id`
-- cuando se resuelve. Y tiene `estado`, con su transición
-- `planificado → en_curso → cerrado` que Horacio dejó como decisión abierta.
--
-- La policy de UPDATE va ahora por lo que aprendimos con `activo`: **el UPDATE
-- bloqueado no avisa, mide 0 filas y sigue**. Mejor que esté antes de que
-- alguien construya la edición, no después de que pierda una tarde buscando por
-- qué el torneo no se guarda.
--
-- Sin DELETE: un torneo no se borra. De él cuelgan asientos, cuotas y pagos —lo
-- que se hace es cerrarlo (`estado = 'cerrado'`) o bajarlo (`activo = false`).
--
-- ── Verificado en rollback ─────────────────────────────────────────────────
--
-- Rol `authenticated`, `bypassrls = false` dentro de la transacción: el SELECT
-- trae los 2 torneos, `crear_torneo` inserta (2 → 3) y el UPDATE de las fechas
-- afecta 1 fila. Detalle en `coordinacion.md`.

create policy torneo_select_autenticado
  on torneo for select
  to authenticated
  using (true);

create policy torneo_insert_autenticado
  on torneo for insert
  to authenticated
  with check (true);

create policy torneo_update_autenticado
  on torneo for update
  to authenticated
  using (true)
  with check (true);

alter table torneo enable row level security;

comment on policy torneo_insert_autenticado on torneo is
  'Escribe crear_torneo (K2), que es función común: pasa por esta policy. La pantalla /torneos/nuevo llama por rpc, no escribe la tabla directo.';
comment on policy torneo_update_autenticado on torneo is
  'Para corregir nombre, fechas y ejercicio_id después del alta, y para la futura transición de estado (planificado → en_curso → cerrado). Va antes de que exista el escritor a propósito: el UPDATE bloqueado no avisa — mide 0 filas y sigue.';
