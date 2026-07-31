# Calendario Clausura 2026 · fuente

Acompaña a `clausura_2026_04_calendario.csv`.

La explicación va acá y no como comentarios dentro del CSV para que el archivo
siga siendo parseable tal cual —por `csv.DictReader`, por `COPY`, por lo que
sea— cuando llegue el momento de sembrarlo.

## ⚠ No se siembra todavía

**El CSV es fuente documental, no un seed ejecutable.** No hay `.sql` que lo
cargue, a propósito.

`jornada` hoy tiene identidad `(torneo_id, genero, numero)`: **asume que cada
género corre un solo calendario**. Este calendario es **por serie** — Libre A y
Libre F son masculinos y juegan fechas distintas. El modelo actual no puede
representarlo.

Antes de sembrar hay que:

1. **Rediseñar `jornada` para colgar de `serie_id`** en lugar de `genero`. El
   género seguiría derivándose subiendo (serie → categoría → género), igual que
   en la ficha.
2. **Rehacer `generar_grilla_liga(torneo_id, fechas_masc, fechas_fem)`**, que
   hoy siembra 28 filas fecha × género. Con calendario por serie serían 284
   filas fecha × serie.

Es diseño pendiente, no una tarea mecánica: toca `cuota.jornada_id` (decisión
39, el vencimiento de las cuotas de liga sigue a la jornada) y las vistas de
previsión que agrupan por jornada.

## Qué contiene

284 jornadas · 20 series · columnas `categoria, serie, genero, nro_fecha, dia`.

| Categoría | Género | Jornadas |
|---|---|---|
| Libre | masculino | 90 |
| +30 | masculino | 45 |
| +35 | masculino | 30 |
| +40 | masculino | 15 |
| Femenino | femenino | 91 |
| Flex | femenino | 13 |

Rango: **2026-08-01 → 2026-11-28**, 29 fechas de calendario distintas.

## Validado

Verificado programáticamente sobre las 284 filas:

- **Conteos por serie**: 15 jornadas cada serie masculina, 13 cada femenina.
- **Correlatividad**: `nro_fecha` va de 1 a N sin huecos ni repeticiones en las
  20 series.
- **Fechas crecientes**: dentro de cada serie, la fecha de la jornada N+1 es
  siempre posterior a la de la N.
- **20 series**, las mismas que existen en la base para el Clausura 2026.

## El 10/10/2026 es jornada real

Ese día **juegan 10 de las 20 series**. Las otras 10 no, por el evento Regional
Abogados.

No es un error de carga ni una fecha a completar: es asimetría deliberada del
calendario real, y conviene tenerlo escrito porque una validación ingenua
—"todas las series juegan el mismo día"— lo marcaría como inconsistencia.

| Juegan (10) | No juegan (10) |
|---|---|
| Libre D · E · F | Libre A · B · C |
| +30 C | +30 A · B |
| +35 B | +35 A |
| — | +40 A |
| Femenino D · E · F · G | Femenino A · B · C |
| Flex A | — |

## Origen

Exportado de `plantilla_calendario_clausura_2026.xlsx` (hoja `Calendario`). Las
fechas venían como serial de Excel y se convirtieron a ISO `YYYY-MM-DD`.

Había dos versiones del archivo con distinta fecha de modificación; se verificó
que **producen datos idénticos** antes de exportar.
