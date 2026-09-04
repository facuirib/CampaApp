-- ─────────────────────────────────────────────────────────────────────────────
-- Qué le falta a un torneo para poder confirmarse
--
-- Nivel A, parte 2.
--
-- ── Por qué una vista y no cinco consultas en la pantalla ──────────────────
--
-- Son cinco conteos —categorías, series, planes, fichas, jornadas— y uno más
-- que decide si ya se confirmó. Hacerlos en el front sería contar en la
-- pantalla, que es la regla 1, y además dejaría la definición de «listo» escrita
-- en un componente: el día que `confirmar_torneo_clonado` exija algo más, la
-- lista de control seguiría diciendo que está todo bien.
--
-- ── El corazón: `jornadas` ─────────────────────────────────────────────────
--
-- `clonar_torneo` clona estructura, tarifario y fichas, pero NO el calendario.
-- Y `generar_cuotas_ficha` —que `confirmar_torneo_clonado` llama por ficha—
-- frena con «la serie no tiene ninguna jornada en ese rango: sembrá el
-- calendario antes de generar cuotas».
--
-- O sea que hoy confirmar un torneo clonado FALLA, y el operador se entera al
-- apretar el botón. Esta vista existe para que se entere antes.
--
-- `jornadas_sin_fecha` va aparte porque es un freno distinto: la cuota de cada
-- fecha vence con su jornada, así que una jornada sin fecha tampoco deja
-- generar. Sembrar el calendario y fecharlo son dos pasos.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_torneo_listo as
select
  t.id as torneo_id,
  t.nombre,
  t.estado,
  (select count(*) from categoria c where c.torneo_id = t.id)::int as categorias,
  (select count(*) from serie s join categoria c on c.id = s.categoria_id
    where c.torneo_id = t.id)::int as series,
  (select count(*) from plan_tarifa p where p.torneo_id = t.id and p.activo)::int as planes,
  (select count(*) from equipo_torneo et where et.torneo_id = t.id)::int as fichas,
  (select count(*) from jornada j join serie s on s.id = j.serie_id
     join categoria c on c.id = s.categoria_id
    where c.torneo_id = t.id)::int as jornadas,
  (select count(*) from jornada j join serie s on s.id = j.serie_id
     join categoria c on c.id = s.categoria_id
    where c.torneo_id = t.id and j.fecha is null)::int as jornadas_sin_fecha,
  (select count(*) from cuota q join equipo_torneo et on et.id = q.equipo_torneo_id
    where et.torneo_id = t.id)::int as cuotas,
  -- Ya confirmado = ya tiene cuotas. No hay una columna de «confirmado» y no
  -- hace falta: las cuotas SON el efecto de confirmar, así que preguntarle a
  -- ellas no puede desincronizarse de la realidad.
  (exists (select 1 from cuota q join equipo_torneo et on et.id = q.equipo_torneo_id
            where et.torneo_id = t.id)) as confirmado,
  -- Lo que falta, en el orden en que hay que resolverlo.
  array_remove(array[
    case when (select count(*) from categoria c where c.torneo_id = t.id) = 0
         then 'estructura: no hay categorías' end,
    case when (select count(*) from serie s join categoria c on c.id = s.categoria_id
                where c.torneo_id = t.id) = 0
         then 'estructura: no hay series' end,
    case when (select count(*) from plan_tarifa p where p.torneo_id = t.id and p.activo) = 0
         then 'tarifario: no hay planes activos' end,
    case when (select count(*) from equipo_torneo et where et.torneo_id = t.id) = 0
         then 'equipos: no hay fichas' end,
    case when (select count(*) from jornada j join serie s on s.id = j.serie_id
                 join categoria c on c.id = s.categoria_id where c.torneo_id = t.id) = 0
         then 'calendario: no hay jornadas — sin esto las cuotas por fecha no se pueden generar' end,
    case when (select count(*) from jornada j join serie s on s.id = j.serie_id
                 join categoria c on c.id = s.categoria_id
                where c.torneo_id = t.id and j.fecha is null) > 0
         then 'calendario: hay jornadas sin fecha — la cuota vence con su jornada' end
  ], null) as falta
from torneo t;

comment on view v_torneo_listo is
  'La lista de control de un torneo antes de confirmarlo. `falta` vacío = se puede confirmar. `confirmado` se deduce de que ya existan cuotas.';
