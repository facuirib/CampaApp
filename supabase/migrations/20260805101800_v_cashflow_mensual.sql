-- ═══════════════════════════════════════════════════════════════
-- P3 · v_cashflow_mensual — proyección de caja agregada por mes
--
-- Se construye SOBRE v_cashflow (que ya calcula el saldo acumulado
-- por semana). Regla de agregación por mes:
--   • flujos → SE SUMAN
--   • saldo_proyectado → saldo de la ÚLTIMA semana del mes
--   • futura → el mes es futuro si su última semana es futura
--
-- Aplicar: pendiente de confirmación de Facu (regla 11).
-- ═══════════════════════════════════════════════════════════════

create or replace view public.v_cashflow_mensual as
with flujos_mes as (
  select
    mes,
    sum(monto_real)         as monto_real,
    sum(monto_comprometido) as monto_comprometido,
    sum(monto_estimado)     as monto_estimado,
    sum(entradas)           as entradas,
    sum(salidas)            as salidas,
    sum(flujo_neto)         as flujo_neto
  from v_cashflow
  where mes is not null
  group by mes
),
saldo_fin_mes as (
  select distinct on (mes)
    mes,
    saldo_proyectado as saldo_fin_mes,
    futura
  from v_cashflow
  where mes is not null
  order by mes, semana desc
)
select
  f.mes,
  f.monto_real,
  f.monto_comprometido,
  f.monto_estimado,
  f.entradas,
  f.salidas,
  f.flujo_neto,
  s.saldo_fin_mes as saldo_proyectado,
  s.futura
from flujos_mes f
join saldo_fin_mes s on s.mes = f.mes;

comment on view public.v_cashflow_mensual is
  'Proyección de caja por mes (P3). Flujos sumados, saldo_proyectado = saldo de la última semana del mes. Deriva de v_cashflow.';
