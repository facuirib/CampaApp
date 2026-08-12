-- ═══════════════════════════════════════════════════════════════════════════
-- Plan de cuentas · 3.2 · sacar a los socios del catálogo de sueldos
--
-- «Agus» y «Guille» estaban cargados **dos veces**, en dos circuitos que no se
-- hablan:
--
--   · como `tercero` tipo `socio`, con su sueldo acordado en `sueldo_socio` y
--     3 devengos cada uno — $9.450.000 asentados contra `GAS_SOCIOS`;
--   · como `concepto_gasto` de «Sueldos administrativos», bajo `GAS_SUELDOS`.
--
-- Nada impedía cargar un gasto contra el concepto «Agus»: el sueldo de Agus
-- habría quedado contado dos veces, una por el devengo automático y otra como
-- gasto manual, en dos cuentas distintas. No pasó porque ningún gasto usa
-- `concepto_id` todavía — pero era una trampa cargada, no un riesgo teórico.
--
-- ── Por qué esto es TODO lo que hace la migración ──────────────────────────
--
-- El plan original tenía dos pasos más: crear «Sueldo Agus» y «Sueldo Guille»
-- en `GAS_SOCIOS` y reclasificar los $9.450.000 a esos conceptos. **Los dos se
-- descartaron al relevar, y conviene que quede escrito por qué.**
--
-- `devengar_sueldos_socios` **no crea un `gasto`**: llama a `crear_asiento`
-- directo, con `GAS_SOCIOS` al debe y `tercero_id` = el socio. Los 6 asientos
-- de la cuenta tienen `origen_id` en null y no hay un solo `gasto` que apunte
-- a `GAS_SOCIOS`.
--
-- Y `asiento_linea` no tiene columna de concepto —es `(asiento_id, cuenta_id,
-- debe, haber, tercero_id)`—. El concepto llega al diario únicamente por la
-- cadena `asiento.origen_id → gasto → cat_gasto`, y el módulo de socios no
-- pasa por ahí.
--
-- Entonces: **reclasificar era imposible** (no hay dónde escribir el concepto)
-- y **crear los conceptos habría sido peor** (nadie los escribiría nunca, y
-- quedarían en el catálogo de /gastos como opciones cargables — la misma
-- duplicación, mudada de cuenta).
--
-- **El sueldo de cada socio por separado se ve agrupando por `tercero_id`,
-- que ya está en cada línea.** Ver la nota en `decisiones.md`.
-- ═══════════════════════════════════════════════════════════════════════════

-- Verificado antes de escribir esto: los dos tienen 0 gastos y 0 líneas de
-- presupuesto, así que el borrado no deja nada huérfano.
--
-- Se acota por categoría Y cuenta: «Agus» y «Guille» podrían existir como
-- concepto en otro lado con otro sentido — de hecho existen «Nafta Agus» y
-- «Nafta Guille» en GAS_PREDIO, que son combustible y **no** se tocan.
delete from concepto_gasto
 where nombre in ('Agus', 'Guille')
   and cat_gasto_id = (
     select cg.id from cat_gasto cg
       join cuenta c on c.id = cg.cuenta_id
      where cg.nombre = 'Sueldos administrativos'
        and c.codigo = 'GAS_SUELDOS');
