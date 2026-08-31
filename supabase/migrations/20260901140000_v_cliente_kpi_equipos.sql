-- ─────────────────────────────────────────────────────────────────────────────
-- El KPI fiscal, separado por tipo
--
-- Commit 2 de A1: al partir la lista en /equipos y /sponsors, el número
-- «X de 307 pueden facturarse» dejó de tener a quién describir — mezcla dos
-- pantallas que ya no son la misma.
--
-- Se agregan las tres columnas de equipos AL FINAL (`create or replace` sólo
-- permite eso) en vez de cambiarle la forma a la vista: las columnas viejas
-- siguen sirviendo el total, por si alguna pantalla lo quiere.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_cliente_kpi as
select
  count(*)                                              as total,
  count(*) filter (where facturable)                    as facturables,
  count(*) filter (where estado_fiscal = 'sin_datos')   as sin_datos,
  count(*) filter (where estado_fiscal = 'incompleto')  as incompletos,
  count(*) filter (where tipo = 'equipo')               as equipos,
  count(*) filter (where tipo = 'sponsor')              as sponsors,
  count(*) filter (where tipo = 'equipo' and facturable)                   as equipos_facturables,
  count(*) filter (where tipo = 'equipo' and estado_fiscal = 'sin_datos')  as equipos_sin_datos,
  count(*) filter (where tipo = 'equipo' and estado_fiscal = 'incompleto') as equipos_incompletos
from v_cliente;
