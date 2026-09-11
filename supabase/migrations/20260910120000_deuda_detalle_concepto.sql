-- ═══════════════════════════════════════════════════════════════
-- v_deuda_detalle: agrega concepto_label
--
-- La ficha del equipo (/equipos/[id]) lista las cuotas con su número
-- (1, 2, 3…) pero sin decir a qué corresponden — "Cuota 3" no dice si
-- es la inscripción o el partido de la fecha 8. `concepto_label` ya
-- existe en plan_tarifa_linea (la línea que generó la cuota, vía
-- cuota.plan_tarifa_linea_id) — sólo faltaba exponerlo acá.
--
-- `create or replace view` y NO `drop + create`: v_deuda_detalle tiene
-- tres vistas dependientes (v_cobranza_momento, v_cobranza_cola,
-- v_cobranza_etapa) y un DROP se lleva puestas a las tres —haría falta
-- CASCADE y recrearlas exactas, alto riesgo para un cambio aditivo—.
-- `create or replace` no las toca, PERO exige que las columnas
-- existentes queden con el mismo nombre y el mismo ORDEN: sólo se puede
-- agregar columnas nuevas al final. Por eso `concepto_label` va último
-- en el select, no al lado de `cuota_numero` donde se leería más
-- natural.
--
-- `left join` y no `join`: cuota.plan_tarifa_linea_id es `not null` en
-- la tabla hoy, pero el join queda conservador —mismo criterio que ya
-- usa esta vista para `jornada`— así ninguna cuota desaparece de la
-- vista si esa garantía cambia el día de mañana.
-- ═══════════════════════════════════════════════════════════════

create or replace view v_deuda_detalle as
select
  t.id                as tercero_id,
  t.nombre            as equipo,
  tt.id               as torneo_id,
  tt.nombre           as torneo,
  tt.estado           as torneo_estado,
  cat.nombre          as categoria,
  cat.genero          as genero,
  s.nombre            as serie,
  c.id                as cuota_id,
  c.numero            as cuota_numero,
  c.vence_at,
  c.monto,
  coalesce(imp.monto, 0) + coalesce(ant.monto, 0)  as pagado,
  c.monto - coalesce(imp.monto, 0) - coalesce(ant.monto, 0) as saldo,
  coalesce(ant.monto, 0)                  as pagado_con_anticipo,
  (j.id is not null and j.estado = 'suspendida') as jornada_suspendida,
  case
    when c.pagado_at is not null                          then 'pagada'
    when j.estado = 'suspendida'                          then 'suspendida'
    when coalesce(imp.monto,0) + coalesce(ant.monto,0) > 0
         and c.vence_at < current_date                    then 'parcial_vencida'
    when coalesce(imp.monto,0) + coalesce(ant.monto,0) > 0 then 'parcial'
    when c.vence_at < current_date                        then 'vencida'
    when c.vence_at <= current_date + 7                   then 'por_vencer'
    else 'al_dia'
  end                                     as estado,
  case when j.estado = 'suspendida' then null
       else current_date - c.vence_at end as dias_atraso,
  c.pagado_at,
  et.id               as equipo_torneo_id,
  l.concepto_label                                          -- NUEVO, al final
from tercero t
join equipo_torneo et  on et.tercero_id = t.id
join torneo tt         on tt.id  = et.torneo_id
join serie s           on s.id   = et.serie_id
join categoria cat     on cat.id = s.categoria_id
join cuota c           on c.equipo_torneo_id = et.id
left join plan_tarifa_linea l on l.id = c.plan_tarifa_linea_id   -- NUEVO
left join jornada j    on j.id   = c.jornada_id
left join lateral (
  select sum(monto) as monto from pago_imputacion where cuota_id = c.id
) imp on true
left join lateral (
  select sum(monto) as monto from anticipo_uso where cuota_id = c.id
) ant on true
where t.tipo = 'equipo';

comment on view v_deuda_detalle is
  'Deuda del equipo cuota por cuota. Las de liga con jornada suspendida salen '
  'como "suspendida" y sin días de atraso (decisión 51). concepto_label sale '
  'de la línea de tarifa que generó la cuota.';
