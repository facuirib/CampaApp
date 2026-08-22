-- ═══════════════════════════════════════════════════════════════
-- RLS · amortizacion + plan_tarifa + plan_tarifa_linea
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- amortizacion: asentar_amortizacion (confirmado no-SECURITY-DEFINER).
-- select/insert/update.
--
-- plan_tarifa y plan_tarifa_linea: sin función de escritura (confirmado)
-- — se cargan a mano. Solo lectura, mismo patrón que los catálogos.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "amortizacion_select_autenticado" on amortizacion;
create policy "amortizacion_select_autenticado" on amortizacion for select to authenticated using (true);
drop policy if exists "amortizacion_insert_autenticado" on amortizacion;
create policy "amortizacion_insert_autenticado" on amortizacion for insert to authenticated with check (true);
drop policy if exists "amortizacion_update_autenticado" on amortizacion;
create policy "amortizacion_update_autenticado" on amortizacion for update to authenticated using (true) with check (true);

drop policy if exists "plan_tarifa_select_autenticado" on plan_tarifa;
create policy "plan_tarifa_select_autenticado" on plan_tarifa for select to authenticated using (true);

drop policy if exists "plan_tarifa_linea_select_autenticado" on plan_tarifa_linea;
create policy "plan_tarifa_linea_select_autenticado" on plan_tarifa_linea for select to authenticated using (true);

comment on table amortizacion is 'Amortizaciones de activos. RLS propuesto 22/08: select/insert/update.';
comment on table plan_tarifa is 'Catálogo de planes de tarifa. RLS propuesto 22/08: solo lectura (sin función de escritura).';
comment on table plan_tarifa_linea is 'Líneas de plan de tarifa. RLS propuesto 22/08: solo lectura (sin función de escritura).';