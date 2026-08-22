-- ═══════════════════════════════════════════════════════════════
-- RLS · sueldo_socio + devengo_socio + devengo_sponsor +
--       contrato_sponsor + cuota_cobro_sponsor — bloque societario
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- 5 funciones, ninguna SECURITY DEFINER (confirmado): cargar_cuotas_
-- sponsor, crear_contrato_sponsor, devengar_sponsors, devengar_sueldos_
-- socios, registrar_cobro_sponsor. Cada una toca su tabla asociada.
-- select/insert/update en las 5 — mismo criterio que el resto (sin
-- delete, regla 4).
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "sueldo_socio_select_autenticado" on sueldo_socio;
create policy "sueldo_socio_select_autenticado" on sueldo_socio for select to authenticated using (true);
drop policy if exists "sueldo_socio_insert_autenticado" on sueldo_socio;
create policy "sueldo_socio_insert_autenticado" on sueldo_socio for insert to authenticated with check (true);
drop policy if exists "sueldo_socio_update_autenticado" on sueldo_socio;
create policy "sueldo_socio_update_autenticado" on sueldo_socio for update to authenticated using (true) with check (true);

drop policy if exists "devengo_socio_select_autenticado" on devengo_socio;
create policy "devengo_socio_select_autenticado" on devengo_socio for select to authenticated using (true);
drop policy if exists "devengo_socio_insert_autenticado" on devengo_socio;
create policy "devengo_socio_insert_autenticado" on devengo_socio for insert to authenticated with check (true);

drop policy if exists "devengo_sponsor_select_autenticado" on devengo_sponsor;
create policy "devengo_sponsor_select_autenticado" on devengo_sponsor for select to authenticated using (true);
drop policy if exists "devengo_sponsor_insert_autenticado" on devengo_sponsor;
create policy "devengo_sponsor_insert_autenticado" on devengo_sponsor for insert to authenticated with check (true);

drop policy if exists "contrato_sponsor_select_autenticado" on contrato_sponsor;
create policy "contrato_sponsor_select_autenticado" on contrato_sponsor for select to authenticated using (true);
drop policy if exists "contrato_sponsor_insert_autenticado" on contrato_sponsor;
create policy "contrato_sponsor_insert_autenticado" on contrato_sponsor for insert to authenticated with check (true);
drop policy if exists "contrato_sponsor_update_autenticado" on contrato_sponsor;
create policy "contrato_sponsor_update_autenticado" on contrato_sponsor for update to authenticated using (true) with check (true);

drop policy if exists "cuota_cobro_sponsor_select_autenticado" on cuota_cobro_sponsor;
create policy "cuota_cobro_sponsor_select_autenticado" on cuota_cobro_sponsor for select to authenticated using (true);
drop policy if exists "cuota_cobro_sponsor_insert_autenticado" on cuota_cobro_sponsor;
create policy "cuota_cobro_sponsor_insert_autenticado" on cuota_cobro_sponsor for insert to authenticated with check (true);
drop policy if exists "cuota_cobro_sponsor_update_autenticado" on cuota_cobro_sponsor;
create policy "cuota_cobro_sponsor_update_autenticado" on cuota_cobro_sponsor for update to authenticated using (true) with check (true);

comment on table sueldo_socio is 'Sueldos de socios. RLS propuesto 22/08: select/insert/update.';
comment on table devengo_socio is 'Devengos de sueldo de socio. RLS propuesto 22/08: select/insert.';
comment on table devengo_sponsor is 'Devengos de contrato de sponsor. RLS propuesto 22/08: select/insert.';
comment on table contrato_sponsor is 'Contratos de sponsor. RLS propuesto 22/08: select/insert/update.';
comment on table cuota_cobro_sponsor is 'Cuotas de cobro a sponsor. RLS propuesto 22/08: select/insert/update.';