-- ═══════════════════════════════════════════════════════════════
-- RLS · gasto_planificado + jornada + equipo_torneo + presupuesto +
--       presupuesto_linea — bloque grande
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- 13 funciones confirmadas, ninguna SECURITY DEFINER:
--   gasto_planificado: crear_gasto_planificado, marcar_..._ejecutado
--   jornada: crear_jornada, mover_jornada, suspender_jornada,
--     crear_playoff, generar_grilla_liga
--   equipo_torneo: crear_equipo_torneo, sync_total_plan (trigger)
--   presupuesto: crear_presupuesto, aprobar_presupuesto
--   presupuesto_linea: agregar_linea_presupuesto,
--     editar_linea_presupuesto
--
-- Todas select/insert/update, sin delete (regla 4) — excepto
-- presupuesto_linea, que SÍ tiene borrar_linea_presupuesto (hard delete
-- deliberado). presupuesto_linea necesita policy de delete también.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "gasto_planificado_select_autenticado" on gasto_planificado;
create policy "gasto_planificado_select_autenticado" on gasto_planificado for select to authenticated using (true);
drop policy if exists "gasto_planificado_insert_autenticado" on gasto_planificado;
create policy "gasto_planificado_insert_autenticado" on gasto_planificado for insert to authenticated with check (true);
drop policy if exists "gasto_planificado_update_autenticado" on gasto_planificado;
create policy "gasto_planificado_update_autenticado" on gasto_planificado for update to authenticated using (true) with check (true);

drop policy if exists "jornada_select_autenticado" on jornada;
create policy "jornada_select_autenticado" on jornada for select to authenticated using (true);
drop policy if exists "jornada_insert_autenticado" on jornada;
create policy "jornada_insert_autenticado" on jornada for insert to authenticated with check (true);
drop policy if exists "jornada_update_autenticado" on jornada;
create policy "jornada_update_autenticado" on jornada for update to authenticated using (true) with check (true);

drop policy if exists "equipo_torneo_select_autenticado" on equipo_torneo;
create policy "equipo_torneo_select_autenticado" on equipo_torneo for select to authenticated using (true);
drop policy if exists "equipo_torneo_insert_autenticado" on equipo_torneo;
create policy "equipo_torneo_insert_autenticado" on equipo_torneo for insert to authenticated with check (true);
drop policy if exists "equipo_torneo_update_autenticado" on equipo_torneo;
create policy "equipo_torneo_update_autenticado" on equipo_torneo for update to authenticated using (true) with check (true);

drop policy if exists "presupuesto_select_autenticado" on presupuesto;
create policy "presupuesto_select_autenticado" on presupuesto for select to authenticated using (true);
drop policy if exists "presupuesto_insert_autenticado" on presupuesto;
create policy "presupuesto_insert_autenticado" on presupuesto for insert to authenticated with check (true);
drop policy if exists "presupuesto_update_autenticado" on presupuesto;
create policy "presupuesto_update_autenticado" on presupuesto for update to authenticated using (true) with check (true);

drop policy if exists "presupuesto_linea_select_autenticado" on presupuesto_linea;
create policy "presupuesto_linea_select_autenticado" on presupuesto_linea for select to authenticated using (true);
drop policy if exists "presupuesto_linea_insert_autenticado" on presupuesto_linea;
create policy "presupuesto_linea_insert_autenticado" on presupuesto_linea for insert to authenticated with check (true);
drop policy if exists "presupuesto_linea_update_autenticado" on presupuesto_linea;
create policy "presupuesto_linea_update_autenticado" on presupuesto_linea for update to authenticated using (true) with check (true);
drop policy if exists "presupuesto_linea_delete_autenticado" on presupuesto_linea;
create policy "presupuesto_linea_delete_autenticado" on presupuesto_linea for delete to authenticated using (true);

comment on table gasto_planificado is 'Gastos planificados (Tipo B). RLS propuesto 22/08: select/insert/update.';
comment on table jornada is 'Jornadas del calendario. RLS propuesto 22/08: select/insert/update.';
comment on table equipo_torneo is 'Ficha equipo-torneo. RLS propuesto 22/08: select/insert/update.';
comment on table presupuesto is 'Cabecera de presupuesto. RLS propuesto 22/08: select/insert/update.';
comment on table presupuesto_linea is 'Líneas de presupuesto. RLS propuesto 22/08: select/insert/update/delete (borrar_linea_presupuesto es hard delete deliberado).';