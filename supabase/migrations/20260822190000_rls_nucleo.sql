-- ═══════════════════════════════════════════════════════════════
-- RLS · asiento + asiento_linea + gasto + pago — núcleo del motor
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- Las 4 tablas centrales del sistema. Confirmado que NINGUNA función
-- que las toca es SECURITY DEFINER:
--   asiento/asiento_linea: crear_asiento, anular_asiento (y por
--     extensión TODAS las funciones que llaman a crear_asiento — es la
--     única vía de escritura al diario).
--   gasto: registrar_gasto, pagar_gasto, anular_gasto,
--     crear_gasto_planificado, marcar_gasto_planificado_ejecutado.
--   pago: registrar_cobro, imputar_pago, recibir_efectivo_en_transito.
--
-- Todas necesitan select/insert/update. Sin delete en ninguna — regla 4
-- del proyecto: nada se borra, se corrige con contraasiento
-- (anular_asiento) o cambio de estado.
--
-- ⚠️ ESTA ES LA MIGRACIÓN MÁS IMPORTANTE DEL BLOQUE: si alguna policy
-- queda mal y se activa RLS, prácticamente todo el sistema deja de
-- poder escribir (cualquier cobro, pago, gasto pasa por acá). Revisar
-- con más cuidado que las anteriores antes de activar ENABLE.
--
-- pago_imputacion también se toca desde imputar_pago — no incluida acá
-- todavía, queda para la próxima migración de este bloque.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "asiento_select_autenticado" on asiento;
create policy "asiento_select_autenticado"
  on asiento for select to authenticated using (true);
drop policy if exists "asiento_insert_autenticado" on asiento;
create policy "asiento_insert_autenticado"
  on asiento for insert to authenticated with check (true);
drop policy if exists "asiento_update_autenticado" on asiento;
create policy "asiento_update_autenticado"
  on asiento for update to authenticated using (true) with check (true);

drop policy if exists "asiento_linea_select_autenticado" on asiento_linea;
create policy "asiento_linea_select_autenticado"
  on asiento_linea for select to authenticated using (true);
drop policy if exists "asiento_linea_insert_autenticado" on asiento_linea;
create policy "asiento_linea_insert_autenticado"
  on asiento_linea for insert to authenticated with check (true);

drop policy if exists "gasto_select_autenticado" on gasto;
create policy "gasto_select_autenticado"
  on gasto for select to authenticated using (true);
drop policy if exists "gasto_insert_autenticado" on gasto;
create policy "gasto_insert_autenticado"
  on gasto for insert to authenticated with check (true);
drop policy if exists "gasto_update_autenticado" on gasto;
create policy "gasto_update_autenticado"
  on gasto for update to authenticated using (true) with check (true);

drop policy if exists "pago_select_autenticado" on pago;
create policy "pago_select_autenticado"
  on pago for select to authenticated using (true);
drop policy if exists "pago_insert_autenticado" on pago;
create policy "pago_insert_autenticado"
  on pago for insert to authenticated with check (true);
drop policy if exists "pago_update_autenticado" on pago;
create policy "pago_update_autenticado"
  on pago for update to authenticated using (true) with check (true);

-- ⚠️ NO EJECUTAR hasta confirmar con Facu (y con MÁS cuidado que las
-- anteriores — es el núcleo del sistema):
-- alter table asiento enable row level security;
-- alter table asiento_linea enable row level security;
-- alter table gasto enable row level security;
-- alter table pago enable row level security;

comment on table asiento is
  'El diario. RLS propuesto 22/08: select/insert/update para '
  'authenticated. crear_asiento/anular_asiento NO son SECURITY DEFINER. '
  'Núcleo del sistema — activar con máximo cuidado.';
comment on table gasto is
  'Gastos. RLS propuesto 22/08: select/insert/update. 5 funciones NO son '
  'SECURITY DEFINER.';
comment on table pago is
  'Pagos/cobros recibidos. RLS propuesto 22/08: select/insert/update. 3 '
  'funciones NO son SECURITY DEFINER.';