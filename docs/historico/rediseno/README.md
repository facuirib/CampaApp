# Rediseño calendario-por-serie · fuentes de diseño

Los documentos con los que se diseñó el rediseño, tal como se aprobaron. **Todas
las piezas están implementadas.**

## Camino y resultado

Estos archivos son el **camino**: por qué se hizo así, qué se evaluó y qué se
descartó. El **resultado** —lo que la base hace hoy— vive en dos lugares:

| | Qué contiene |
|---|---|
| `docs/arquitectura.md` | el modelo vigente |
| `docs/decisiones.md` | cada decisión con su razón |

**Ante una diferencia, manda el resultado.** Estos documentos **no se actualizan**:
se conservan como estaban al aprobarse, y por eso conviene leerlos sabiendo que
algunos detalles cambiaron al construir. Los cambios están registrados en
`arquitectura.md` (sección "Qué cambió desde el Draft N") y en `decisiones.md`.

Tres ejemplos de esa deriva, para que se note el patrón:

- La **pieza 5** proponía clasificar 11 categorías `por_dia_cancha`; son **8**. El
  criterio del propio documento —área torneo + área predio, menos las 3 de
  partido— da 8, y `3 + 8 + 5` cierra en 16.
- La **pieza 4** dejaba abierto si el efectivo baja al arquear o al entregar. Se
  cerró: **baja al entregar** (Escenario A, decisión 60).
- La **pieza 6** dio vuelta su propia premisa al relevar: los playoffs **ya
  colgaban de serie** desde la pieza 1, así que la pieza no movió nada — cerró
  tres agujeros.

## Las piezas

| Pieza | Documento | Resultado | Migración |
|---|---|---|---|
| **1** · jornada por serie | [rediseno_jornada_por_serie.md](rediseno_jornada_por_serie.md) | §3.5 · dec. 42-47 | `20260801121708_jornada_por_serie` |
| **2** · gestión de jornadas | [pieza2_gestion_jornadas.md](pieza2_gestion_jornadas.md) | §3.5 · dec. 49-51 | `20260801131425_gestion_jornadas` |
| **3** · rama `por_partido` de B0 | *sin documento* | dec. 50 | *(no requirió migración)* |
| **4** · arqueo y consolidación | [pieza4_arqueo_consolidacion.md](pieza4_arqueo_consolidacion.md) | §3.6 · dec. 57-62 | `20260802094852_caja_central`<br>`20260802095023_arqueo_dia_cancha` |
| **5** · unidades de costo | [pieza5_unidades_costo.md](pieza5_unidades_costo.md) | §3.3, §3.5 · dec. 52-56 | `20260802075345_dia_cancha`<br>`20260802075631_unidades_costo` |
| **6** · playoffs por serie | [pieza6_playoffs.md](pieza6_playoffs.md) | §3.5 · dec. 63-67 | `20260802103856_playoffs_por_serie` |

**La pieza 3 no tiene documento** y no es un olvido: no era diseño nuevo sino
**ejercitar por primera vez** la rama `por_partido` de `crear_equipo_torneo`, que
existía sin haberse probado nunca. Fue un test, no una construcción.

**El orden de construcción no fue el numerado.** Se hizo 1 → 2 → 3 → 5 → 4 → 6:
la pieza 5 crea `dia_cancha` y la 4 la necesita para colgar el arqueo. La
dependencia la detectó el relevamiento de la 5.

## Datos del Clausura 2026

Los seeds y su fuente documental están en `supabase/seeds/`, aparte de estos
diseños. El calendario validado —284 jornadas— tiene su propia nota de origen en
`clausura_2026_04_calendario.md`.
