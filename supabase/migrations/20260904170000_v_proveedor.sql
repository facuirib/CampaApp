-- ─────────────────────────────────────────────────────────────────────────────
-- Los proveedores, con lo que se les compró
--
-- Nivel C, tanda 1. Un proveedor no se mira solo: lo que interesa es cuánto se
-- le compró, cuánto se le pagó y cuánto se le debe. Los tres salen del gasto,
-- que es donde vive la relación (`gasto.proveedor_id`).
--
-- `pagado` y `adeudado` se derivan del estado del gasto —la misma definición
-- que usa /gastos— y no de una segunda cuenta: si el gasto está pagado, se le
-- pagó.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_proveedor as
select
  p.id as proveedor_id,
  p.nombre,
  p.razon_social,
  p.cuit,
  p.domicilio,
  p.email,
  p.contacto,
  p.activo,
  c.descripcion as condicion_iva,
  coalesce(g.compras, 0)::int              as compras,
  coalesce(g.total, 0)::numeric(16,2)      as total,
  coalesce(g.pagado, 0)::numeric(16,2)     as pagado,
  coalesce(g.adeudado, 0)::numeric(16,2)   as adeudado,
  g.ultima_compra,
  coalesce(a.activos, 0)::int              as activos
from proveedor p
  left join condicion_iva_receptor c on c.id = p.condicion_iva_id
  -- `v_gasto_detalle` no expone `proveedor_id`, así que se cruza con `gasto`
  -- para traerlo. Se cruza en vez de agregarle la columna a la vista compartida:
  -- v_gasto_detalle alimenta el cashflow, los activos y tres agregados más, y no
  -- es lugar para tocar de paso.
  left join (
    select
      gg.proveedor_id,
      count(*)                                                          as compras,
      coalesce(sum(d.total), 0)                                         as total,
      coalesce(sum(d.total) filter (where d.estado = 'pagado'), 0)      as pagado,
      coalesce(sum(d.total) filter (where d.estado = 'devengado'), 0)   as adeudado,
      max(d.devengado_at)                                               as ultima_compra
    from v_gasto_detalle d
    join gasto gg on gg.id = d.gasto_id
    where gg.proveedor_id is not null and d.estado <> 'anulado'
    group by gg.proveedor_id
  ) g on g.proveedor_id = p.id
  left join (
    select gg.proveedor_id, count(distinct gg.activo_id) as activos
    from gasto gg
    where gg.proveedor_id is not null and gg.activo_id is not null
    group by gg.proveedor_id
  ) a on a.proveedor_id = p.id;

comment on view v_proveedor is
  'Los proveedores con lo que se les compró: gastos, total, pagado, adeudado y cuántos activos salieron de ellos.';
