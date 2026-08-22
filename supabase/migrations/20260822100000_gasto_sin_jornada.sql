-- ═══════════════════════════════════════════════════════════════
-- Gastos sin jornada · check_gasto_coherente + v_cashflow_estimado
-- PROPUESTA, NO APLICAR sin revisión de Facu (regla 11 · motor + vista
-- de proyección, zona compartida).
--
-- Respuesta a la pregunta directa de Facu (21/08, coordinacion.md):
-- "¿La corrección la tomás vos o la tomo yo?" — la tomo yo.
--
-- El problema: mi corrección de ayer (predio_id obligatorio para
-- por_dia_cancha) quedó a medias. El trigger seguía exigiendo
-- jornada_id para naturaleza='por_fecha' en TODOS los casos, pero para
-- árbitros (por_fecha, unidad_default='por_partido') la "jornada" es
-- un dato inventado: una fecha tiene hasta 19 jornadas simultáneas
-- (9,5 en promedio), el operador solo estima una cantidad de partidos.
--
-- LOS DOS CAMBIOS VAN JUNTOS (Facu: "si uno va sin el otro la exclusión
-- deja de disparar"):
--  1. check_gasto_coherente: deja de exigir/prohibir jornada_id.
--  2. v_cashflow_estimado: la exclusión de doble conteo de la rama
--     por_partido deja de cruzar por jornada_id, pasa a cat_gasto+fecha
--     (SIN predio — jornada no tiene predio_id, a diferencia de
--     por_dia_cancha, porque un partido puede jugarse en cualquiera de
--     los predios de la serie).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.check_gasto_coherente()
returns trigger
language plpgsql
as $function$
declare
  nat text;
  uni text;
begin
  select naturaleza, unidad_default into nat, uni from cat_gasto where id = new.cat_gasto_id;

  if nat = 'por_fecha' and uni = 'por_dia_cancha' and new.predio_id is null then
    raise exception
      'Un gasto por_dia_cancha requiere predio: sin él, el cashflow no '
      'puede saber qué caja de qué predio ya cubrió este gasto, y lo '
      'estimado se duplica con lo real.';
  end if;

  if nat = 'inversion' and new.activo_id is null then
    raise exception 'Una inversión requiere un activo asociado';
  end if;

  if nat = 'recurrente' and new.torneo_id is not null then
    raise exception 'Los gastos recurrentes son de estructura, no de un torneo';
  end if;

  if nat = 'eventual'
     and new.torneo_id is null
     and new.predio_id is null
     and new.activo_id is null then
    raise exception
      'Un gasto eventual debe imputarse a un torneo, un predio o un activo';
  end if;

  return new;
end $function$;

comment on function check_gasto_coherente() is
  'Valida coherencia de gasto según naturaleza. 21/08: dejó de exigir/'
  'prohibir jornada_id — una fecha tiene hasta 19 jornadas simultáneas, '
  'elegir una era inventar un dato. predio_id obligatorio en '
  'por_dia_cancha (20/08) sigue intacto.';


create or replace view public.v_cashflow_estimado as
 SELECT j.fecha,
    'estimado'::text AS nivel,
    'presupuesto_partido'::text AS origen,
    cg.nombre AS detalle,
    - (pt.base * pt.cantidad *
        CASE
            WHEN j.es_playoff THEN j.cantidad_partidos::numeric
            ELSE ( SELECT count(*)::numeric / 2::numeric
               FROM equipo_torneo et
              WHERE et.serie_id = j.serie_id)
        END) AS monto
   FROM v_presupuesto_total pt
     JOIN cat_gasto cg ON cg.id = pt.cat_gasto_id
     JOIN categoria c ON c.torneo_id = pt.torneo_id
     JOIN serie s ON s.categoria_id = c.id
     JOIN jornada j ON j.serie_id = s.id
  WHERE pt.unidad = 'por_partido'::text AND j.estado <> 'suspendida'::text AND j.fecha > CURRENT_DATE AND NOT (EXISTS ( SELECT 1
           FROM gasto g
             JOIN v_gasto_detalle d ON d.gasto_id = g.id
          WHERE g.cat_gasto_id = pt.cat_gasto_id AND g.devengado_at = j.fecha AND d.estado <> 'anulado'::text))
UNION ALL
 SELECT dct.fecha,
    'estimado'::text AS nivel,
    'presupuesto_dia_cancha'::text AS origen,
    cg.nombre AS detalle,
    - (pt.base * pt.cantidad) AS monto
   FROM v_presupuesto_total pt
     JOIN cat_gasto cg ON cg.id = pt.cat_gasto_id
     JOIN v_dia_cancha_torneo dct ON dct.torneo_id = pt.torneo_id
  WHERE pt.unidad = 'por_dia_cancha'::text AND dct.fecha > CURRENT_DATE AND NOT (EXISTS ( SELECT 1
           FROM gasto g
             JOIN v_gasto_detalle d ON d.gasto_id = g.id
          WHERE g.cat_gasto_id = pt.cat_gasto_id AND g.predio_id = dct.predio_id AND g.devengado_at = dct.fecha AND d.estado <> 'anulado'::text))
UNION ALL
 SELECT m.fin AS fecha,
    'estimado'::text AS nivel,
    'presupuesto_mensual'::text AS origen,
    cg.nombre AS detalle,
    - GREATEST(pt.base * pt.cantidad - ya.real_del_mes, 0::numeric) AS monto
   FROM v_presupuesto_total pt
     JOIN cat_gasto cg ON cg.id = pt.cat_gasto_id
     JOIN ejercicio e ON e.id = pt.ejercicio_id
     CROSS JOIN LATERAL ( SELECT (d.d + '1 mon -1 days'::interval)::date AS fin
           FROM generate_series(date_trunc('month'::text, e.fecha_desde::timestamp with time zone), date_trunc('month'::text, e.fecha_hasta::timestamp with time zone), '1 mon'::interval) d(d)) m
     CROSS JOIN LATERAL ( SELECT COALESCE(sum(g.total), 0::numeric) AS real_del_mes
           FROM gasto g
             JOIN v_gasto_detalle d ON d.gasto_id = g.id
          WHERE g.cat_gasto_id = pt.cat_gasto_id AND d.estado <> 'anulado'::text AND date_trunc('month'::text, g.devengado_at::timestamp with time zone) = date_trunc('month'::text, m.fin::timestamp with time zone)) ya
  WHERE pt.unidad = 'por_mes'::text AND m.fin > CURRENT_DATE AND (pt.base * pt.cantidad) > ya.real_del_mes;

comment on view public.v_cashflow_estimado is
  'Egresos estimados del presupuesto, excluyendo lo que ya tiene gasto '
  'real. 21/08: rama por_partido cambió su exclusión de jornada_id a '
  'cat_gasto+fecha (va junto con check_gasto_coherente dejando de exigir '
  'jornada_id).';