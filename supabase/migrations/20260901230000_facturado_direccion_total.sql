-- El acumulado por dirección, en su propia vista.
--
-- `v_facturado_direccion` viene por mes, y la pantalla quiere las dos lecturas:
-- el mes en curso y el acumulado. Juntar los meses en el front sería sumar en
-- la pantalla, que es exactamente lo que la regla 1 prohíbe — y el primer
-- borrador de esta pantalla lo hacía con un `reduce`.
--
-- Una vista de dos líneas es más barata que la excepción a la regla.
create or replace view v_facturado_direccion_total as
select
  punto_venta,
  punto,
  direccion,
  bool_or(punto_desconocido)               as punto_desconocido,
  sum(comprobantes)::bigint                as comprobantes,
  sum(total)::numeric(16,2)                as total
from v_facturado_direccion
group by punto_venta, punto, direccion;

comment on view v_facturado_direccion_total is
  'Facturado por dirección, acumulado. El grano mensual está en v_facturado_direccion.';
