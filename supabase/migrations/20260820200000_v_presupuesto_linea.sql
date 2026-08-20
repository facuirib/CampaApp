-- ═══════════════════════════════════════════════════════════════════════════
-- v_presupuesto_linea · el detalle de TODAS las líneas, aprobadas o no
--
-- ⚠️ PROPUESTA · NO APLICADA. Toca `v_presupuesto_total`, de HORACIO: se avisa.
--
-- ── El bug, encontrado en el QA de /presupuesto ────────────────────────────
--
-- La pantalla mostraba un borrador con esta contradicción, en el mismo bloque:
--
--     Apertura 2027 · Borrador · Ejercicio 2026 · 2 líneas          $0
--     ┌──────────────────────────────────────────────────┐
--     │        Sin líneas todavía. Agregá la primera.    │
--     └──────────────────────────────────────────────────┘
--
-- «2 líneas» arriba y «sin líneas» abajo. El encabezado sale de
-- `v_presupuesto_ambito`, que cuenta sobre la tabla; el detalle salía de
-- `v_presupuesto_total`, que **sólo expone los aprobados** (20260819200000).
--
-- O sea: **la pantalla de carga no podía ver las líneas de un borrador**, que
-- es exactamente lo que existe para editar. Se podía crear el borrador y
-- agregarle líneas, pero no verlas ni tocarlas después.
--
-- ── El arreglo · separar las dos preguntas ─────────────────────────────────
--
-- El filtro por estado es correcto para el CASHFLOW y equivocado para la
-- EDICIÓN. Son dos preguntas distintas y merecen dos vistas:
--
--   `v_presupuesto_linea`  → TODAS las líneas, con su `estado`. La pantalla.
--   `v_presupuesto_total`  → sólo las aprobadas. El cashflow, sin cambios.
--
-- Y `v_presupuesto_total` pasa a definirse SOBRE la nueva:
--
--     select … from v_presupuesto_linea where estado = 'aprobado'
--
-- Eso elimina la duplicación: el cálculo del factor —con su COALESCE de tres
-- niveles y su `age()` para los meses— queda escrito UNA sola vez. Hasta hoy
-- estaba en un solo lugar; copiarlo para la vista nueva habría creado dos
-- copias que se desincronizan, que es justo el drift que venimos peleando.
--
-- ── Lo que NO cambia ───────────────────────────────────────────────────────
--
-- `v_presupuesto_total` conserva **las mismas 12 columnas, en el mismo orden**
-- —`create or replace view` no permite otra cosa— y el mismo filtro. Sus
-- consumidores (`v_cashflow_estimado`, y de ahí `v_cashflow` y `/proyeccion`)
-- no se enteran: mismas filas, mismos números.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · La vista nueva: el cálculo, sin filtrar por estado ────────────────
create or replace view public.v_presupuesto_linea as
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
    pl.base * pl.cantidad * mult.factor AS total_presupuestado,
    -- Lo único que agrega respecto de v_presupuesto_total: el estado, para que
    -- la pantalla sepa si lo que muestra proyecta o no.
    p.estado
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
                END AS factor) mult;

comment on view public.v_presupuesto_linea is
  'TODAS las líneas de presupuesto —aprobadas y en borrador— con su unidad '
  'efectiva, su factor y su total. Es la que lee la pantalla de carga, que '
  'necesita ver los borradores para poder editarlos. El cashflow NO lee de '
  'acá: usa v_presupuesto_total, que filtra estado = aprobado y se define '
  'sobre esta vista para no duplicar el cálculo del factor.';


-- ── 2 · v_presupuesto_total pasa a apoyarse en la nueva ───────────────────
-- Mismas 12 columnas, mismo orden, mismo filtro. Lo que se va es la copia del
-- cálculo: ahora vive en un solo lugar.
create or replace view public.v_presupuesto_total as
 SELECT id,
    presupuesto_id,
    cat_gasto_id,
    concepto_id,
    base,
    cantidad,
    unidad_linea,
    unidad,
    factor,
    torneo_id,
    ejercicio_id,
    total_presupuestado
   FROM v_presupuesto_linea
  WHERE estado = 'aprobado'::text;

comment on view public.v_presupuesto_total is
  'Una fila por línea de presupuesto APROBADO, con su unidad efectiva, el '
  'factor que la escala y el total. Es la que alimenta v_cashflow_estimado: un '
  'borrador es planificación en curso y no debe mover la proyección. Desde el '
  '20/08 se define sobre v_presupuesto_linea —que trae todas— en vez de '
  'repetir el cálculo del factor: una sola definición, dos preguntas.';
