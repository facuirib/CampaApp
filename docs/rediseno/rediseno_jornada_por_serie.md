> **Fuente de diseño · Pieza 1 · el rediseño completo.** Ya implementada.
>
> Documento raíz: plantea el problema (el calendario real es por serie, no por género) y lista las seis piezas.
>
> Este archivo es el **camino**: el razonamiento, los trade-offs y las
> alternativas que se descartaron. El **resultado** —lo que la base hace
> hoy— vive en `arquitectura.md §3.5` y `docs/decisiones.md`.
> Ante una diferencia entre los dos, **manda el resultado**: este documento
> se conserva como estaba al aprobarse y no se actualiza.
>
> Resultado: arquitectura.md §3.5 · decisiones 42-47
> Migraciones: `20260801121708_jornada_por_serie`

---

# Rediseño: Calendario / Jornada por Serie

> Draft para integrar a `arquitectura.md`. Reemplaza el modelo de jornada-por-género.
> Estado: diseño aprobado, pendiente de construir.

## El problema

El modelo actual de `jornada` tiene identidad `(torneo_id, genero, numero)`: una jornada
"es" la fecha N de un género (masculino 1–15, femenino 1–13), igual para todas las series
de ese género. 28 jornadas por torneo.

Pero el calendario real es **por serie**: distintas series del mismo género juegan la misma
fecha_nro en días distintos (van casi siempre sincronizadas, se desfasan en fechas puntuales).
Ej: Libre A juega su fecha 3 el 15/8, pero +35 B la juega el 29/8. El modelo por género no
puede representar esto — colapsa fechas que en la realidad difieren.

Consecuencia práctica: la cuota de liga de un equipo (decisión 39, vencimiento atado a la
jornada) hoy se ata a una jornada genérica de género, con fecha aproximada. Con jornada por
serie, se ata a la jornada real que ese equipo juega, con su fecha correcta.

## El modelo nuevo

`jornada` cuelga de **serie**, no de género:
- Identidad natural: `(serie_id, numero)`.
- El género se **deriva** subiendo serie → categoria → genero (mismo patrón que la ficha).
- La fecha real de cada jornada viene del calendario validado (CSV por serie).
- 284 jornadas para el Clausura 2026 (12 series masc × 15 + 8 fem × 13).

La PK sigue siendo `id` (uuid) — las 7 FKs que apuntan a jornada.id NO se tocan.
Lo que cambia es la identidad natural y la columna: sale `genero`, entra `serie_id`.

## Cantidad de partidos por jornada

Derivable, no se carga: **cantidad de partidos = equipos de la serie / 2**
(16 equipos → 8 partidos, 14 → 7). Sin excepciones conocidas. Es la base para los
costos "por partido".

## Fecha de calendario vs Jornada (distinción clave)

- **Fecha**: un día concreto (sáb 8/8/2026). Ese día juegan muchas series.
- **Jornada**: la fecha N de UNA serie. Muchas jornadas caen en la misma fecha.
- Relación: una fecha → muchas jornadas.
- Clausura: 29 fechas de calendario distintas, 284 jornadas.

"Fecha + predio" emerge como entidad natural = el día de operación de un predio.
De ahí cuelgan el arqueo y los costos por día-de-cancha.

## Costos variables: tres unidades de medida

El modelo de gasto distingue cómo escala cada costo:

1. **Por partido** (árbitros, veedores, ballboys): se multiplica por cantidad de partidos
   (= equipos/2 por jornada). Cada partido tiene su árbitro/veedor/ballboys.
2. **Por día de cancha** (fotografía): 1 servicio por (fecha, predio), sin importar cuántas
   series o partidos haya ese día en ese predio. El fotógrafo va un día a un predio = 1.
3. **Fijos mensuales** (ya existentes): no escalan con partidos ni fechas.

⚠️ `v_presupuesto_total` tiene una cuenta "por jornada" que hoy cuenta 28 y con el rediseño
contaría 284 sin avisar (multiplicaría x10 un presupuesto por_jornada). Hay que ajustarla
para que use la unidad correcta según el tipo de costo. Tablas de presupuesto vacías hoy,
así que no hay ningún número mal todavía — se arregla antes de que exista el primero.

## Arqueo: cuelga de (fecha, predio)

El arqueo es el control de la caja física de un predio un día. Con jornadas por serie, atar
el arqueo a "la jornada de una serie" pierde sentido (ese día en ese predio jugaron varias
series; la plata de la caja no distingue de qué serie vino). El arqueo pasa a colgar de
**(fecha de calendario, predio)** = la caja del día. Ajuste que trae el rediseño.

## Playoffs: también por serie

Los playoffs pasan a ser por serie (la final de Libre A, la de Libre B, etc.), coherente con
la liga. Hoy se modelan por género (instancia + es_playoff). No están en el CSV de calendario
(no tienen fecha aún) — se ajusta el modelo, las fechas se cargan cuando se definan.

## Piezas a construir (orden sugerido)

1. Migración: reestructurar `jornada` (sale genero, entra serie_id NOT NULL). Base vacía,
   sin backfill. Género derivado por vista/join.
2. `generar_grilla_liga`: pasa de generar 28 filas a cargar las 284 desde el CSV validado.
3. `cuota.jornada_id` + lógica de B0: la rama por_partido ata cada cuota a la jornada real
   de la serie del equipo. (Recién acá se ejercita esa rama de B0, que quedó sin probar.)
4. Arqueo: recolgar de (fecha, predio).
5. `v_presupuesto_total` y costos variables: implementar las tres unidades (partido /
   día-cancha / fijo).
6. Playoffs por serie.

## Invariantes que se mantienen

- Percibido puro: la jornada no genera asiento. Las cuotas de liga se cobran al pagarse.
- Decisión 39: vencimiento de cuota de liga sigue a la jornada (ahora con fecha real).
- La PK de jornada (id) no cambia; las FKs existentes no se tocan.
