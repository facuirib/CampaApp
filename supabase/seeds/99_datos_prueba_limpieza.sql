-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  LIMPIEZA DE LOS DATOS DE PRUEBA                                         ║
-- ║                                                                          ║
-- ║  Borra exactamente lo que creó 99_datos_prueba.sql y nada más. El padrón ║
-- ║  de equipos, la estructura del torneo, el tarifario, el calendario y el  ║
-- ║  catálogo de gastos quedan intactos: el seed no los tocó.                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── El orden importa, y no es el intuitivo ──────────────────────────────────
--
-- `pago.asiento_id → asiento` es NO ACTION, así que un asiento no se puede
-- borrar mientras un pago lo apunte: los pagos van ANTES que los asientos.
-- Lo mismo con `gasto.asiento_dev_id` y `asiento_pag_id`.
-- Y `pago_imputacion → cuota` es RESTRICT, así que las imputaciones van antes
-- que las cuotas.
--
-- El orden que queda es:
--
--   pago_imputacion → pago → cuota → equipo_torneo
--                   → gasto → asiento_linea → asiento
--
-- ── Qué NO se borra ─────────────────────────────────────────────────────────
--
-- Los períodos que `periodo_de_fecha()` haya creado al asentar los cobros. Son
-- estructura contable, no datos de prueba, y se reusan. Si querés dejar el
-- ejercicio como estaba, mirá los que quedaron en cero y borralos a mano.

do $$
declare
  v_pagos     int := 0;
  v_imput     int := 0;
  v_cuotas    int := 0;
  v_fichas    int := 0;
  v_gastos    int := 0;
  v_activos   int := 0;
  v_sueldos   int := 0;
  v_devsoc    int := 0;
  v_devspo    int := 0;
  v_cuospo    int := 0;
  v_contspo   int := 0;
  v_terspo    int := 0;
  v_usdop     int := 0;
  v_preslin   int := 0;
  v_pres      int := 0;
  v_lineas    int := 0;
  v_asientos  int := 0;
begin
  if to_regclass('public._prueba_marca') is null then
    raise notice 'No hay marcador: el set de prueba no está sembrado.';
    return;
  end if;

  -- 1 · imputaciones de los pagos de prueba
  delete from pago_imputacion pi
   where pi.pago_id in (select id from public._prueba_marca where tipo = 'pago');
  get diagnostics v_imput = row_count;

  -- 2 · pagos (antes que sus asientos)
  delete from pago p
   where p.id in (select id from public._prueba_marca where tipo = 'pago');
  get diagnostics v_pagos = row_count;

  -- 3 · cuotas de las fichas de prueba
  delete from cuota c
   where c.equipo_torneo_id in (select id from public._prueba_marca where tipo = 'equipo_torneo');
  get diagnostics v_cuotas = row_count;

  -- 4 · fichas
  delete from equipo_torneo et
   where et.id in (select id from public._prueba_marca where tipo = 'equipo_torneo');
  get diagnostics v_fichas = row_count;

  -- 5 · gastos (antes que sus asientos, por asiento_dev_id / asiento_pag_id)
  delete from gasto g
   where g.id in (select id from public._prueba_marca where tipo = 'gasto');
  get diagnostics v_gastos = row_count;

  -- 6 · activos (después de los gastos: gasto.activo_id los referencia)
  delete from activo a
   where a.id in (select id from public._prueba_marca where tipo = 'activo');
  get diagnostics v_activos = row_count;

  -- 7 · socios: devengos y sueldos pactados (antes que sus asientos)
  delete from devengo_socio d
   where d.id in (select id from public._prueba_marca where tipo = 'devengo_socio');
  get diagnostics v_devsoc = row_count;

  delete from sueldo_socio s
   where s.id in (select id from public._prueba_marca where tipo = 'sueldo_socio');
  get diagnostics v_sueldos = row_count;

  -- 8 · sponsors, de la hoja al tronco: devengos y cuotas cuelgan del
  --     contrato, y el contrato apunta a su asiento de firma.
  delete from devengo_sponsor d
   where d.id in (select id from public._prueba_marca where tipo = 'devengo_sponsor');
  get diagnostics v_devspo = row_count;

  delete from cuota_cobro_sponsor q
   where q.id in (select id from public._prueba_marca where tipo = 'cuota_cobro_sponsor');
  get diagnostics v_cuospo = row_count;

  delete from contrato_sponsor c
   where c.id in (select id from public._prueba_marca where tipo = 'contrato_sponsor');
  get diagnostics v_contspo = row_count;

  -- 9 · presupuesto: las líneas antes que su cabecera
  delete from presupuesto_linea pl
   where pl.id in (select id from public._prueba_marca where tipo = 'presupuesto_linea');
  get diagnostics v_preslin = row_count;

  delete from presupuesto p
   where p.id in (select id from public._prueba_marca where tipo = 'presupuesto');
  get diagnostics v_pres = row_count;

  -- 10 · operaciones en dólares (antes que sus asientos)
  delete from usd_operacion u
   where u.id in (select id from public._prueba_marca where tipo = 'usd_operacion');
  get diagnostics v_usdop = row_count;

  -- 11 · líneas y asientos
  delete from asiento_linea l
   where l.asiento_id in (select id from public._prueba_marca where tipo = 'asiento');
  get diagnostics v_lineas = row_count;

  delete from asiento a
   where a.id in (select id from public._prueba_marca where tipo = 'asiento');
  get diagnostics v_asientos = row_count;

  -- 12 · los sponsors como tercero, AL FINAL: asiento_linea.tercero_id los
  --      referencia, así que recién se pueden borrar con las líneas ya idas.
  --      Los socios NO se borran: Guille y Agus son datos reales del seed 03,
  --      lo de prueba eran su sueldo y sus devengos.
  delete from tercero t
   where t.id in (select id from public._prueba_marca where tipo = 'tercero_sponsor');
  get diagnostics v_terspo = row_count;

  raise notice 'Borrado: % imputaciones, % pagos, % cuotas, % fichas, % gastos, % activos, '
               '% sueldos, % devengos de socio, % devengos de sponsor, % cuotas de sponsor, '
               '% contratos, % sponsors, % operaciones USD, % líneas de presupuesto, '
               '% presupuestos, % líneas, % asientos.',
    v_imput, v_pagos, v_cuotas, v_fichas, v_gastos, v_activos,
    v_sueldos, v_devsoc, v_devspo, v_cuospo, v_contspo, v_terspo, v_usdop,
    v_preslin, v_pres, v_lineas, v_asientos;
end $$;

-- El marcador se va con los datos que marcaba: sin rastro.
drop table if exists public._prueba_marca;
