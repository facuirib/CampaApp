-- ═══════════════════════════════════════════════════════════════
-- RLS · bloque final — 15 tablas restantes
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- Con escritura confirmada (funciones no-SECURITY-DEFINER):
--   caja/dia_cancha: crear_dia_cancha
--   anticipo/anticipo_uso: aplicar_anticipo
--   venta_bar: registrar_venta_bar, anular_venta_bar
--   periodo: cerrar_periodo, periodo_de_fecha
--   plan_pago: generar_cuotas_plan
--
-- Sin funcion de escritura confirmada por este patron de busqueda
-- (solo lectura, a revisar con Facu si falta alguna):
--   compromiso, cuenta, reclamo, equipo_playoff, escenario,
--   formato_instancia, envio, config_contable
--
-- torneo NO incluida — depende de crear_torneo, que sigue sin aplicar.
--
-- NOTA DE PROCESO: se aplico en 4 partes chicas en el SQL Editor
-- porque el bloque completo (15 tablas + comentarios con acentos) fallo
-- silenciosamente al pegarse de una vez. Los acentos en los comment on
-- table pueden haber sido la causa.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "caja_select_autenticado" on caja;
create policy "caja_select_autenticado" on caja for select to authenticated using (true);
drop policy if exists "caja_insert_autenticado" on caja;
create policy "caja_insert_autenticado" on caja for insert to authenticated with check (true);
drop policy if exists "caja_update_autenticado" on caja;
create policy "caja_update_autenticado" on caja for update to authenticated using (true) with check (true);

drop policy if exists "dia_cancha_select_autenticado" on dia_cancha;
create policy "dia_cancha_select_autenticado" on dia_cancha for select to authenticated using (true);
drop policy if exists "dia_cancha_insert_autenticado" on dia_cancha;
create policy "dia_cancha_insert_autenticado" on dia_cancha for insert to authenticated with check (true);
drop policy if exists "dia_cancha_update_autenticado" on dia_cancha;
create policy "dia_cancha_update_autenticado" on dia_cancha for update to authenticated using (true) with check (true);

drop policy if exists "anticipo_select_autenticado" on anticipo;
create policy "anticipo_select_autenticado" on anticipo for select to authenticated using (true);
drop policy if exists "anticipo_insert_autenticado" on anticipo;
create policy "anticipo_insert_autenticado" on anticipo for insert to authenticated with check (true);
drop policy if exists "anticipo_update_autenticado" on anticipo;
create policy "anticipo_update_autenticado" on anticipo for update to authenticated using (true) with check (true);

drop policy if exists "anticipo_uso_select_autenticado" on anticipo_uso;
create policy "anticipo_uso_select_autenticado" on anticipo_uso for select to authenticated using (true);
drop policy if exists "anticipo_uso_insert_autenticado" on anticipo_uso;
create policy "anticipo_uso_insert_autenticado" on anticipo_uso for insert to authenticated with check (true);

drop policy if exists "venta_bar_select_autenticado" on venta_bar;
create policy "venta_bar_select_autenticado" on venta_bar for select to authenticated using (true);
drop policy if exists "venta_bar_insert_autenticado" on venta_bar;
create policy "venta_bar_insert_autenticado" on venta_bar for insert to authenticated with check (true);
drop policy if exists "venta_bar_update_autenticado" on venta_bar;
create policy "venta_bar_update_autenticado" on venta_bar for update to authenticated using (true) with check (true);

drop policy if exists "periodo_select_autenticado" on periodo;
create policy "periodo_select_autenticado" on periodo for select to authenticated using (true);
drop policy if exists "periodo_insert_autenticado" on periodo;
create policy "periodo_insert_autenticado" on periodo for insert to authenticated with check (true);
drop policy if exists "periodo_update_autenticado" on periodo;
create policy "periodo_update_autenticado" on periodo for update to authenticated using (true) with check (true);

drop policy if exists "plan_pago_select_autenticado" on plan_pago;
create policy "plan_pago_select_autenticado" on plan_pago for select to authenticated using (true);
drop policy if exists "plan_pago_insert_autenticado" on plan_pago;
create policy "plan_pago_insert_autenticado" on plan_pago for insert to authenticated with check (true);
drop policy if exists "plan_pago_update_autenticado" on plan_pago;
create policy "plan_pago_update_autenticado" on plan_pago for update to authenticated using (true) with check (true);

drop policy if exists "compromiso_select_autenticado" on compromiso;
create policy "compromiso_select_autenticado" on compromiso for select to authenticated using (true);
drop policy if exists "cuenta_select_autenticado" on cuenta;
create policy "cuenta_select_autenticado" on cuenta for select to authenticated using (true);
drop policy if exists "reclamo_select_autenticado" on reclamo;
create policy "reclamo_select_autenticado" on reclamo for select to authenticated using (true);
drop policy if exists "equipo_playoff_select_autenticado" on equipo_playoff;
create policy "equipo_playoff_select_autenticado" on equipo_playoff for select to authenticated using (true);
drop policy if exists "escenario_select_autenticado" on escenario;
create policy "escenario_select_autenticado" on escenario for select to authenticated using (true);
drop policy if exists "formato_instancia_select_autenticado" on formato_instancia;
create policy "formato_instancia_select_autenticado" on formato_instancia for select to authenticated using (true);
drop policy if exists "envio_select_autenticado" on envio;
create policy "envio_select_autenticado" on envio for select to authenticated using (true);
drop policy if exists "config_contable_select_autenticado" on config_contable;
create policy "config_contable_select_autenticado" on config_contable for select to authenticated using (true);

comment on table caja is 'Cajas por predio. RLS propuesto 22/08: select/insert/update.';
comment on table dia_cancha is 'Dias de cancha. RLS propuesto 22/08: select/insert/update.';
comment on table anticipo is 'Anticipos de equipo. RLS propuesto 22/08: select/insert/update.';
comment on table anticipo_uso is 'Uso de anticipo contra cuota. RLS propuesto 22/08: select/insert.';
comment on table venta_bar is 'Ventas del bar. RLS propuesto 22/08: select/insert/update.';
comment on table periodo is 'Periodos contables. RLS propuesto 22/08: select/insert/update.';
comment on table plan_pago is 'Planes de pago (cuotas generadas). RLS propuesto 22/08: select/insert/update.';
comment on table compromiso is 'Compromisos de pago/cobro futuro. RLS propuesto 22/08: solo lectura.';
comment on table cuenta is 'Plan de cuentas. RLS propuesto 22/08: solo lectura.';
comment on table reclamo is 'Reclamos de deuda. RLS propuesto 22/08: solo lectura.';
comment on table equipo_playoff is 'Equipos en instancia de playoff. RLS propuesto 22/08: solo lectura.';
comment on table escenario is 'Escenarios de proyeccion. RLS propuesto 22/08: solo lectura.';
comment on table formato_instancia is 'Formato de instancias de playoff. RLS propuesto 22/08: solo lectura.';
comment on table envio is 'Envios (mail/notificacion). RLS propuesto 22/08: solo lectura.';
comment on table config_contable is 'Configuracion contable general. RLS propuesto 22/08: solo lectura.';