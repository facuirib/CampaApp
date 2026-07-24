-- Tests del motor de asientos (migración 004)
--
-- Correr sobre una base con el esquema aplicado.
-- Cada bloque dice si debe PASAR o FALLAR.
--
-- En el SQL Editor de Supabase: correr de a un bloque.

-- ── Preparación ──
insert into ejercicio(anio,fecha_desde,fecha_hasta)
  values (2026,'2026-01-01','2026-12-31')
  on conflict (anio) do nothing;


-- ═══ CREAR ═══

-- T1 · Asiento balanceado con predio → PASA
select crear_asiento('2026-03-15','pago_equipo','Cobro cuota 1',
  '[{"cuenta":"CAJA_EFECTIVO","debe":1750000},
    {"cuenta":"DEUDORES","haber":1750000}]'::jsonb,
  null, null, (select id from predio where codigo='TIR'));

-- T2 · Desbalanceado → FALLA
-- "El asiento no balancea: debe 1000.00 · haber 900.00 · diferencia 100.00"
select crear_asiento('2026-03-16','ajuste','test',
  '[{"cuenta":"CAJA_EFECTIVO","debe":1000},{"cuenta":"DEUDORES","haber":900}]'::jsonb,
  null,null,(select id from predio where codigo='TIR'));

-- T3 · Cuenta inexistente → FALLA
select crear_asiento('2026-03-16','ajuste','test',
  '[{"cuenta":"NO_EXISTE","debe":1000},{"cuenta":"DEUDORES","haber":1000}]'::jsonb);

-- T4 · Una sola línea → FALLA
select crear_asiento('2026-03-16','ajuste','test',
  '[{"cuenta":"CAJA_TRANSFERENCIA","debe":1000}]'::jsonb);

-- T5 · Importe negativo → FALLA
select crear_asiento('2026-03-16','ajuste','test',
  '[{"cuenta":"CAJA_TRANSFERENCIA","debe":-1000},{"cuenta":"DEUDORES","haber":-1000}]'::jsonb);

-- T6 · Debe y haber en la misma línea → FALLA
select crear_asiento('2026-03-16','ajuste','test',
  '[{"cuenta":"CAJA_TRANSFERENCIA","debe":1000,"haber":500},{"cuenta":"DEUDORES","haber":500}]'::jsonb);

-- T7 · Fecha sin ejercicio → FALLA
select crear_asiento('2030-01-01','ajuste','test',
  '[{"cuenta":"CAJA_TRANSFERENCIA","debe":100},{"cuenta":"DEUDORES","haber":100}]'::jsonb);

-- T8 · Efectivo sin predio → FALLA
-- "Un movimiento de Caja Efectivo requiere predio_id"
select crear_asiento('2026-03-17','ajuste','sin predio',
  '[{"cuenta":"CAJA_EFECTIVO","debe":500},{"cuenta":"DEUDORES","haber":500}]'::jsonb);

-- T9 · Transferencia sin predio → PASA
select crear_asiento('2026-03-17','pago_equipo','por transferencia',
  '[{"cuenta":"CAJA_TRANSFERENCIA","debe":800000},{"cuenta":"DEUDORES","haber":800000}]'::jsonb);


-- ═══ ANULAR ═══

-- T10 · Anular → PASA, genera contraasiento
select anular_asiento(
  (select id from asiento where descripcion = 'Cobro cuota 1'),
  'Error de carga', '2026-03-20');

-- T11 · El original queda marcado y el contraasiento invierte
select fecha, descripcion, total_debe, anulado from v_libro_diario order by created_at;

select cuenta_codigo, debe, haber from v_asiento_detalle
 where asiento like 'Anulación%' order by cuenta_codigo;

-- T12 · Anular dos veces → FALLA
select anular_asiento(
  (select id from asiento where descripcion = 'Cobro cuota 1'), 'otra vez');

-- T13 · Anular un contraasiento → FALLA
select anular_asiento(
  (select id from asiento where descripcion like 'Anulación%'), 'no');


-- ═══ PERÍODO ═══

-- T14 · El período se crea solo
select anio, mes, estado from periodo order by mes;

-- T15 · Escribir en período cerrado → FALLA
update periodo set estado='cerrado' where mes=3;
select crear_asiento('2026-03-25','ajuste','tarde',
  '[{"cuenta":"CAJA_TRANSFERENCIA","debe":100},{"cuenta":"DEUDORES","haber":100}]'::jsonb);

-- T16 · Otro mes sigue abierto → PASA
select crear_asiento('2026-04-05','ajuste','en abril',
  '[{"cuenta":"CAJA_TRANSFERENCIA","debe":100},{"cuenta":"DEUDORES","haber":100}]'::jsonb);


-- ═══ SALDOS ═══

-- T17 · El anulado y su contraasiento se cancelan
-- Efectivo TIR debe dar 0: se cobró 1.750.000 y se anuló
select tipo, nombre, predio, saldo from v_saldo_caja order by tipo, nombre;

-- T18 · saldo_cuenta respeta la naturaleza
select saldo_cuenta('CAJA_TRANSFERENCIA') as caja_transf,
       saldo_cuenta('DEUDORES')           as deudores;


-- ═══ LIMPIEZA ═══
-- Nota: el período quedó cerrado y el trigger impide reabrirlo (correcto).
-- Se borra en cascada desde el ejercicio.
delete from asiento_linea where asiento_id in (select id from asiento);
delete from asiento;
delete from periodo where ejercicio_id in (select id from ejercicio where anio=2026);
delete from ejercicio where anio=2026;
