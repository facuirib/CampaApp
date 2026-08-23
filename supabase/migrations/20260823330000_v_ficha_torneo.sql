-- ═══════════════════════════════════════════════════════════════════════════
-- `v_ficha_torneo` — las fichas de un torneo, para la pantalla de inscriptos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Regla 1: el front no cuenta. La pantalla necesita, por ficha, su serie, sus
-- planes, cuántas cuotas tiene y **cuántas están atadas a jornadas** — ese
-- último número es el que decide si la ficha se puede mover de serie, y tiene
-- que estar antes de ofrecer el select, no después de que el operador lo use.

create or replace view v_ficha_torneo as
select
  e.id                as ficha_id,
  e.torneo_id,
  e.tercero_id,
  t.nombre            as equipo,
  e.serie_id,
  s.nombre            as serie,
  c.id                as categoria_id,
  c.nombre            as categoria,
  c.genero::text      as genero,
  c.orden             as categoria_orden,
  s.orden             as serie_orden,
  pi.opcion_nombre    as plan_inscripcion,
  pp.opcion_nombre    as plan_partidos,
  e.medio_previsto::text as medio_previsto,
  e.total_plan,
  (select count(*) from cuota q where q.equipo_torneo_id = e.id)                         as cuotas,
  (select count(*) from cuota q where q.equipo_torneo_id = e.id and q.jornada_id is not null) as cuotas_con_jornada,
  (select count(*) from cuota q where q.equipo_torneo_id = e.id and q.pagado_at is not null)  as cuotas_pagadas
from equipo_torneo e
join tercero t    on t.id = e.tercero_id
join serie s      on s.id = e.serie_id
join categoria c  on c.id = s.categoria_id
join plan_tarifa pi on pi.id = e.plan_inscripcion_id
join plan_tarifa pp on pp.id = e.plan_partidos_id;

comment on view v_ficha_torneo is
  'Las fichas de un torneo con su serie, sus planes y sus conteos de cuotas. cuotas_con_jornada es el que decide si la ficha se puede mover de serie: mover_ficha_de_serie lo bloquea cuando es > 0, y la pantalla tiene que saberlo antes de ofrecer el select.';
