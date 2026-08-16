> **Fuente de diseño · Pieza 5 · unidades de costo variable.** Ya implementada.
>
> Las tres unidades del costo variable, la tabla dia_cancha y el arreglo de v_presupuesto_total.
>
> Este archivo es el **camino**: el razonamiento, los trade-offs y las
> alternativas que se descartaron. El **resultado** —lo que la base hace
> hoy— vive en `arquitectura.md §3.3 y §3.5` y `docs/decisiones.md`.
> Ante una diferencia entre los dos, **manda el resultado**: este documento
> se conserva como estaba al aprobarse y no se actualiza.
>
> Resultado: arquitectura.md §3.3 y §3.5 · decisiones 52-56
> Migraciones: `20260802075345_dia_cancha · 20260802075631_unidades_costo`

---

# Pieza 5: Unidades de Costo Variable + dia_cancha + desarmar la bomba

> Draft para integrar a arquitectura.md y decisiones.md. Diseño aprobado con Facu.
> Pieza 5 del rediseño calendario-por-serie. Toca el modelo de gastos y desarma
> la bomba de v_presupuesto_total.

## El problema que resuelve

v_presupuesto_total hoy calcula el gasto "por jornada" como:
  base * cantidad * (count de jornadas del torneo)   -- hoy 284
Sin distinguir cómo escala cada costo. Un presupuesto de árbitros y uno de
fotografía se multiplican por el mismo 284. Con el rediseño calendario-por-serie
ese count pasó de 28 a 284 — cualquier presupuesto por_jornada se infla x10.
(Tablas de presupuesto vacías hoy: no hay número mal todavía. Se arregla antes
del primer presupuesto.)

## Las tres unidades de costo variable (decisión 44)

Cada gasto escala de una forma distinta. El eje `unidad` ya existe en
presupuesto_linea con dominio (por_jornada, por_mes, anual, unico). Se PARTE
por_jornada en dos:

| Unidad | Multiplicador | Ejemplos |
|---|---|---|
| por_partido | cantidad de partidos = Σ(equipos/2) sobre las jornadas | árbitros, veedores, ballboys |
| por_dia_cancha | cantidad de (fecha, predio) que operan | fotografía, guardias, limpieza, médico, coordinación |
| por_mes | × 12 (ya existe) | sueldos fijos, servicios recurrentes |
| anual / unico | sin escalar (ya existen) | eventuales, inversión |

por_jornada se elimina del dominio (se reemplaza por las dos nuevas).

## Dónde vive la unidad (decisión: default en catálogo + override en línea)

- La unidad DEFAULT vive en el catálogo (concepto_gasto o cat_gasto): "Fotografía
  es por día de cancha" es intrínseco al concepto.
- La línea de presupuesto puede OVERRIDEAR si un caso puntual lo requiere.
- En la app, crear un concepto nuevo incluye elegir su unidad. Dominio extensible
  (regla 12: la estructura permite cualquier gasto con cualquier unidad; lo
  específico son datos).

## dia_cancha: la entidad compartida con la pieza 4

"Por día de cancha" necesita contar (fecha, predio) que operan. Ese dato NO existe
hoy: la jornada no tiene predio (se sacó a propósito). Se crea tabla:

  dia_cancha (fecha date, predio_id uuid, torneo_id derivable o ref, ...)
  identidad (fecha, predio_id)

- Se puebla al armar el calendario: por defecto los 2 predios en cada fecha.
- Se ajustan las excepciones: domingos con menos partidos (1 predio), semi/final
  de playoffs (1 predio). Generalmente los 2, pero no siempre.
- De esta tabla sale el multiplicador de por_dia_cancha (count de filas).
- El ARQUEO (pieza 4) cuelga de esta misma tabla (fecha, predio). Entidad
  compartida — se construye en la pieza 5 y la pieza 4 la usa. Sinergia confirmada
  en el relevamiento.

## por_partido: la fórmula (decisión 45)

partidos de una jornada = equipos de la serie / 2 (16→8, 14→7). Sin excepciones.
Los equipos salen de equipo_torneo agrupado por serie. Total de partidos del
torneo = Σ sobre todas las jornadas.
Nota: con 0 fichas hoy da 0. La fórmula se escribe igual; se prueba cuando haya
fichas. No existe entidad "partido" — se deriva (decisión 45).

## v_presupuesto_total arreglada

case pl.unidad
  when 'por_partido'    then base * cantidad * (total de partidos del torneo)
  when 'por_dia_cancha' then base * cantidad * (count de dia_cancha del torneo)
  when 'por_mes'        then base * cantidad * 12
  when 'anual'          then base * cantidad
  when 'unico'          then base
end
Cada unidad con su multiplicador correcto. Desarma la bomba: por_partido y
por_dia_cancha dejan de contar 284 jornadas.

## Clasificación inicial de las 16 categorías por_fecha (seed)

Se carga como dato (seed de unidad del catálogo). Firme:

POR PARTIDO (3): Árbitros Femenino, Árbitros Masculino, Operativos (ballboys/veedores).

POR DÍA DE CANCHA (11): Media (foto/video), Estacionamiento, Guardias, Limpieza
(predio), Coordinación, Medicinal, Tribunal, Viáticos. [las de área torneo +
las de área predio]

APARTE (2): Bar (Productos/Extras/Limpieza-bar/Proveedores) escala con ventas/
compras, no con partidos ni días — unidad neutra, su propio tratamiento. 
Administración/Cobranzas suena a comisión/fijo — tentativo por_mes.

Todo ajustable en la app (unidad editable por concepto). El seed carga la
primera clasificación; el torneo la refina.

## Decisiones nuevas para decisiones.md

- Unidad de costo: default en catálogo + override en línea.
- dia_cancha como tabla propia (fecha, predio), poblada con el calendario,
  compartida entre presupuesto (pieza 5) y arqueo (pieza 4).
- Clasificación inicial de conceptos por_fecha (seed).

## Orden con la pieza 4

dia_cancha se construye en esta pieza. La pieza 4 (arqueo) recuelga el arqueo de
(jornada) a (fecha, predio) usando esta tabla. Puede hacerse la 5 primero (crea
dia_cancha) y la 4 después (la usa), o juntas. Coordinar.

## Lo que se mantiene

- Regla 12: unidades como dominio extensible, clasificación como dato (seed).
- Bar como negocio propio (no se mezcla su lógica con el torneo).
- Percibido puro intacto (esto es presupuesto, no movimiento).
