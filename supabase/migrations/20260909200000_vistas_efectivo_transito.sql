-- ─────────────────────────────────────────────────────────────────────────────
-- Las vistas del efectivo en tránsito — el circuito gana pantalla
--
-- El circuito existía entero en funciones (recibir → liquidar · gasto pagado
-- con tránsito → reponer) y no tenía NINGUNA vista: la pantalla que lo muestre
-- no podía cumplir la regla 1. Tres vistas, una por pregunta:
--
--   v_transito_saldo   cuánta plata está EN TRÁNSITO ahora
--   v_transito_pago    qué cobros recibidos en tránsito faltan liquidar
--   v_transito_gasto   qué gastos pagados con tránsito faltan reponer
--
-- ── El ancla es la CUENTA, no una tabla de estados ─────────────────────────
--
-- No hay tabla «transito»: el estado vive en el diario. Un pago está «en
-- tránsito» si su asiento debitó EFECTIVO_EN_TRANSITO, y está «liquidado» si
-- existe un asiento vivo con origen_id = pago que la acredita (la liquidación
-- es el único asiento del circuito que hace eso sobre un pago). Lo mismo del
-- lado gasto: la reposición es el único asiento que DEBITA la cuenta con
-- origen_id = gasto. Derivarlo del diario en vez de duplicar estado en una
-- tabla es la fuente única contable del proyecto.
--
-- ── Regla 4 ────────────────────────────────────────────────────────────────
--
-- v_transito_saldo SUMA y no filtra anulados: el original y su contraasiento
-- se compensan solos. Las listas sí exigen asiento vivo (anulado_por is null)
-- en el ancla del evento: un cobro en tránsito ANULADO no es un pendiente — y
-- su contraasiento tampoco lo revive, porque el ancla pide el par exacto.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_transito_saldo as
select
  coalesce(sum(l.debe - l.haber), 0)::numeric(16,2) as saldo
from asiento_linea l
join cuenta c on c.id = l.cuenta_id
where c.codigo = 'EFECTIVO_EN_TRANSITO';

create or replace view v_transito_pago as
select
  p.id as pago_id,
  p.fecha,
  t.nombre as equipo,
  p.monto,
  exists (
    select 1
      from asiento a2
      join asiento_linea l2 on l2.asiento_id = a2.id
      join cuenta c2 on c2.id = l2.cuenta_id and c2.codigo = 'EFECTIVO_EN_TRANSITO'
     where a2.origen_id = p.id
       and a2.anulado_por is null
       and l2.haber > 0
  ) as liquidado
from pago p
join tercero t on t.id = p.tercero_id
join asiento a on a.id = p.asiento_id and a.anulado_por is null
where exists (
  select 1
    from asiento_linea l
    join cuenta c on c.id = l.cuenta_id and c.codigo = 'EFECTIVO_EN_TRANSITO'
   where l.asiento_id = a.id
     and l.debe > 0
);

create or replace view v_transito_gasto as
select
  g.id as gasto_id,
  g.devengado_at,
  g.pagado_at,
  coalesce(g.concepto_libre, cg.nombre) as detalle,
  g.total,
  exists (
    select 1
      from asiento a2
      join asiento_linea l2 on l2.asiento_id = a2.id
      join cuenta c2 on c2.id = l2.cuenta_id and c2.codigo = 'EFECTIVO_EN_TRANSITO'
     where a2.origen_id = g.id
       and a2.anulado_por is null
       and l2.debe > 0
  ) as repuesto
from gasto g
join cat_gasto cg on cg.id = g.cat_gasto_id
where g.medio_pago = 'efectivo_transito';

comment on view v_transito_saldo is
  'Saldo de EFECTIVO_EN_TRANSITO, del diario. Suma sin filtrar anulados (regla 4).';
comment on view v_transito_pago is
  'Cobros recibidos en tránsito, con su marca de liquidado (asiento vivo que acredita la cuenta con origen_id = pago).';
comment on view v_transito_gasto is
  'Gastos pagados con efectivo_transito, con su marca de repuesto (asiento vivo que debita la cuenta con origen_id = gasto).';
