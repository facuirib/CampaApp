-- v_inscripcion — estado de inscripción por equipo/torneo
-- Una fila por ficha (equipo_torneo). Estado de la cuota de inscripción
-- (paga/impaga/parcial/sin_cuotas) derivado de las cuotas del plan_inscripcion.
-- Regla 4: vista que lista. Aplicada directo (lectura pura); registrada en schema_migrations aparte.

create or replace view public.v_inscripcion as
with cuotas_insc as (
  select c.equipo_torneo_id, count(*) as total_cuotas, count(c.pagado_at) as pagadas,
    sum(c.monto) as monto_insc, min(c.vence_at) as primer_venc,
    bool_or(c.pagado_at is null and c.vence_at < current_date) as tiene_vencida
  from cuota c
  join plan_tarifa_linea ptl on ptl.id = c.plan_tarifa_linea_id
  join equipo_torneo et on et.id = c.equipo_torneo_id
  where ptl.plan_tarifa_id = et.plan_inscripcion_id
  group by c.equipo_torneo_id
)
select et.id as equipo_torneo_id, et.torneo_id, tor.nombre as torneo,
  et.tercero_id, ter.nombre as equipo, et.serie_id, s.nombre as serie,
  c.nombre as categoria, c.genero, (c.nombre || ' ' || s.nombre) as serie_completa,
  et.total_plan, et.medio_previsto,
  coalesce(ci.total_cuotas, 0) as cuotas_inscripcion,
  coalesce(ci.pagadas, 0) as cuotas_pagadas, ci.monto_insc, ci.primer_venc,
  case when ci.total_cuotas is null or ci.total_cuotas = 0 then 'sin_cuotas'
    when ci.pagadas = ci.total_cuotas then 'paga'
    when ci.pagadas = 0 then 'impaga' else 'parcial' end as estado_inscripcion,
  coalesce(ci.tiene_vencida, false) as tiene_vencida
from equipo_torneo et
join tercero ter on ter.id = et.tercero_id
join torneo tor on tor.id = et.torneo_id
join serie s on s.id = et.serie_id
join categoria c on c.id = s.categoria_id
left join cuotas_insc ci on ci.equipo_torneo_id = et.id;