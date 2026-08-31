-- El bar, acumulado: para la torta del mix de cobro.
--
-- Mismo caso que v_facturado_direccion_total: `v_bar_mes` viene por mes, y
-- juntar los meses en la pantalla sería sumar en el front (regla 1).
create or replace view v_bar_total as
select
  coalesce(sum(ventas), 0)::bigint          as ventas,
  coalesce(sum(facturado), 0)::numeric(16,2) as facturado,
  coalesce(sum(efectivo), 0)::numeric(16,2)  as efectivo,
  coalesce(sum(tarjeta), 0)::numeric(16,2)   as tarjeta,
  coalesce(sum(mercado_pago), 0)::numeric(16,2) as mercado_pago,
  coalesce(sum(costos), 0)::numeric(16,2)    as costos,
  coalesce(sum(margen), 0)::numeric(16,2)    as margen
from v_bar_mes;

comment on view v_bar_total is
  'El bar acumulado: facturado, mix de cobro, costos y margen. El grano mensual está en v_bar_mes.';
