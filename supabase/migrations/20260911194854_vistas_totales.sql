-- ─────────────────────────────────────────────────────────────────────────────
-- Vistas para totales que el front sumaba en el cliente (regla 1)
--
-- Del diagnóstico del 11/09. Cuatro agregados de LECTURA, todos aditivos:
--
--   v_cobranza_etapa_total   el KPI de monto por etapa de aviso, todos los
--                            torneos (la per-torneo ya existía)
--   v_gasto_naturaleza_anio  el año entero por naturaleza (la _mes existía)
--   v_gasto_categoria_anio   ídem por categoría
--   v_pl_anual_total         ingresos/egresos del año en una fila por tipo
--                            (el centro de las tortas del inicio)
--
-- Ninguna filtra `anulado_por`: heredan de sus vistas base, que ya siguen la
-- regla 4 (el original y su contraasiento se compensan solos).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_cobranza_etapa_total as
select etapa,
       count(*)                                              as equipos,
       coalesce(sum(total_adeudado), 0)::numeric(16,2)       as adeudado,
       coalesce(sum(total_vencido), 0)::numeric(16,2)        as vencido,
       coalesce(sum(total_por_vencer), 0)::numeric(16,2)     as por_vencer
  from v_cobranza_momento
 group by etapa;

comment on view v_cobranza_etapa_total is
  'v_cobranza_etapa sin el corte por torneo: las colas de aviso cuando la '
  'pantalla no filtra. El KPI de monto por etapa sale de acá, no de un reduce.';

create or replace view v_gasto_naturaleza_anio as
select anio, naturaleza,
       sum(gastos)::int                       as gastos,
       sum(total)::numeric(16,2)              as total,
       sum(pagado)::numeric(16,2)             as pagado,
       sum(adeudado)::numeric(16,2)           as adeudado,
       sum(gastos_impagos)::int               as gastos_impagos
  from v_gasto_naturaleza_mes
 group by anio, naturaleza;

comment on view v_gasto_naturaleza_anio is
  'El año entero de v_gasto_naturaleza_mes. Las barras de /gastos salen de '
  'acá cuando no hay filtro de mes.';

create or replace view v_gasto_categoria_anio as
select anio, cat_gasto_id, categoria, naturaleza, area,
       sum(gastos)::int              as gastos,
       sum(total)::numeric(16,2)     as total,
       sum(pagado)::numeric(16,2)    as pagado,
       sum(adeudado)::numeric(16,2)  as adeudado
  from v_gasto_categoria_mes
 group by anio, cat_gasto_id, categoria, naturaleza, area;

comment on view v_gasto_categoria_anio is
  'El año entero de v_gasto_categoria_mes (suma sobre meses y torneos). '
  'La torta por categoría de /gastos sale de acá cuando no hay filtro de mes.';

create or replace view v_pl_anual_total as
select anio, tipo,
       sum(monto)::numeric(16,2) as total
  from v_pl_anual_cuenta
 group by anio, tipo;

comment on view v_pl_anual_total is
  'Los totales del año por tipo (ingreso/egreso), sumados de v_pl_anual_cuenta. '
  'El centro de las tortas del inicio sale de acá, no del componente.';
