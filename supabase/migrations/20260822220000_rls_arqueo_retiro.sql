-- ═══════════════════════════════════════════════════════════════
-- RLS · arqueo + retiro_bar — bloque de efectivo/caja
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- arqueo: 4 funciones (crear_arqueo, anular_arqueo,
-- asentar_diferencia_arqueo, registrar_entrega_central), ninguna
-- SECURITY DEFINER. select/insert/update (update para anular/cerrar/
-- entregar — trg_arqueo_inmutable congela ciertas columnas pero no
-- bloquea el UPDATE en sí, solo protege campos específicos).
--
-- retiro_bar: 2 funciones (retirar_efectivo_bar, anular_retiro_bar),
-- ninguna SECURITY DEFINER. select/insert/update.
--
-- Sin delete en ninguna — regla 4, se anula, no se borra.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "arqueo_select_autenticado" on arqueo;
create policy "arqueo_select_autenticado" on arqueo for select to authenticated using (true);
drop policy if exists "arqueo_insert_autenticado" on arqueo;
create policy "arqueo_insert_autenticado" on arqueo for insert to authenticated with check (true);
drop policy if exists "arqueo_update_autenticado" on arqueo;
create policy "arqueo_update_autenticado" on arqueo for update to authenticated using (true) with check (true);

drop policy if exists "retiro_bar_select_autenticado" on retiro_bar;
create policy "retiro_bar_select_autenticado" on retiro_bar for select to authenticated using (true);
drop policy if exists "retiro_bar_insert_autenticado" on retiro_bar;
create policy "retiro_bar_insert_autenticado" on retiro_bar for insert to authenticated with check (true);
drop policy if exists "retiro_bar_update_autenticado" on retiro_bar;
create policy "retiro_bar_update_autenticado" on retiro_bar for update to authenticated using (true) with check (true);

comment on table arqueo is 'Arqueos de caja (torneo/bar). RLS propuesto 22/08: select/insert/update. 4 funciones no-SECURITY-DEFINER.';
comment on table retiro_bar is 'Retiros de efectivo del bar. RLS propuesto 22/08: select/insert/update. 2 funciones no-SECURITY-DEFINER.';