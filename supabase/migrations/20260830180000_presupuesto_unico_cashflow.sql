-- ═══════════════════════════════════════════════════════════════
-- presupuesto_linea.fecha + cobertura de unico/anual en cashflow
-- APLICADA el 30/08/2026.
--
-- Hallazgo (30/08): el check de presupuesto_linea.unidad permite
-- 'unico' y 'anual', pero v_cashflow_estimado solo maneja por_partido,
-- por_dia_cancha y por_mes. Una linea con esos dos valores no aparece
-- en ninguna proyeccion de flujo de caja - hueco real, no decision
-- documentada.
--
-- CORREGIDO durante la revision (mismo dia): el primer diseno validaba
-- presupuesto_linea.unidad (la columna cruda), pero lo que importa es
-- la unidad EFECTIVA - la misma que calcula v_presupuesto_total:
--   COALESCE(pl.unidad, concepto_gasto.unidad_default, cat_gasto.unidad_default)
-- Un check simple no alcanza (necesita mirar otras tablas), se resolvio
-- con trigger, mismo patron que check_gasto_coherente().
--
-- Decision de Horacio: el usuario ingresa la fecha al cargar la linea.
--
-- IMPORTANTE - limite conocido y aceptado: ya existe una linea real
-- ($10, aprobada) cuya unidad efectiva es 'unico' heredada del
-- catalogo. El trigger es BEFORE INSERT OR UPDATE, no afecta filas
-- existentes - esa linea sigue sin fecha (y por lo tanto sin cashflow)
-- hasta que alguien la edite. Decision explicita: no forzar la
-- correccion ahora, dejarla para cuando se edite naturalmente.
--
-- Verificado con BEGIN...ROLLBACK: el trigger rechaza correctamente un
-- intento de UPDATE sobre esa linea real sin fecha, confirmando que
-- detecta el caso heredado (no solo el override explicito).
-- ═══════════════════════════════════════════════════════════════

alter table presupuesto_linea
  add column fecha date;

comment on column presupuesto_linea.fecha is
  'Fecha en la que se espera este gasto, solo cuando la unidad EFECTIVA (propia, o heredada del concepto/categoria) es unico o anual. Validado por trigger, no por check simple.';

create or replace function public.check_presupuesto_linea_coherente()
returns trigger
language plpgsql
as $function$
declare
  v_unidad_efectiva text;
begin
  select coalesce(
           new.unidad,
           cgc.unidad_default,
           cg.unidad_default
         )
    into v_unidad_efectiva
  from cat_gasto cg
  left join concepto_gasto cgc on cgc.id = new.concepto_id
  where cg.id = new.cat_gasto_id;

  if v_unidad_efectiva in ('unico', 'anual') and new.fecha is null then
    raise exception
      'Una linea con unidad efectiva "%" (propia o heredada del catalogo) necesita fecha: sin ella, este gasto no aparece en ninguna proyeccion de flujo de caja.', v_unidad_efectiva;
  end if;

  if v_unidad_efectiva not in ('unico', 'anual') and new.fecha is not null then
    raise exception
      'La fecha es solo para unidad unico/anual. Esta linea es "%" y no la necesita.', v_unidad_efectiva;
  end if;

  return new;
end;
$function$;

create trigger trg_presupuesto_linea_coherente
  before insert or update on presupuesto_linea
  for each row
  execute function check_presupuesto_linea_coherente();

comment on function check_presupuesto_linea_coherente() is
  'Valida fecha contra la unidad EFECTIVA (propia o heredada del concepto/categoria), no la columna cruda.';

create or replace view v_cashflow_estimado as
 SELECT j.fecha,
    'estimado'::text AS nivel,
    'presupuesto_partido'::text AS origen,
    cg.nombre AS detalle,
    (- ((pt.base * pt.cantidad) *
        CASE
            WHEN j.es_playoff THEN (j.cantidad_partidos)::numeric
            ELSE ( SELECT ((count(*))::numeric / (2)::numeric)
               FROM equipo_torneo et
              WHERE (et.serie_id = j.serie_id))
        END)) AS monto
   FROM ((((v_presupuesto_total pt
     JOIN cat_gasto cg ON ((cg.id = pt.cat_gasto_id)))
     JOIN categoria c ON ((c.torneo_id = pt.torneo_id)))
     JOIN serie s ON ((s.categoria_id = c.id)))
     JOIN jornada j ON ((j.serie_id = s.id)))
  WHERE ((pt.unidad = 'por_partido'::text) AND (j.estado <> 'suspendida'::text) AND (j.fecha > CURRENT_DATE) AND (NOT (EXISTS ( SELECT 1
           FROM (gasto g
             JOIN v_gasto_detalle d ON ((d.gasto_id = g.id)))
          WHERE ((g.cat_gasto_id = pt.cat_gasto_id) AND (g.devengado_at = j.fecha) AND (d.estado <> 'anulado'::text))))))
UNION ALL
 SELECT dct.fecha,
    'estimado'::text AS nivel,
    'presupuesto_dia_cancha'::text AS origen,
    cg.nombre AS detalle,
    (- (pt.base * pt.cantidad)) AS monto
   FROM ((v_presupuesto_total pt
     JOIN cat_gasto cg ON ((cg.id = pt.cat_gasto_id)))
     JOIN v_dia_cancha_torneo dct ON ((dct.torneo_id = pt.torneo_id)))
  WHERE ((pt.unidad = 'por_dia_cancha'::text) AND (dct.fecha > CURRENT_DATE) AND (NOT (EXISTS ( SELECT 1
           FROM (gasto g
             JOIN v_gasto_detalle d ON ((d.gasto_id = g.id)))
          WHERE ((g.cat_gasto_id = pt.cat_gasto_id) AND (g.predio_id = dct.predio_id) AND (g.devengado_at = dct.fecha) AND (d.estado <> 'anulado'::text))))))
UNION ALL
 SELECT m.fin AS fecha,
    'estimado'::text AS nivel,
    'presupuesto_mensual'::text AS origen,
    cg.nombre AS detalle,
    (- GREATEST(((pt.base * pt.cantidad) - ya.real_del_mes), (0)::numeric)) AS monto
   FROM ((((v_presupuesto_total pt
     JOIN cat_gasto cg ON ((cg.id = pt.cat_gasto_id)))
     JOIN ejercicio e ON ((e.id = pt.ejercicio_id)))
     CROSS JOIN LATERAL ( SELECT ((d.d + '1 mon -1 days'::interval))::date AS fin
           FROM generate_series(date_trunc('month'::text, (e.fecha_desde)::timestamp with time zone), date_trunc('month'::text, (e.fecha_hasta)::timestamp with time zone), '1 mon'::interval) d(d)) m)
     CROSS JOIN LATERAL ( SELECT COALESCE(sum(g.total), (0)::numeric) AS real_del_mes
           FROM (gasto g
             JOIN v_gasto_detalle d ON ((d.gasto_id = g.id)))
          WHERE ((g.cat_gasto_id = pt.cat_gasto_id) AND (d.estado <> 'anulado'::text) AND (date_trunc('month'::text, (g.devengado_at)::timestamp with time zone) = date_trunc('month'::text, (m.fin)::timestamp with time zone)))) ya)
  WHERE ((pt.unidad = 'por_mes'::text) AND (m.fin > CURRENT_DATE) AND ((pt.base * pt.cantidad) > ya.real_del_mes))
UNION ALL
 SELECT pl.fecha,
    'estimado'::text AS nivel,
    'presupuesto_unico'::text AS origen,
    cg.nombre AS detalle,
    (- pt.total_presupuestado) AS monto
   FROM (v_presupuesto_total pt
     JOIN presupuesto_linea pl ON (pl.id = pt.id)
     JOIN cat_gasto cg ON ((cg.id = pt.cat_gasto_id)))
  WHERE ((pt.unidad in ('unico', 'anual')) AND (pl.fecha > CURRENT_DATE) AND (NOT (EXISTS ( SELECT 1
           FROM (gasto g
             JOIN v_gasto_detalle d ON ((d.gasto_id = g.id)))
          WHERE ((g.cat_gasto_id = pt.cat_gasto_id) AND (g.devengado_at = pl.fecha) AND (d.estado <> 'anulado'::text))))));
