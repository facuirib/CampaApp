> **Fuente de diseño · Pieza 6 · playoffs por serie.** Ya implementada.
>
> Cierra los tres agujeros de playoff y construye la gestión: formato configurable, puertas y cuota por instancia.
>
> Este archivo es el **camino**: el razonamiento, los trade-offs y las
> alternativas que se descartaron. El **resultado** —lo que la base hace
> hoy— vive en `arquitectura.md §3.5` y `docs/decisiones.md`.
> Ante una diferencia entre los dos, **manda el resultado**: este documento
> se conserva como estaba al aprobarse y no se actualiza.
>
> Resultado: arquitectura.md §3.5 · decisiones 63-67
> Migraciones: `20260802103856_playoffs_por_serie`

---

# Pieza 6: Playoffs por serie (backend)

> Draft para integrar a arquitectura.md y decisiones.md. Diseño aprobado con Facu.
> Última pieza del rediseño calendario-por-serie. Cierra los agujeros de playoff
> que quedaron abiertos (la rama nunca se ejercitó) y da las puertas de gestión.

## Punto de partida (sorpresa del relevamiento)

Los playoffs YA cuelgan de serie — la pieza 1 movió toda la tabla jornada a
serie_id. La final de Libre A y la de Libre B ya son jornadas distintas. La pieza 6
NO mueve nada a serie: cierra agujeros y construye la gestión.

Estado hoy: 284 jornadas de liga, 0 playoffs, 0 instancias. La rama es_playoff
existe en el schema pero nunca se usó.

## Los agujeros a cerrar

1. **No hay puerta de creación**: crear_jornada hardcodea es_playoff=false y exige
   numero. Insert directo sería la única vía — lo que la decisión 49 prohíbe.
2. **Unique no protege playoffs**: con numero NULL, se pueden crear infinitas
   finales de Libre A. Falta unique (serie_id, instancia).
3. **instancia sin dominio**: 'final','Final','semi' pasan todos. Falta control.

## El formato de playoff (dato, no hardcode)

Estructura fija que se repite en todas las series (masc y fem):
- cuartos: 8 equipos, 4 partidos
- semifinal: 4 equipos, 2 partidos
- final: 2 equipos, 1 partido

PERO no va hardcodeada — Facu quiere poder editar o agregar instancias en el futuro
(repechaje, tercer puesto, etc.). Va como TABLA de configuración:

  formato_instancia: nombre (cuartos/semifinal/final/...), cantidad_partidos, orden
  Seed con las 3 estándar. Editable/extensible sin tocar código (regla 12).

instancia en jornada se valida contra esta tabla (FK o dominio dinámico), no contra
un CHECK con literales.

## La puerta de creación

crear_playoff(serie_id, instancia, fecha default null, cantidad_partidos default
  del formato) → uuid
- Crea jornada con es_playoff=true, la instancia, sin numero, fecha nullable.
- cantidad_partidos toma el default del formato_instancia; se puede override.
- Valida unique (serie_id, instancia) y que la instancia exista en el formato.
- fecha null OK: se programa después con mover_jornada (que ya sirve para playoffs,
  opera por id).
Agnóstica (regla 12). mover_jornada y suspender_jornada ya sirven tal cual.

## Quién juega cada instancia (nuevo)

Hoy no existe la relación equipo↔instancia de playoff. Se crea:

  equipo_playoff (equipo_torneo_id, jornada_playoff_id)  [o nombre similar]
  identidad (equipo_torneo_id, jornada_playoff_id)

Registra qué equipos juegan cada instancia. Es lo que la pantalla de bracket
(Horacio, después) va a llenar, y de donde salen las cuotas.

## Generación de cuotas de playoff

Por INSTANCIA JUGADA (como la liga: se devenga al avanzar, no un paquete al
clasificar). El equipo juega cuartos → cuota de cuartos; pasa a semi → cuota de
semi; etc.

Proceso (función backend, la pantalla la invoca):
  generar_cuotas_instancia(jornada_playoff_id) o similar
  - Toma los equipos registrados en esa instancia (equipo_playoff).
  - Genera una cuota por equipo, con el arancel de la línea es_playoff del tarifario
    (470k/530k masc, 150k/180k fem — por_partido).
  - La cuota se ata a la jornada de playoff (jornada_id), como las de liga.
  - Vencimiento derivado de la fecha de la jornada de playoff (o la del arqueo/
    programación) — mismo patrón que liga (decisión 50).

Esto es el paso posterior a la ficha (B0 no las genera — no se sabe quién clasifica
al armar la ficha). B0 sigue excluyendo playoffs, correcto.

## Arreglar v_torneo_escala (bug latente, clase 284)

Hoy v_torneo_escala.partidos cuenta equipos/2 por jornada, SIN excluir playoffs.
Para un playoff está mal: la final de Libre A es 1 partido, no 16/2=8. Con 3
instancias × 20 series, error grande y silencioso.

Fix: para jornadas de liga, partidos = equipos/2 (decisión 45, se mantiene). Para
playoffs, partidos = jornada.cantidad_partidos (el dato de la instancia). La
decisión 45 queda ACOTADA a la liga; playoffs llevan su cantidad como dato.

## Decisiones nuevas para decisiones.md

- Playoffs ya cuelgan de serie (heredado de pieza 1); la 6 cierra agujeros y da
  gestión.
- Formato de instancia como tabla configurable (no hardcode) — cuartos/semi/final
  por defecto, editable/extensible.
- crear_playoff como puerta (decisión 49 extendida a playoffs).
- Cuota de playoff por instancia jugada, generada en paso posterior a la ficha,
  desde equipo_playoff.
- Cantidad de partidos de playoff = dato de la instancia (decisión 45 acotada a
  liga).

## Alcance: backend ahora, bracket después

Esta pieza construye el BACKEND: formato_instancia, crear_playoff, equipo_playoff,
generar_cuotas_instancia, fix de v_torneo_escala. La PANTALLA de bracket (seleccionar
los 8 que avanzan a cuartos, los 4 a semi, los 2 a la final) es front de Horacio,
que invoca estas funciones. Una lógica, dos puertas — como jornadas.

## Lo que se mantiene

- Percibido puro: la jornada de playoff no genera asiento; la cuota se cobra al
  pagarse.
- B0 sigue excluyendo playoffs de la generación de cuotas de la ficha (correcto).
- Regla 12: formato como dato, funciones agnósticas.
- El tarifario es por género (el precio de playoff lo fija el género); la jornada,
  por serie. Consistente con la liga, sin cambio.
