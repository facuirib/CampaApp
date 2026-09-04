-- La nota de la línea, expuesta a la pantalla.
--
-- Se agrega AL FINAL a propósito: `create or replace view` sólo deja apilar
-- columnas nuevas al final —no renombrar, no reordenar, no cambiar tipo—, así
-- que el orden de las de arriba se transcribe tal cual está en la base.
--
-- Sale de `v_presupuesto_linea` y no de `v_presupuesto_total` porque la nota es
-- para EDITAR: `v_presupuesto_total` filtra `estado = 'aprobado'` y la nota se
-- escribe justamente mientras el presupuesto todavía es borrador.

create or replace view v_presupuesto_linea as
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
    p.estado,
    pl.concepto_libre
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
