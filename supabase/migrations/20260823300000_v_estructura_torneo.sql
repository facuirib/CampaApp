-- ═══════════════════════════════════════════════════════════════════════════
-- `v_estructura_torneo` — las categorías de un torneo con sus series
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La pantalla de estructura muestra un árbol: categoría → series, y por cada
-- una cuántos equipos hay inscriptos. Ese conteo es lo que decide si una serie
-- se puede borrar o mover, así que sale de acá y no de un `.filter().length`
-- sobre las fichas traídas aparte (regla 1).
--
-- Una fila por SERIE, con los datos de su categoría repetidos. Las categorías
-- sin ninguna serie aparecen igual, con `serie_id` en NULL — el LEFT JOIN es
-- deliberado: una categoría recién creada todavía no tiene series y tiene que
-- verse, si no el operador no encuentra dónde agregárselas.

create or replace view v_estructura_torneo as
select
  c.torneo_id,
  c.id                as categoria_id,
  c.nombre            as categoria,
  c.genero::text      as genero,
  c.orden             as categoria_orden,
  s.id                as serie_id,
  s.nombre            as serie,
  s.orden             as serie_orden,
  (select count(*) from equipo_torneo e where e.serie_id = s.id)          as equipos,
  (select count(*) from equipo_torneo e
     join serie s2 on s2.id = e.serie_id
    where s2.categoria_id = c.id)                                          as equipos_categoria
from categoria c
left join serie s on s.categoria_id = c.id;

comment on view v_estructura_torneo is
  'El árbol categoría → serie de un torneo, con el conteo de equipos por serie y por categoría (regla 1: el front no cuenta). Las categorías sin series aparecen con serie_id NULL — una categoría recién creada tiene que verse para poder agregarle series.';
