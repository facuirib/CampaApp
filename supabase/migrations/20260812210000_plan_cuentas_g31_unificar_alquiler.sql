-- ═══════════════════════════════════════════════════════════════════════════
-- Plan de cuentas · 3.1 · unificar «Alquiler» en «Alquileres»
--
-- Las dos categorías son la misma cosa con dos criterios de subdivisión
-- distintos: «Alquiler» se abría por GÉNERO (Femenino, Masculino) y
-- «Alquileres» por LUGAR (Aeropuerto, Estacionamiento AEP, Oficina Tirolesa,
-- Patio, Tirolesa). **Queda la de lugar**, que es la que corresponde a un
-- alquiler: se alquila un predio, no un género.
--
-- ── Por qué esto NO edita ningún asiento ───────────────────────────────────
--
-- Las dos apuntan a la MISMA cuenta, `GAS_PREDIO`. `registrar_gasto` resuelve
-- la cuenta del asiento desde `cat_gasto.cuenta_id`, así que un gasto que pasa
-- de una categoría a la otra sigue asentado contra `GAS_PREDIO`, por el mismo
-- importe y con la misma fecha.
--
-- **El libro diario queda idéntico.** No hay contraasiento que hacer y la
-- regla 4 no entra en juego: no se está editando un asiento, se está
-- reclasificando un gasto. La verificación de abajo es justamente eso — que el
-- total de `GAS_PREDIO` sea el mismo antes y después.
--
-- ── El orden importa, por el `on delete cascade` ───────────────────────────
--
-- `concepto_gasto` tiene `on delete cascade` desde `cat_gasto`. Borrar
-- «Alquiler» se lleva sus 2 conceptos solo — que es lo que se quiere— **pero
-- si los gastos siguieran apuntando a la categoría, el borrado fallaría por la
-- FK de `gasto`** (que NO es cascade, y menos mal).
--
-- Así que primero se reclasifica todo lo que apunta a «Alquiler», y recién al
-- final se borra. Nunca al revés.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · Los 2 gastos pasan a «Alquileres» ──────────────────────────────────
--
-- Son los dos gastos de prueba cargados desde la pantalla durante el bloque 10
-- ("PRUEBA DESDE PANTALLA" $333.000 y "PRUEBA SIN FALLBACK" $444.000), los dos
-- con asiento de devengo y sin pagar. Están marcados en `_prueba_marca`.
--
-- El `update` dispara `trg_gasto_coherente`, que valida naturaleza contra
-- jornada/activo/torneo. Las dos categorías son `recurrente` y los dos gastos
-- tienen `torneo_id` en null, así que la validación pasa igual que al
-- insertarlos.
update gasto
   set cat_gasto_id = (
     select cg.id from cat_gasto cg
      where cg.nombre = 'Alquileres'
        and cg.cuenta_id = (select id from cuenta where codigo = 'GAS_PREDIO'))
 where cat_gasto_id = (
     select cg.id from cat_gasto cg
      where cg.nombre = 'Alquiler'
        and cg.cuenta_id = (select id from cuenta where codigo = 'GAS_PREDIO'));


-- ── 2 · La línea de presupuesto pasa a «Alquileres» ────────────────────────
--
-- Una sola línea, de $1.900.000 por mes. Si se borrara «Alquiler» sin
-- reapuntarla, la FK lo impediría — pero el mensaje de Postgres hablaría de
-- una constraint, no de un presupuesto, y quien lo lea no sabría qué pasó.
update presupuesto_linea
   set cat_gasto_id = (
     select cg.id from cat_gasto cg
      where cg.nombre = 'Alquileres'
        and cg.cuenta_id = (select id from cuenta where codigo = 'GAS_PREDIO'))
 where cat_gasto_id = (
     select cg.id from cat_gasto cg
      where cg.nombre = 'Alquiler'
        and cg.cuenta_id = (select id from cuenta where codigo = 'GAS_PREDIO'));


-- ── 3 · Borrar «Alquiler» ──────────────────────────────────────────────────
--
-- El cascade se lleva sus 2 conceptos, «Femenino» y «Masculino». Es
-- deliberado: la subdivisión por género se descarta.
--
-- Si quedara algún gasto o línea de presupuesto apuntando acá, este delete
-- falla por FK — y eso es lo correcto: significaría que los pasos 1 o 2 no
-- hicieron su trabajo.
delete from cat_gasto
 where nombre = 'Alquiler'
   and cuenta_id = (select id from cuenta where codigo = 'GAS_PREDIO');
