-- ═══════════════════════════════════════════════════════════════════════════
-- Plan de cuentas · GRUPO 1 · renombres y limpieza sin asientos
--
-- Primer paso del reordenamiento especificado en
-- `docs/plan-cuentas-reordenamiento.md`. Es el grupo trivial: **ninguna de
-- estas seis operaciones toca un asiento**.
--
-- Lo que las hace seguras, verificado antes de escribir esto:
--
--   · Un renombre de `cat_gasto.nombre` no mueve nada. El gasto sigue
--     apuntando a la misma fila, y su asiento sigue contra la misma cuenta —
--     `registrar_gasto` resuelve la cuenta por `cat_gasto.cuenta_id`, que acá
--     no se toca. «Otros Gastos Fecha» tiene 1 gasto ya asentado y no se
--     entera.
--
--   · Los borrados son de filas que nadie referencia: los 11 gastos y las 6
--     líneas de presupuesto del sistema tienen `concepto_id` en NULL, y
--     «Mantenimiento eventual» no tiene gastos, ni presupuesto, ni conceptos.
--
-- ── Por qué cada UPDATE se acota por cuenta ────────────────────────────────
--
-- Hay DOS categorías llamadas «Extras»: una en GAS_BAR y otra en GAS_FECHA, y
-- se renombran a cosas distintas. Un `where nombre = 'Extras'` a secas las
-- pisaría a las dos. El `cuenta_id` en el where no es defensivo: es lo único
-- que distingue una de la otra.
--
-- ── Sobre el UNIQUE, que no es el que uno esperaría ────────────────────────
--
-- `cat_gasto` tiene `unique (area, nombre)` — por ÁREA, no por cuenta. Por eso
-- los dos «Extras» pueden convivir: uno es área `bar` y el otro `torneo`.
-- Verificado que ninguno de los cuatro nombres nuevos colisiona dentro de su
-- área. Vale tenerlo presente en el grupo 2, donde una categoría cambia de
-- área y ahí el UNIQUE sí puede morder.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1.1 · GAS_FECHA · «Extras» → «Otros Gastos Fecha» ──────────────────────
-- La que tiene el gasto asentado. Se renombra para que deje de ser ambigua
-- con la «Extras» del bar: en la matriz del P&L iban a ser dos filas iguales.
update cat_gasto
   set nombre = 'Otros Gastos Fecha'
 where nombre = 'Extras'
   and cuenta_id = (select id from cuenta where codigo = 'GAS_FECHA');


-- ── 1.2 · GAS_BAR · «Extras» → «Extras Bar» ────────────────────────────────
update cat_gasto
   set nombre = 'Extras Bar'
 where nombre = 'Extras'
   and cuenta_id = (select id from cuenta where codigo = 'GAS_BAR');


-- ── 1.3 · GAS_PREDIO · «Mantenimiento» → «Mantenimiento Predio» ────────────
-- Queda distinguible de «Mantenimiento - Personal», que es de sueldos y se
-- renombra abajo.
update cat_gasto
   set nombre = 'Mantenimiento Predio'
 where nombre = 'Mantenimiento'
   and cuenta_id = (select id from cuenta where codigo = 'GAS_PREDIO');


-- ── 1.4 · GAS_SUELDOS · «Mantenimiento - Personal» → «Sueldos Predio» ──────
--
-- Cambia SOLO el nombre: la categoría se queda en GAS_SUELDOS, porque es el
-- sueldo de la gente que mantiene el predio, no un gasto de predio.
--
-- Su `area` sigue siendo `administracion`. El nombre dice "Predio" y el área
-- dice "administración", que se lee raro — pero el área es de dónde sale la
-- plata, no de qué habla el nombre, y moverla cambiaría a qué unidad de costo
-- se imputa. Se deja como está; si hay que revisarlo es otra decisión.
update cat_gasto
   set nombre = 'Sueldos Predio'
 where nombre = 'Mantenimiento - Personal'
   and cuenta_id = (select id from cuenta where codigo = 'GAS_SUELDOS');


-- ── 1.5 · GAS_FECHA · «Viáticos» pierde sus 7 conceptos ────────────────────
--
-- Los siete duplicaban categorías que ya existen por su cuenta:
-- «Estacionamiento», «Guardias» y «Limpieza» son categorías de GAS_PREDIO, y
-- «Ballboys» y «Veedores» son conceptos de «Operativos». Tener el viático de
-- cada uno como concepto aparte partía el gasto de una misma persona en dos
-- lugares del plan.
--
-- Se borran y no se desactivan: no los referencia nada —ningún gasto usa
-- `concepto_id`— y dejarlos inactivos sería arrastrar ruido en el catálogo que
-- alguien va a tener que leer igual.
delete from concepto_gasto
 where cat_gasto_id = (
   select cg.id from cat_gasto cg
     join cuenta c on c.id = cg.cuenta_id
    where cg.nombre = 'Viáticos' and c.codigo = 'GAS_FECHA'
 );


-- ── 1.6 · GAS_PREDIO · borrar «Mantenimiento eventual» ─────────────────────
--
-- Sin gastos, sin presupuesto y sin conceptos: nunca se usó. Lo eventual del
-- mantenimiento es la `naturaleza` del gasto, no una categoría aparte — para
-- eso está `cat_gasto.naturaleza`, que ya distingue `recurrente` de `eventual`.
--
-- El `on delete cascade` de concepto_gasto no hace nada acá porque no tiene
-- conceptos, pero conviene saberlo: borrar una categoría se lleva los suyos.
delete from cat_gasto
 where nombre = 'Mantenimiento eventual'
   and cuenta_id = (select id from cuenta where codigo = 'GAS_PREDIO');
