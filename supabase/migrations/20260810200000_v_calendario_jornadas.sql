-- v_calendario_jornadas — lectura del calendario por serie
-- Una fila por jornada (liga+playoff) con serie/categoria/genero a nombre.
-- cuotas_atadas: cuántas cuotas de liga dependen de cada jornada (impacto de mover/suspender).
-- Lista todas (incl. suspendidas/reprogramadas) con su estado. Regla 4: vista que lista.

create or replace view public.v_calendario_jornadas as
select
  j.id as jornada_id, j.numero, j.fecha, j.estado, j.es_playoff, j.instancia,
  j.cantidad_esperada, j.cantidad_partidos,
  s.id as serie_id, s.nombre as serie,
  c.id as categoria_id, c.nombre as categoria, c.genero,
  (c.nombre || ' ' || s.nombre) as serie_completa,
  j.reprograma_a, jr.fecha as reprograma_a_fecha,
  (select count(*) from cuota cu where cu.jornada_id = j.id) as cuotas_atadas
from jornada j
join serie s on s.id = j.serie_id
join categoria c on c.id = s.categoria_id
left join jornada jr on jr.id = j.reprograma_a;

comment on view public.v_calendario_jornadas is 'Lectura del calendario por serie con cuotas_atadas (impacto de mover/suspender). Lista todas con su estado.';