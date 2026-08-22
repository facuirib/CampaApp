-- ═══════════════════════════════════════════════════════════════
-- RLS · cuota + pago_imputacion — decimoseptima/decimoctava tabla
-- PROPUESTA, NO ACTIVAR (ENABLE) sin confirmación de Facu.
--
-- cuota: tocada por imputar_pago, registrar_cobro_sponsor (funciones,
-- prosecdef=false), y por sync_cuota_pagada/sync_cuota_vence_at
-- (TRIGGERS, se disparan desde UPDATE en pago_imputacion/jornada — un
-- trigger corre con los permisos de quien hizo el UPDATE original, no
-- aparte, así que si jornada tiene policy pero cuota no, el trigger
-- fallaría al escribir en cuota sin permiso). Necesita
-- select/insert/update.
--
-- pago_imputacion: tocada por imputar_pago. Necesita select/insert.
-- Sin update/delete — una imputación no se edita, se corrige con otra
-- imputación o anulando el pago completo.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "cuota_select_autenticado" on cuota;
create policy "cuota_select_autenticado"
  on cuota for select to authenticated using (true);
drop policy if exists "cuota_insert_autenticado" on cuota;
create policy "cuota_insert_autenticado"
  on cuota for insert to authenticated with check (true);
drop policy if exists "cuota_update_autenticado" on cuota;
create policy "cuota_update_autenticado"
  on cuota for update to authenticated using (true) with check (true);

drop policy if exists "pago_imputacion_select_autenticado" on pago_imputacion;
create policy "pago_imputacion_select_autenticado"
  on pago_imputacion for select to authenticated using (true);
drop policy if exists "pago_imputacion_insert_autenticado" on pago_imputacion;
create policy "pago_imputacion_insert_autenticado"
  on pago_imputacion for insert to authenticated with check (true);

comment on table cuota is
  'Cuotas de equipo (por partido, inscripción, etc). RLS propuesto '
  '22/08: select/insert/update. Tocada por funciones Y por triggers '
  'disparados desde jornada/pago_imputacion.';
comment on table pago_imputacion is
  'Imputación de un pago a cuotas. RLS propuesto 22/08: select/insert. '
  'Sin update/delete — no se edita, se corrige con otra imputación.';