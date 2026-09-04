-- ─────────────────────────────────────────────────────────────────────────────
-- El calendario dice de qué torneo es
--
-- Nivel A, parte 1.
--
-- ── El problema ────────────────────────────────────────────────────────────
--
-- `/calendario` filtra por serie y nada más, y hoy hay **61 series de 4
-- torneos** mezcladas en un desplegable que no dice de cuál es cada una. Con
-- dos torneos por año eso empeora solo.
--
-- ── 🔴 Por qué NO se le agrega `torneo_id` a `jornada` ─────────────────────
--
-- Sería lo más rápido y es la trampa. La jornada ya pertenece a un torneo por
-- `serie → categoria → torneo`: guardar el torneo otra vez abre la puerta a que
-- una jornada diga un torneo y su serie diga otro, y no hay nada que lo impida
-- salvo acordarse. Un dato derivable que se guarda es un dato que se puede
-- contradecir.
--
-- La vista lo deriva en cada consulta, que es donde corresponde. `append` al
-- final, que es lo único que `create or replace` permite.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_calendario_jornadas as
select
  j.id as jornada_id,
  j.numero,
  j.fecha,
  j.estado,
  j.es_playoff,
  j.instancia,
  j.cantidad_esperada,
  j.cantidad_partidos,
  s.id as serie_id,
  s.nombre as serie,
  c.id as categoria_id,
  c.nombre as categoria,
  c.genero,
  (c.nombre || ' ') || s.nombre as serie_completa,
  j.reprograma_a,
  jr.fecha as reprograma_a_fecha,
  (select count(*) from cuota cu where cu.jornada_id = j.id) as cuotas_atadas,
  -- ── Lo nuevo, al final ──────────────────────────────────────────────────
  c.torneo_id,
  t.nombre as torneo,
  t.estado as torneo_estado
from jornada j
  join serie s on s.id = j.serie_id
  join categoria c on c.id = s.categoria_id
  join torneo t on t.id = c.torneo_id
  left join jornada jr on jr.id = j.reprograma_a;
