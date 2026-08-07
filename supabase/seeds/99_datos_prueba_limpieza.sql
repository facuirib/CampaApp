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

  -- 6 · líneas y asientos
  delete from asiento_linea l
   where l.asiento_id in (select id from public._prueba_marca where tipo = 'asiento');
  get diagnostics v_lineas = row_count;

  delete from asiento a
   where a.id in (select id from public._prueba_marca where tipo = 'asiento');
  get diagnostics v_asientos = row_count;

  raise notice 'Borrado: % imputaciones, % pagos, % cuotas, % fichas, % gastos, % líneas, % asientos.',
    v_imput, v_pagos, v_cuotas, v_fichas, v_gastos, v_lineas, v_asientos;
end $$;

-- El marcador se va con los datos que marcaba: sin rastro.
drop table if exists public._prueba_marca;
