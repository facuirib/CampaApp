-- ═══════════════════════════════════════════════════════════════════════════
-- `v_cuenta_corriente_equipo` expone el id del torneo, no sólo su nombre
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La vista ya hace `join torneo t on t.id = et.torneo_id` y devuelve `t.nombre`.
-- El id estaba ahí, a un `select` de distancia, y no salía.
--
-- Hace falta para el selector de torneo de la ficha: agrupar las fichas por
-- torneo con el NOMBRE funcionaría hasta que dos torneos se llamen igual, y
-- armar el link `?torneo=` pide el id de todos modos.
--
-- La alternativa era deducirlo del lado del front cruzando por
-- `equipo_torneo_id` contra las cuotas —que sí lo traen—, y eso se rompe con
-- una ficha sin cuotas generadas: la ficha desaparecería del selector sin que
-- nadie entienda por qué.
--
-- Va AL FINAL del select, que es lo único que admite `create or replace view`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_cuenta_corriente_equipo as
 SELECT et.id AS equipo_torneo_id,
    te.id AS tercero_id,
    te.nombre AS equipo,
    t.nombre AS torneo,
    cat.nombre AS categoria,
    cat.genero,
    s.nombre AS serie,
    et.total_plan,
    COALESCE(sum(i.imputado), 0::numeric) AS total_pagado,
    et.total_plan - COALESCE(sum(i.imputado), 0::numeric) AS saldo,
    count(c.id) AS cuotas_total,
    count(c.pagado_at) AS cuotas_pagadas,
    min(
        CASE
            WHEN c.pagado_at IS NULL AND (j.id IS NULL OR j.estado <> 'suspendida'::text) THEN c.vence_at
            ELSE NULL::date
        END) AS proximo_vencimiento,
    t.id AS torneo_id
   FROM equipo_torneo et
     JOIN tercero te ON te.id = et.tercero_id
     JOIN torneo t ON t.id = et.torneo_id
     JOIN serie s ON s.id = et.serie_id
     JOIN categoria cat ON cat.id = s.categoria_id
     LEFT JOIN cuota c ON c.equipo_torneo_id = et.id
     LEFT JOIN jornada j ON j.id = c.jornada_id
     LEFT JOIN ( SELECT pago_imputacion.cuota_id,
            sum(pago_imputacion.monto) AS imputado
           FROM pago_imputacion
          GROUP BY pago_imputacion.cuota_id) i ON i.cuota_id = c.id
  GROUP BY et.id, te.id, te.nombre, t.id, t.nombre, cat.nombre, cat.genero, s.nombre, et.total_plan;
