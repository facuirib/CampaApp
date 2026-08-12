-- ═══════════════════════════════════════════════════════════════════════════
-- Plan de cuentas · GRUPO 2 · categorías que cambian de cuenta
--
-- Segundo paso del reordenamiento (`docs/plan-cuentas-reordenamiento.md`).
-- Cambia `cat_gasto.cuenta_id`: a qué cuenta van a imputar los gastos FUTUROS
-- de estas categorías.
--
-- **Ningún gasto histórico se reclasifica**, porque las tres tienen cero
-- gastos y cero líneas de presupuesto. Verificado antes de escribir esto. Si
-- alguna tuviera un gasto asentado, mover su cuenta cambiaría a qué cuenta
-- imputa el asiento futuro pero NO el ya hecho, y quedaría un histórico
-- partido en dos cuentas — por eso la verificación es la precondición, no un
-- detalle.
--
-- ── Qué arregla ────────────────────────────────────────────────────────────
--
-- `GAS_SUELDOS` tenía adentro cosas que no son sueldos: 8 conceptos
-- impositivos (IVA, IIBB, F931, UTEDYC…) y 3 de moratorias fiscales (ARCA,
-- Municipalidad, Rentas), mientras `GAS_IMPUESTOS` estaba vacía. Y «Nafta»,
-- que es combustible.
--
-- Después de esto, `GAS_SUELDOS` queda con «Sueldos administrativos» y
-- «Sueldos Predio», que es lo que su nombre dice.
--
-- ── El `area`, que es lo que puede morder ──────────────────────────────────
--
-- `cat_gasto` tiene `unique (area, nombre)` — por ÁREA, no por cuenta. Así que
-- el riesgo de este grupo no está en la cuenta: está en que «Nafta» cambia de
-- área y podría chocar con una «Nafta» que ya viviera en `predio`.
--
-- **Verificado: no hay ninguna.** Las diez categorías de área `predio` son
-- Alquiler, Alquileres, Compras e insumos, Equipamiento, Estacionamiento,
-- Guardias, Limpieza, Mantenimiento Predio, Seguridad y Servicios.
--
-- Las otras dos NO cambian de área: se van a `GAS_IMPUESTOS` pero siguen
-- siendo `administracion`. No es una excepción a "el área acompaña" — es que
-- el área del destino ES administración: `area` sólo admite torneo, predio,
-- bar y administracion, y los impuestos son administración. La cuenta dice
-- QUÉ gasto es; el área, de qué parte del negocio sale la plata.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 2.1 · «Impositivos» · GAS_SUELDOS → GAS_IMPUESTOS ──────────────────────
-- 8 conceptos: Comercio e Industria CBA · Créd/Déb bancarios · F931 · IIBB ·
-- IVA · Municipalidad TIR · Retención IIBB · UTEDYC.
-- El área se queda en `administracion` (ver nota de arriba).
update cat_gasto
   set cuenta_id = (select id from cuenta where codigo = 'GAS_IMPUESTOS')
 where nombre = 'Impositivos'
   and cuenta_id = (select id from cuenta where codigo = 'GAS_SUELDOS');


-- ── 2.2 · «Planes de Pago» · GAS_SUELDOS → GAS_IMPUESTOS ───────────────────
-- 3 conceptos: ARCA · Municipalidad · Rentas. Son moratorias fiscales.
--
-- Nota de nomenclatura, para que no confunda: esta categoría no tiene relación
-- con la tabla `plan_pago` ni con `compromiso`, que son las moratorias como
-- deuda. Acá es la categoría con la que se clasifica el gasto cuando se paga
-- una cuota de esa moratoria.
update cat_gasto
   set cuenta_id = (select id from cuenta where codigo = 'GAS_IMPUESTOS')
 where nombre = 'Planes de Pago'
   and cuenta_id = (select id from cuenta where codigo = 'GAS_SUELDOS');


-- ── 2.3 · «Nafta» · GAS_SUELDOS → GAS_PREDIO, y de administración a predio ──
-- 2 conceptos: Nafta Agus · Nafta Guille.
--
-- Es el único de los tres que cambia de área, y por eso el único que podía
-- chocar con el unique. No choca.
update cat_gasto
   set cuenta_id = (select id from cuenta where codigo = 'GAS_PREDIO'),
       area      = 'predio'
 where nombre = 'Nafta'
   and cuenta_id = (select id from cuenta where codigo = 'GAS_SUELDOS');
