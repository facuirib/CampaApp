-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · tercero — el hueco del inventario
-- PROPUESTA. NO ACTIVA RLS: solo escribe la policy.
--
-- `tercero` quedó SIN NINGUNA POLICY en el bloque 10. El resumen decía que
-- faltaban «solo torneo y _prueba_marca» — son tres. Con 309 filas (304 equipos,
-- 2 socios, 3 sponsors) es el padrón del sistema, y lo leen cobranza, reclamos,
-- inscripciones, socios y sponsors.
--
-- Sin policy no es un problema HOY —RLS está apagado— pero es una mina: el día
-- que alguien active RLS ahí, esas cinco pantallas se quedan sin datos y no va a
-- ser obvio por qué. Se tapa ahora, antes de que sea el turno de esa tabla.
--
-- Mismo patrón que las otras 104: rol `authenticated`, `using (true)`,
-- `with check (true)`. Sin distinción por rol, porque todavía no existe tabla de
-- roles ni claim que la sostenga — eso es una capa posterior.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Por qué las tres operaciones y no solo SELECT ──────────────────────────
--
-- Hoy NINGUNA función escribe `tercero` —lo verifiqué en todos los cuerpos de
-- pg_proc— y el front solo la lee (`/reclamos/[terceroId]` lee `contacto`). Con
-- el criterio literal de Horacio para tablas sin escritura —predio, serie,
-- categoria— le tocaría solo SELECT.
--
-- Va con las tres igual, por dos razones:
--
--   1. `tercero` NO es un catálogo cerrado como predio: es el PADRÓN. Se escribe
--      hoy por seed/importación, y el alta de un equipo, un socio o un sponsor
--      nuevo es un flujo del negocio, no una excepción. Que todavía no exista la
--      función no lo hace de solo lectura, lo hace pendiente.
--
--   2. El costo de equivocarse es asimétrico. Un INSERT sin policy **falla
--      fuerte** («new row violates row-level security policy»), así que quedarse
--      corto se nota. Pero un UPDATE sin policy **falla en silencio**: afecta 0
--      filas y sigue. Para una tabla que se va a editar —corregir un mail, dar
--      de baja un equipo— ese silencio es peor que la puerta un poco más ancha.
--
-- Queda con el mismo perfil que `cat_gasto`, que es la tabla comparable: un
-- catálogo que además se mantiene.

drop policy if exists "tercero_select_autenticado" on tercero;
create policy "tercero_select_autenticado"
  on tercero for select
  to authenticated
  using (true);

drop policy if exists "tercero_insert_autenticado" on tercero;
create policy "tercero_insert_autenticado"
  on tercero for insert
  to authenticated
  with check (true);

drop policy if exists "tercero_update_autenticado" on tercero;
create policy "tercero_update_autenticado"
  on tercero for update
  to authenticated
  using (true)
  with check (true);

-- Sin policy de DELETE: nadie borra un tercero. Se da de baja con `activo`,
-- igual que el resto del sistema.

-- ⚠️ NO SE ACTIVA ACÁ. El ENABLE de `tercero` va cuando le toque su fase, con
-- su propia verificación:
-- alter table tercero enable row level security;

comment on table tercero is
  'Padrón: equipos, socios y sponsors. RLS con policies select/insert/update '
  'para authenticated (23/08) — faltaba en el inventario del bloque 10. Sin '
  'delete: la baja es por `activo`. ENABLE pendiente de su fase.';
