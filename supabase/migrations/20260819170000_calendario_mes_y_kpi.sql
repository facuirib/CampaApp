-- ═══════════════════════════════════════════════════════════════════════════
-- v_calendario_mes · v_calendario_kpi — los totales que la pantalla no puede sumar
--
-- ⚠️ PROPUESTA · NO APLICADA. Vistas nuevas, carril de Facu.
--
-- ── Por qué existen ────────────────────────────────────────────────────────
--
-- `v_calendario_dia` resuelve la CELDA. Pero la pantalla muestra dos cosas más
-- que son agregados por encima del día, y por la regla 1 no las puede sumar el
-- front:
--
--   · el TOTAL DEL MES que se está mirando, en el encabezado de la matriz;
--   · los KPIs de arriba: cuánto hay comprometido, cuánto está vencido, y
--     cuándo es el próximo vencimiento.
--
-- Dos de esos números sí salían de una fila sola de `v_calendario_dia` —el
-- acumulado del último día es el total, y el primer día futuro es el próximo
-- vencimiento— pero el monto VENCIDO no: hay que sumar sólo los ítems con
-- `arrastrada`, y eso es una suma. Antes que hacerla en el front, va acá.
--
-- ── Por qué el vencido se cuenta sobre los ÍTEMS y no sobre los días ────────
--
-- Un día puede tener 34 vencimientos de los cuales 34 están vencidos, o 6 de
-- los cuales 6 lo están: `v_calendario_dia.vencidos` cuenta ítems, pero su
-- `neto` mezcla vencidos con no vencidos del mismo día. Para el KPI hace falta
-- el monto de SÓLO lo arrastrado, así que las dos vistas leen
-- `v_cashflow_comprometido` directo y no `v_calendario_dia`.
--
-- ── Signo, igual que en todo el módulo ─────────────────────────────────────
--
-- `sale` negativo y `neto = entra + sale`, como en v_calendario_dia y en
-- v_cashflow.salidas. `vencido_monto` es el NETO de lo arrastrado: hoy da
-- positivo porque casi todo lo vencido son cuotas por cobrar, pero puede dar
-- negativo si se acumulan gastos impagos, y eso es información, no un error.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_calendario_mes as
select
  date_trunc('month', fecha_original)::date                       as mes,
  count(*)::int                                                   as items,
  coalesce(sum(monto) filter (where monto > 0), 0)::numeric(16,2) as entra,
  coalesce(sum(monto) filter (where monto < 0), 0)::numeric(16,2) as sale,
  sum(monto)::numeric(16,2)                                       as neto,
  count(*) filter (where arrastrada)::int                         as vencidos,
  count(distinct fecha_original)::int                             as dias_con_algo
from v_cashflow_comprometido
group by date_trunc('month', fecha_original);

comment on view public.v_calendario_mes is
  'Un mes por fila, para el encabezado de la matriz del Calendario de pagos. '
  'Agrupa por fecha_original —la fecha REAL de vencimiento— igual que '
  'v_calendario_dia. `sale` va negativo y neto = entra + sale.';


-- Una fila siempre, también sin vencimientos: es una agregación sin group by.
create or replace view public.v_calendario_kpi as
select
  count(*)::int                                                     as items,
  coalesce(sum(monto), 0)::numeric(16,2)                            as neto,
  coalesce(sum(monto) filter (where monto > 0), 0)::numeric(16,2)   as entra,
  coalesce(sum(monto) filter (where monto < 0), 0)::numeric(16,2)   as sale,

  count(*) filter (where arrastrada)::int                           as vencidos,
  coalesce(sum(monto) filter (where arrastrada), 0)::numeric(16,2)  as vencido_monto,

  -- El próximo vencimiento: el primer día de hoy en adelante. Se resuelve acá y
  -- no en la pantalla porque es un min con condición, o sea un agregado.
  min(fecha_original) filter (where fecha_original >= current_date) as proximo_dia,
  count(*) filter (where fecha_original = (
    select min(fecha_original) from v_cashflow_comprometido
     where fecha_original >= current_date))::int                    as proximo_items,
  coalesce(sum(monto) filter (where fecha_original = (
    select min(fecha_original) from v_cashflow_comprometido
     where fecha_original >= current_date)), 0)::numeric(16,2)      as proximo_monto
from v_cashflow_comprometido;

comment on view public.v_calendario_kpi is
  'Una fila siempre: los totales del Calendario de pagos. `vencido_monto` es '
  'el NETO de lo arrastrado —lo que venció y sigue sin resolverse—, que no se '
  'puede derivar de v_calendario_dia porque ahí el neto del día mezcla '
  'vencidos con no vencidos. `proximo_*` es el primer día de hoy en adelante.';
