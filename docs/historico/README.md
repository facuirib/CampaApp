# Histórico · fuentes de diseño

Los documentos con los que se diseñó cada módulo, **tal como se aprobaron**.
Todo lo que hay acá **está implementado**.

## Qué son, y qué no

Son el **camino**: por qué se hizo así, qué se evaluó y qué se descartó. El
**resultado** —lo que la base hace hoy— vive en otro lado:

| | Qué contiene |
|---|---|
| `docs/arquitectura.md` | el modelo vigente |
| `docs/decisiones.md` | cada decisión con su razón |

**Ante una diferencia, manda el resultado.**

## Por qué se conservan

Porque son el único registro de **lo que se descartó**. Un doc de arquitectura
dice cómo es el modelo; no dice qué tres alternativas se probaron antes ni por
qué no funcionaban. Sin eso, la próxima persona que proponga volver a
`(torneo_id, genero, numero)` para la jornada —que es una simplificación
tentadora— no encuentra por qué no sirve.

## Por qué están acá y no en `docs/`

**Estos archivos no se actualizan.** Se conservan como estaban al aprobarse, y
por eso conviene leerlos sabiendo que algunos detalles cambiaron al construir.

Que estuvieran mezclados con la documentación viva era un problema real, no
teórico: en la limpieza de agosto de 2026, `modulo_socios.md` y `modulo_usd.md`
seguían citando `v_resultado_producto`, una vista dropeada. El rótulo de "no se
actualiza" evita el reproche, no la confusión — la carpeta sí.

## Qué hay

| Carpeta | Qué |
|---|---|
| `rediseno/` | El rediseño calendario-por-serie, en seis piezas |
| `modulos/` | Socios, sponsors, USD y cashflow |
