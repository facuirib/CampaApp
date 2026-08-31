-- La descripción del activo, en su vista (D3).
--
-- Se agrega al final: `create or replace` no permite otra cosa, y no hace falta
-- otra cosa.
create or replace view v_activo as
select
  a.id as activo_id, a.nombre, a.categoria, a.predio_id, p.codigo as predio,
  a.fecha_alta, a.valor_origen, a.vida_util_meses, a.estado, a.fecha_baja, a.motivo_baja,
  round(a.valor_origen / a.vida_util_meses::numeric, 2) as cuota_mensual,
  ((select count(*) from amortizacion am where am.activo_id = a.id and am.estado = 'confirmada'))::integer as cuotas_confirmadas,
  (a.vida_util_meses - (select count(*) from amortizacion am where am.activo_id = a.id and am.estado = 'confirmada'))::integer as cuotas_restantes,
  ((select coalesce(sum(am.monto), 0) from amortizacion am where am.activo_id = a.id and am.estado = 'confirmada'))::numeric(16,2) as amortizado,
  (a.valor_origen - (select coalesce(sum(am.monto), 0) from amortizacion am where am.activo_id = a.id and am.estado = 'confirmada'))::numeric(16,2) as residual,
  round(100 * (select coalesce(sum(am.monto), 0) from amortizacion am where am.activo_id = a.id and am.estado = 'confirmada') / nullif(a.valor_origen, 0), 2) as avance_pct,
  (exists (select 1 from gasto g join v_gasto_detalle d on d.gasto_id = g.id
            where g.activo_id = a.id and d.estado <> 'anulado')) as compra_registrada,
  (select g.id from gasto g join v_gasto_detalle d on d.gasto_id = g.id
    where g.activo_id = a.id and d.estado <> 'anulado'
    order by g.devengado_at, g.id limit 1) as gasto_id,
  a.descripcion
from activo a
left join predio p on p.id = a.predio_id;
