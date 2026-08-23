-- ═══════════════════════════════════════════════════════════════════════════
-- `v_torneo_lista` — la lista de torneos para /torneos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Regla 1: el front no cuenta. La pantalla necesita saber cuántos equipos y
-- cuánta estructura tiene cada torneo, y eso sale de acá, no de un `.length`
-- sobre un array traído aparte.
--
-- `equipos` cuenta fichas (`equipo_torneo`), que es lo que hace a un torneo
-- estar en marcha. `categorias`, `series` y `planes` son el molde: sirven para
-- ver de un vistazo si un torneo recién creado está vacío o ya tiene con qué
-- inscribir. Cuando lleguen los pasos 2 y 3 del módulo de estructura, esos tres
-- números son los que van a mostrar el avance.
--
-- `tiene_estructura` resume lo mismo en un booleano: un torneo sin categorías o
-- sin tarifario **no puede recibir una ficha** —`crear_equipo_torneo` necesita
-- serie y plan—, así que la pantalla lo marca en vez de dejar que el operador
-- lo descubra al intentar inscribir.
--
-- Sin filtro de `activo`: la lista los muestra todos y expone la columna, igual
-- que el diario con los anulados. Esconder un torneo dado de baja es esconder
-- que existió.

create or replace view v_torneo_lista as
select
  t.id                as torneo_id,
  t.nombre,
  t.temporada::text   as temporada,
  t.anio,
  t.estado,
  t.activo,
  t.fecha_desde,
  t.fecha_hasta,
  t.ejercicio_id,
  e.anio              as ejercicio_anio,
  (select count(*) from equipo_torneo et where et.torneo_id = t.id)          as equipos,
  (select count(*) from categoria c where c.torneo_id = t.id)                as categorias,
  (select count(*) from serie s
     join categoria c on c.id = s.categoria_id
    where c.torneo_id = t.id)                                                as series,
  (select count(*) from plan_tarifa p where p.torneo_id = t.id and p.activo) as planes,
  (
    exists (select 1 from serie s join categoria c on c.id = s.categoria_id where c.torneo_id = t.id)
    and exists (select 1 from plan_tarifa p where p.torneo_id = t.id and p.activo)
  )                                                                          as tiene_estructura
from torneo t
left join ejercicio e on e.id = t.ejercicio_id;

comment on view v_torneo_lista is
  'Lista de torneos para /torneos, con el conteo de fichas y de estructura (regla 1: el front no cuenta). tiene_estructura = tiene al menos una serie y un plan de tarifa activo, que es lo mínimo que crear_equipo_torneo necesita para inscribir.';
