> **Fuente de diseño · Pieza 2 · gestión de jornadas.** Ya implementada.
>
> Funciones de alta/mover/suspender, autonomía parcial de la cuota y el seed de las 284 jornadas.
>
> Este archivo es el **camino**: el razonamiento, los trade-offs y las
> alternativas que se descartaron. El **resultado** —lo que la base hace
> hoy— vive en `arquitectura.md §3.5` y `docs/decisiones.md`.
> Ante una diferencia entre los dos, **manda el resultado**: este documento
> se conserva como estaba al aprobarse y no se actualiza.
>
> Resultado: arquitectura.md §3.5 · decisiones 49-51
> Migraciones: `20260801131425_gestion_jornadas`

---

# Pieza 2: Grilla + Gestión de Jornadas + Comportamiento de Cuotas

> Draft para integrar a arquitectura.md y decisiones.md. Diseño aprobado con Facu.
> Es la pieza 2 del rediseño calendario-por-serie. Se construye todo junto.

## Alcance

Esta pieza creció de "cargar la grilla" a tres cosas conectadas:
1. Funciones de gestión de jornadas (alta / mover / suspender) — sirven a SEED y a APP.
2. Comportamiento de las cuotas de liga ante cambios de jornada (refina decisión 41).
3. Impacto en vistas de deuda/cobranza.
4. El seed del calendario Clausura 2026 que carga las 284 jornadas.

## Principio: una lógica, dos puertas

Las jornadas se cargan/editan por dos vías que comparten la MISMA lógica validada:
- **Seed** (hoy): carga el Clausura 2026 desde el CSV validado.
- **App** (futuro, módulo de calendario): Mati carga/edita desde pantalla.

Ambas llaman a las mismas funciones. No hay dos caminos que validen distinto.
Las funciones son agnósticas del torneo (regla 12): reciben serie/numero/fecha, no
saben de "Clausura" ni de "15 fechas". Lo específico entra como datos.

## Funciones de gestión de jornadas

### crear_jornada(serie_id, numero, fecha)
Alta validada: serie existe, numero no repetido en la serie (respeta unique
(serie_id, numero)), fecha válida (o null — se permite sembrar sin fecha aún).
La usa el seed (284 veces) y la usará la app.

### mover_jornada(jornada_id, nueva_fecha)
Cambia la fecha. Las cuotas de liga de esa jornada recalculan su vencimiento
SOLAS — porque lo derivan de jornada.fecha, no lo tienen copiado (ver abajo).
Es la decisión 39 en acción.

### suspender_jornada(jornada_id)
La jornada pasa a estado 'suspendida'. Sus cuotas de liga SALEN del circuito de
cobro: no figuran como deuda vencida mientras esté suspendida. Un equipo con
jornada suspendida NO aparece como moroso de esa cuota.

### reprogramar = mover una suspendida a fecha nueva
La jornada vuelve a 'programada' con la fecha nueva; sus cuotas vuelven al circuito
con el vencimiento nuevo. (Puede ser mover_jornada sobre una suspendida, o función
propia — decidir en construcción.)

## Comportamiento de cuotas: refinamiento de la decisión 41

La decisión 41 decía: "el monto se copia del tarifario a la cuota al generar; la
cuota es autónoma desde ahí". Esto se MATIZA (no se contradice):

La autonomía de la cuota es PARCIAL y depende del tipo:

| Tipo de cuota | Monto | Vencimiento | Autonomía |
|---|---|---|---|
| Fija (inscripción, bloque) | copiado | copiado (vence_at propio) | total |
| Liga (por_partido) | copiado | DERIVADO de jornada.fecha | parcial |

- **Cuota fija**: monto y fecha copiados. Totalmente autónoma. Editar tarifario o
  calendario no la toca. Vence un día administrativo fijo.
- **Cuota de liga**: monto copiado (41 intacta en el monto), pero vencimiento
  derivado de jornada.fecha en vivo. Guarda jornada_id. Mover la jornada mueve su
  vencimiento; suspender la jornada la saca del circuito.

Razón: las dos cuotas tienen naturaleza distinta. La inscripción vence un día fijo;
la de liga vence "cuando se juega esa fecha", que puede moverse o suspenderse.

## Estados de jornada y efecto en la cuota de liga

| Estado jornada | Cuota de liga |
|---|---|
| programada, con fecha | vencimiento = jornada.fecha, en circuito normal |
| programada, sin fecha | sin vencimiento aún (B0 no la genera hasta que haya fecha) |
| suspendida | FUERA del circuito de cobro (no es deuda vencida) hasta reprogramar |
| jugada | vencimiento = jornada.fecha (la cuota se cobra normalmente) |

## Impacto en vistas

Hoy "¿esta cuota está vencida?" se calcula sobre un vence_at propio de la cuota.
Para las cuotas de liga, ahora depende del ESTADO y la FECHA de su jornada.
Las vistas de deuda/cobranza (v_deuda_detalle, v_estado_cuota, v_cuenta_corriente_
equipo, y las que agrupen deuda) deben:
- Para cuota fija: usar vence_at propio (como hoy).
- Para cuota de liga: derivar de jornada — y EXCLUIR las de jornada suspendida del
  cálculo de deuda vencida.

Esto se revisa vista por vista al construir. Es el punto que más cuidado necesita:
una cuota de liga de jornada suspendida NO debe aparecer como deuda.

## El seed del calendario

supabase/seeds/clausura_2026_05_grilla.sql (o similar):
- Lee las 284 filas del CSV validado (clausura_2026_04_calendario.csv).
- Resuelve serie_id por nombre (categoria+serie) contra la base, como el padrón.
- Llama a crear_jornada (o insert masivo con las mismas validaciones).
- Idempotente. Verificación: 284 jornadas, conteos por serie, el 10/10 en las 10 series.
- Datos en seeds; la lógica (crear_jornada) es agnóstica. Regla 12 cumplida.

## Decisiones nuevas para decisiones.md

- **49**: Gestión de jornadas por funciones validadas (alta/mover/suspender), una
  lógica para seed y app.
- **50**: Refinamiento de la 41 — autonomía parcial de la cuota. Monto copiado
  siempre; vencimiento copiado para cuota fija, derivado de jornada para cuota de liga.
- **51**: Cuota de liga de jornada suspendida sale del circuito de cobro hasta
  reprogramar (no es deuda vencida).

## Lo que se mantiene

- Percibido puro: nada de esto genera asiento. El asiento nace al cobrar.
- Decisión 39: vencimiento de cuota de liga sigue a la jornada (ahora implementado de
  verdad, con fecha real por serie y recálculo al mover).
- Regla 12: funciones agnósticas, datos en seeds.
- La rama por_partido de B0 (pieza 3) generará las cuotas de liga con jornada_id;
  recién ahí se ejercita. Esta pieza deja la infraestructura lista.
