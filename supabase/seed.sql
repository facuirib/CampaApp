-- ═══════════════════════════════════════════════════════════════════════════
-- SEED · DATOS DE PRUEBA
--
-- ⚠ **Nada de acá es estructura.** Sirve para tener con qué mirar las
-- pantallas en un entorno local: un torneo de ejemplo con su tarifario, para
-- que las listas no estén vacías.
--
-- **La estructura que el sistema necesita para arrancar —plan de cuentas,
-- predios, cajas, catálogo de gastos, ejercicio, plantillas— vive en la
-- migración `20260816162556_siembra_estructura.sql`.** Ahí es donde hay que
-- agregar algo que el sistema necesite para funcionar; acá, sólo lo que sirve
-- para verlo funcionando.
--
-- ── Por qué se partió en dos ───────────────────────────────────────────────
--
-- Este archivo tenía las dos cosas mezcladas, y era la única fuente de 23 de
-- las 28 cuentas. Como ningún automatismo lo corría, **la base no se podía
-- reconstruir desde las migraciones**: quedaba con 5 cuentas y rompía en el
-- primer `crear_asiento` con "cuenta no encontrada", sin que nada fallara
-- antes.
--
-- Y tenía un problema propio: quedó **desactualizado**. Después del
-- reordenamiento del plan de cuentas seguía con el catálogo viejo —«Extras»
-- dos veces, «Alquiler» y «Alquileres» separadas, «Mantenimiento eventual»,
-- los conceptos «Agus» y «Guille» que duplicaban a los socios—. Correrlo
-- habría recreado justo lo que se acababa de limpiar.
--
-- La estructura se movió a la migración, generada leyendo la base. Lo que
-- queda acá es lo que siempre debió ser: datos para probar.
--
-- ── Cómo se usa ────────────────────────────────────────────────────────────
--
-- `supabase db reset` lo corre solo en local, después de las migraciones —está
-- declarado en `[db.seed]` de `config.toml`. **No se aplica nunca a la base
-- compartida.**
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Torneo de ejemplo ──────────────────────────────────────────────────────
--
-- Uno solo, y con nombre que se distingue de los reales: la base tiene
-- «Clausura 2026» y «Apertura 2027», y este seed no debe pisarlos ni
-- confundirse con ellos.
--
-- `activo = false` a propósito: las pantallas que eligen "el torneo en curso"
-- no tienen por qué encontrarse con uno de prueba.
--
-- La idempotencia cuelga de `(temporada, anio)`, que es el unique **real** de
-- la tabla. Colgarla del nombre parece más legible y es incorrecto: si esa
-- combinación ya estuviera ocupada por otro torneo, el `insert` no entra, y un
-- `not exists` por nombre daría verdadero igual y saldría a buscar un torneo
-- que no existe.
insert into torneo (nombre, temporada, anio, activo, estado)
values ('DEMO · torneo de prueba', 'apertura', 2026, false, 'planificado')
on conflict (temporada, anio) do nothing;


-- ── Una categoría con una serie ────────────────────────────────────────────
--
-- Está acá por una razón concreta: **`crear_equipo_torneo` pide un
-- `p_serie_id`**. Sin serie, el tarifario de abajo se puede mirar pero no se
-- puede usar para armar una ficha, que es la mitad de para qué existe este
-- archivo.
--
-- Nombres genéricos a propósito. Poner «Libre» o «Sub-23» sería copiar
-- categorías reales de un torneo real a un archivo de prueba — justo lo que la
-- regla 12 saca del código.
insert into categoria (torneo_id, nombre, genero, orden)
select t.id, 'DEMO · categoría A', 'masculino', 1
  from torneo t where (t.temporada, t.anio) = ('apertura', 2026)
on conflict (torneo_id, nombre) do nothing;

insert into serie (categoria_id, nombre, orden)
select c.id, 'DEMO · serie 1', 1
  from categoria c
  join torneo t on t.id = c.torneo_id and (t.temporada, t.anio) = ('apertura', 2026)
 where c.nombre = 'DEMO · categoría A'
on conflict (categoria_id, nombre) do nothing;


-- ── Tarifario del torneo de ejemplo ────────────────────────────────────────
--
-- Dos opciones —inscripción y partidos, sólo masculino— para que
-- `/catalogos/tarifario` tenga algo que mostrar y se pueda armar una ficha de
-- prueba con `crear_equipo_torneo`.
--
-- Las reglas son `fecha_fija` y `bloque_adelantado`, NO `por_partido`: esa
-- última genera una cuota por jornada de la serie y **aborta si no encuentra
-- ninguna**, así que arrastraría el calendario entero. Con estas dos hay
-- cuotas sin necesidad de sembrar jornadas.
--
-- Ojo con `fecha_desde` / `fecha_hasta` de la línea: son **números de jornada**
-- (`smallint`), no fechas. La fecha del calendario es `fecha_referencia`.
insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
select t.id, 'masculino', v.concepto::concepto_pago, 1, v.opcion
  from torneo t
  cross join (values ('inscripcion', 'Pago único'),
                     ('partidos',    'Dos bloques adelantados')) as v(concepto, opcion)
 where (t.temporada, t.anio) = ('apertura', 2026)
on conflict (torneo_id, genero, concepto, opcion_orden) do nothing;

insert into plan_tarifa_linea
  (plan_tarifa_id, linea_orden, concepto_label, precio_efectivo, precio_transferencia,
   regla, fecha_referencia, fecha_desde, fecha_hasta, es_playoff)
select p.id, v.orden, v.label, v.efectivo, v.transferencia,
       v.regla::regla_vencimiento, v.fecha, v.desde, v.hasta, false
  from plan_tarifa p
  join torneo t on t.id = p.torneo_id and (t.temporada, t.anio) = ('apertura', 2026)
  join (values
    ('inscripcion', 1, 'Seña',            800000, 1000000, 'fecha_fija',         '2026-03-15'::date, null::smallint, null::smallint),
    ('inscripcion', 2, 'Restante',       1700000, 2000000, 'fecha_fija',         '2026-04-15'::date, null,           null),
    ('partidos',    1, 'Fechas 1 a 8',   1200000, 1400000, 'bloque_adelantado',  '2026-04-01'::date, 1::smallint,    8::smallint),
    ('partidos',    2, 'Fechas 9 a 15',  1050000, 1225000, 'bloque_adelantado',  '2026-06-01'::date, 9,              15)
  ) as v(concepto, orden, label, efectivo, transferencia, regla, fecha, desde, hasta)
    on v.concepto::concepto_pago = p.concepto
on conflict (plan_tarifa_id, linea_orden) do nothing;
