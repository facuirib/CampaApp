-- ═══════════════════════════════════════════════════════════════
-- Gastos · v_gasto_detalle — lista de gastos con estado de pago
-- No existía vista para listar gastos ejecutados (solo v_presupuesto_total,
-- que es presupuesto). Expone cada gasto con categoría (naturaleza+área),
-- concepto (catálogo o libre vía coalesce), anclaje, montos y ESTADO
-- (devengado/pagado según pagado_at). Estado calculado acá (regla 1).
-- Aplicar: pendiente de confirmación de Facu (regla 11) — toca su modelo.
-- ═══════════════════════════════════════════════════════════════

create or replace view public.v_gasto_detalle as
select
  g.id                                       as gasto_id,
  coalesce(cg_concepto.nombre, g.concepto_libre) as concepto,
  (g.concepto_id is null)                    as es_libre,
  cat.nombre                                 as categoria,
  cat.naturaleza,
  cat.area,
  g.torneo_id,
  t.nombre                                   as torneo,
  g.predio_id,
  p.nombre                                   as predio,
  g.jornada_id,
  g.arancel,
  g.cantidad,
  g.total,
  g.devengado_at,
  g.pagado_at,
  g.medio_pago,
  case
    when g.pagado_at is not null then 'pagado'
    else 'devengado'
  end                                        as estado,
  g.asiento_dev_id,
  g.asiento_pag_id
from gasto g
join cat_gasto cat            on cat.id = g.cat_gasto_id
left join concepto_gasto cg_concepto on cg_concepto.id = g.concepto_id
left join torneo t           on t.id = g.torneo_id
left join predio p           on p.id = g.predio_id;

comment on view public.v_gasto_detalle is
  'Lista de gastos con categoría (naturaleza+área), concepto (catálogo o libre), anclaje, montos y estado (devengado/pagado). Para la pantalla de Gastos.';
