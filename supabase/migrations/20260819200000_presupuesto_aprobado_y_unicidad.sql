-- ═══════════════════════════════════════════════════════════════════════════
-- presupuesto · sólo el aprobado proyecta, y una cabecera por ámbito
--
-- ⚠️ PROPUESTA · NO APLICADA. Toca `v_presupuesto_total`, que es de HORACIO:
-- se avisa en coordinacion.md.
--
-- ── El bloqueante ──────────────────────────────────────────────────────────
--
-- Antes de que exista `/presupuesto` hay que cerrar esto, porque la pantalla
-- existe justamente para **crear borradores y editarlos antes de aprobar** — y
-- hoy un borrador entra a la proyección el instante en que se guarda.
--
-- Verificado en rollback: creando un segundo presupuesto del mismo torneo y
-- ejercicio, en estado `borrador`, con UNA sola línea:
--
--     estimado  −$93.473.000 → −$135.353.000   (delta −$41.880.000)
--
-- Son dos agujeros que se suman:
--
--   1. `v_presupuesto_total` **no filtra por `estado`**. La columna existe con
--      su check ('borrador','aprobado') y no la lee nadie. No se notaba porque
--      las 2 cabeceras que hay están en `aprobado`.
--
--   2. **No hay unique de negocio.** Los únicos índices únicos son las dos PK.
--      Nada impide dos cabeceras del mismo torneo+ejercicio, ni dos líneas de
--      la misma categoría — y `v_presupuesto_total` las suma todas.
--
-- Es el patrón de siempre: campos y ramas que nunca se ejecutaron porque nadie
-- creó jamás un borrador.
--
-- ── Las decisiones que respalda (Facu, 19/08) ──────────────────────────────
--
-- **(A) Sólo el aprobado entra al cashflow.** Un borrador es un ejercicio de
-- planificación: se arma, se discute, se corrige. No debe mover la proyección.
--
-- **(B) El aprobado se edita libremente.** El estado NO restringe la edición —
-- sólo controla qué proyecta. Corregir un número de un presupuesto vigente es
-- normal y no debería exigir un ciclo de desaprobar/reaprobar. Por eso esta
-- migración **no agrega ningún trigger que bloquee escrituras**: las funciones
-- de carga que vienen después pueden editar cualquier presupuesto.
--
-- ── El cuidado con los NULL, que acá NO es teórico ─────────────────────────
--
-- En SQL `NULL <> NULL`, así que un unique común **no impide dos filas con el
-- mismo NULL**. Y las dos columnas en juego lo usan de verdad:
--
--   · `presupuesto.torneo_id` es **NULL para la estructura permanente** (§3.3),
--     y hoy hay 1 cabecera así. Con un unique común, dos presupuestos de
--     estructura seguirían conviviendo y sumándose.
--
--   · `presupuesto_linea.concepto_id` es NULL cuando la línea es de toda la
--     categoría — y **las 6 líneas que existen lo tienen en NULL**. O sea que
--     un unique común no protegería absolutamente nada hoy.
--
-- Postgres 17.6 (verificado con `server_version`) soporta `NULLS NOT DISTINCT`,
-- que trata los NULL como un valor más. Es exactamente lo que hace falta y
-- evita el truco del índice sobre `coalesce(col, '00000000-…')`, que funciona
-- pero esconde la intención y se rompe si alguna vez ese UUID centinela existe.
--
-- ── Los datos actuales no violan nada ──────────────────────────────────────
--
-- Comprobado antes de escribir esto: 0 cabeceras duplicadas y 0 líneas
-- duplicadas. Los índices se crean sin conflicto.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Una cabecera por ámbito ───────────────────────────────────────────
-- El "ámbito" es (torneo, ejercicio), con torneo NULL = estructura permanente.
create unique index if not exists presupuesto_ambito_uniq
  on presupuesto (torneo_id, ejercicio_id) nulls not distinct;

comment on index presupuesto_ambito_uniq is
  'Una sola cabecera por (torneo, ejercicio). NULLS NOT DISTINCT porque '
  'torneo_id es NULL para la estructura permanente: sin eso, dos presupuestos '
  'de estructura convivirían y v_presupuesto_total los sumaría.';


-- ── 2 · Una línea por categoría y concepto ────────────────────────────────
create unique index if not exists presupuesto_linea_uniq
  on presupuesto_linea (presupuesto_id, cat_gasto_id, concepto_id) nulls not distinct;

comment on index presupuesto_linea_uniq is
  'Una línea por (presupuesto, categoría, concepto). NULLS NOT DISTINCT porque '
  'concepto_id es NULL cuando la línea cubre la categoría entera — que es el '
  'caso de las 6 líneas que existen. Con un unique común no protegería nada.';


-- ── 3 · Sólo el aprobado proyecta ─────────────────────────────────────────
--
-- Se agrega el join a `presupuesto` con el filtro de estado. Todo lo demás de
-- la vista queda textual: las mismas columnas, en el mismo orden —`create or
-- replace view` no permite otra cosa— y el mismo cálculo de `factor`.
--
-- La cadena que esto corta es:
--     presupuesto (borrador) → v_presupuesto_total → v_cashflow_estimado → v_cashflow
-- y `v_cashflow_estimado` no necesita ningún cambio: hereda el filtro.

-- ── El cuerpo va COPIADO de la vista viva, no reescrito ───────────────────
--
-- `create or replace view` obliga a repetir la definición entera, y al primer
-- intento la reconstruí de memoria: quedó distinta en tres puntos silenciosos
-- —`unidad` hace un COALESCE de TRES niveles (línea → concepto → categoría) y
-- yo había omitido el del concepto; el factor `por_mes` usa `age()` y no
-- aritmética de `date_part`; y el cálculo vive en un CROSS JOIN LATERAL para
-- resolverse una sola vez—. Ninguna de las tres habría fallado: habría
-- devuelto otros números, en silencio.
--
-- Así que abajo va el cuerpo EXACTO de `pg_get_viewdef`, con una sola línea
-- agregada: el WHERE.

create or replace view public.v_presupuesto_total as
 SELECT pl.id,
    pl.presupuesto_id,
    pl.cat_gasto_id,
    pl.concepto_id,
    pl.base,
    pl.cantidad,
    pl.unidad AS unidad_linea,
    COALESCE(pl.unidad, cgc.unidad_default, cg.unidad_default) AS unidad,
    mult.factor,
    p.torneo_id,
    p.ejercicio_id,
    pl.base * pl.cantidad * mult.factor AS total_presupuestado
   FROM presupuesto_linea pl
     JOIN presupuesto p ON p.id = pl.presupuesto_id
     JOIN cat_gasto cg ON cg.id = pl.cat_gasto_id
     JOIN ejercicio e ON e.id = p.ejercicio_id
     LEFT JOIN concepto_gasto cgc ON cgc.id = pl.concepto_id
     LEFT JOIN v_torneo_escala esc ON esc.torneo_id = p.torneo_id
     CROSS JOIN LATERAL ( SELECT
                CASE COALESCE(pl.unidad, cgc.unidad_default, cg.unidad_default)
                    WHEN 'por_partido'::text THEN COALESCE(esc.partidos, 0::numeric)
                    WHEN 'por_dia_cancha'::text THEN COALESCE(esc.dias_cancha, 0::bigint)::numeric
                    WHEN 'por_mes'::text THEN EXTRACT(year FROM age((e.fecha_hasta + 1)::timestamp with time zone, e.fecha_desde::timestamp with time zone)) * 12::numeric + EXTRACT(month FROM age((e.fecha_hasta + 1)::timestamp with time zone, e.fecha_desde::timestamp with time zone))
                    ELSE 1::numeric
                END AS factor) mult
-- ── LO ÚNICO QUE CAMBIA ───────────────────────────────────────────────────
  WHERE p.estado = 'aprobado'::text;

comment on view public.v_presupuesto_total is
  'Una fila por línea de presupuesto, con su unidad efectiva, el factor que la '
  'escala y el total. Desde el 19/08 SÓLO expone presupuestos APROBADOS: un '
  'borrador es planificación en curso y no debe mover la proyección. El filtro '
  'vive acá y no en v_cashflow_estimado, que lo hereda por leer de esta vista. '
  'Expone `unidad` y `factor` para que la pantalla muestre de dónde sale el '
  'número, no sólo el número.';
