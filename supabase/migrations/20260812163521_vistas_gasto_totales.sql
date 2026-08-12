-- ═══════════════════════════════════════════════════════════════════════
-- Totales de gastos · los KPIs, las tarjetas y los dos gráficos de /gastos
--
-- Existen por la regla 1: sin ellas la pantalla tendría que sumar la columna
-- de la tabla para cada tarjeta, cada KPI y cada barra.
--
-- ── Los anulados NO cuentan ────────────────────────────────────────────
--
-- Las tres filtran `estado <> 'anulado'`. Sin eso el total daría $17.887.000
-- en vez de $15.987.000: el gasto anulado sumaría como si existiera.
--
-- Es lo que la regla 4 permite para una vista que lista OTRA COSA que
-- asientos -acá gastos-: una fila anulada no deja contraparte huérfana, así
-- que filtrarla no descuadra nada. **Pero el gasto anulado SIGUE en
-- v_gasto_detalle**, con su badge: se ve que existió, no cuenta en los
-- totales. Esconderlo sería reescribir la historia; sumarlo, mentir el total.
-- ═══════════════════════════════════════════════════════════════════════


-- ── v_gasto_kpi — el encabezado y el filtro de período ─────────────────
--
-- `grouping sets` da, EN LA MISMA VISTA, la fila del año y la de cada mes.
-- Así la pantalla ELIGE la fila que corresponde al filtro en vez de sumar
-- meses en el cliente. `mes is null` = todo el año.
--
-- Sin esto habría que elegir: o una vista por año -y el filtro por mes suma
-- en el front- o una por mes -y el total anual suma en el front-. Las dos
-- rompen la regla 1.
create or replace view public.v_gasto_kpi as
select
  extract(year  from devengado_at)::int as anio,
  extract(month from devengado_at)::int as mes,
  count(*)                                                                  as gastos,
  coalesce(sum(total), 0)::numeric(16,2)                                    as total,
  coalesce(sum(total) filter (where estado = 'pagado'), 0)::numeric(16,2)    as pagado,
  coalesce(sum(total) filter (where estado = 'devengado'), 0)::numeric(16,2) as adeudado,
  count(*) filter (where estado = 'devengado')                              as gastos_impagos
from v_gasto_detalle
where estado <> 'anulado'
group by grouping sets (
  (extract(year from devengado_at)),
  (extract(year from devengado_at), extract(month from devengado_at)));

comment on view public.v_gasto_kpi is
  'Totales de gastos por anio y por mes en una sola vista, via grouping sets: mes is null es la fila del anio entero. La pantalla elige la fila segun el filtro en vez de sumar. Excluye anulados.';


-- ── v_gasto_naturaleza_mes — las cuatro tarjetas y el gráfico 1 ────────
--
-- Grano año x mes x naturaleza. Alimenta las tarjetas grandes -con su total,
-- lo pagado y lo adeudado- y el gráfico de composición por tipo.
create or replace view public.v_gasto_naturaleza_mes as
select
  extract(year  from devengado_at)::int as anio,
  extract(month from devengado_at)::int as mes,
  naturaleza,
  count(*)                                                                  as gastos,
  coalesce(sum(total), 0)::numeric(16,2)                                    as total,
  coalesce(sum(total) filter (where estado = 'pagado'), 0)::numeric(16,2)    as pagado,
  coalesce(sum(total) filter (where estado = 'devengado'), 0)::numeric(16,2) as adeudado,
  count(*) filter (where estado = 'devengado')                              as gastos_impagos
from v_gasto_detalle
where estado <> 'anulado'
group by 1, 2, 3;

comment on view public.v_gasto_naturaleza_mes is
  'Gastos por naturaleza y mes: total, pagado y adeudado. Alimenta las cuatro tarjetas de /gastos y el grafico por tipo. Excluye anulados.';


-- ── v_gasto_categoria_mes — el gráfico 2 ───────────────────────────────
--
-- Va SEPARADA de la anterior aunque `cat_gasto` ya tenga su naturaleza: con
-- una sola vista al grano categoría, el gráfico por naturaleza tendría que
-- sumar categorías en el front. Dos vistas, dos preguntas.
--
-- Lleva `naturaleza` y `area` para poder pintar cada categoría con el color
-- de su bloque sin una segunda consulta.
create or replace view public.v_gasto_categoria_mes as
select
  extract(year  from devengado_at)::int as anio,
  extract(month from devengado_at)::int as mes,
  categoria,
  naturaleza,
  area,
  count(*)                                                                  as gastos,
  coalesce(sum(total), 0)::numeric(16,2)                                    as total,
  coalesce(sum(total) filter (where estado = 'pagado'), 0)::numeric(16,2)    as pagado,
  coalesce(sum(total) filter (where estado = 'devengado'), 0)::numeric(16,2) as adeudado
from v_gasto_detalle
where estado <> 'anulado'
group by 1, 2, 3, 4, 5;

comment on view public.v_gasto_categoria_mes is
  'Gastos por categoria y mes, con su naturaleza y area para colorear. Alimenta el grafico de categorias de /gastos. Excluye anulados.';
