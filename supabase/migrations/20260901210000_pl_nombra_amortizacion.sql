-- ─────────────────────────────────────────────────────────────────────────────
-- El P&L nombra la amortización por su activo
--
-- D2, commit 4. Al asentar la primera amortización apareció en el P&L como
-- «GAS_AMORT · Sin categoría»: la vista sabe ponerle nombre a los ítems que
-- vienen de un gasto o de un sueldo de socio, y no conocía este origen.
--
-- «Sin categoría» en una línea de resultado es de las cosas que se miran una
-- vez, no se entienden, y se dejan de mirar. Y con varios activos serían todas
-- la misma línea, sumadas: no se podría saber qué se está amortizando.
--
-- `asentar_amortizacion` ya guarda el activo en `origen_id`, así que el nombre
-- está a un join de distancia.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_pl_mensual_item as
with lineas as (
  select
    p.anio,
    p.mes,
    c.id       as cuenta_id,
    c.codigo,
    c.nombre   as cuenta,
    l.debe - l.haber as monto,
    coalesce(cg_dev.nombre, cg_anu.nombre, t.nombre, act.nombre, 'Sin categoría') as item
  from asiento_linea l
    join cuenta c on c.id = l.cuenta_id and c.tipo = 'egreso'
    join asiento a on a.id = l.asiento_id
    join periodo p on p.id = a.periodo_id
    left join gasto g_dev on g_dev.id = a.origen_id and a.origen = 'gasto_devengo'
    left join cat_gasto cg_dev on cg_dev.id = g_dev.cat_gasto_id
    left join asiento a_orig on a_orig.id = a.origen_id and a.origen = 'ajuste'
    left join gasto g_anu on g_anu.id = a_orig.origen_id
    left join cat_gasto cg_anu on cg_anu.id = g_anu.cat_gasto_id
    left join tercero t on t.id = l.tercero_id and t.tipo = 'socio'
    -- El activo que se amortiza. `asentar_amortizacion` lo deja en origen_id.
    left join activo act on act.id = a.origen_id and a.origen = 'amortizacion'
),
pares as (
  select distinct anio, cuenta_id, codigo, cuenta, item from lineas
),
meses as (
  select generate_series(1, 12) as mes
)
select
  pr.anio, m.mes, pr.cuenta_id, pr.codigo, pr.cuenta, pr.item,
  coalesce(sum(li.monto), 0)::numeric(16,2) as monto
from pares pr
  cross join meses m
  left join lineas li
    on li.anio = pr.anio and li.mes = m.mes
   and li.cuenta_id = pr.cuenta_id and li.item = pr.item
group by pr.anio, m.mes, pr.cuenta_id, pr.codigo, pr.cuenta, pr.item;
