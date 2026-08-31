-- ─────────────────────────────────────────────────────────────────────────────
-- El P&L desglosa también los ingresos
--
-- Ola 4, J2.
--
-- `v_pl_mensual_item` abría los egresos por categoría de gasto, y los ingresos
-- no se abrían: la fila «Ingresos por partidos» era un número y nada más.
-- El join decía `c.tipo = 'egreso'`, así que las cuentas de ingreso ni entraban.
--
-- ── Qué abre cada ingreso, y por qué ese corte y no otro ───────────────────
--
--   ING_PARTIDOS · ING_INSCRIPCIONES → MEDIO DE PAGO
--     El asiento del cobro tiene el pago en `origen_id`, y el pago sabe cómo
--     entró la plata. Es el corte que importa: cuánto del torneo entra por
--     transferencia y cuánto en efectivo. Verificado que resuelve 28 de 28.
--
--   ING_BAR → PREDIO
--     El bar es una unidad por predio: la pregunta es cuál rinde.
--
--   ING_SPONSORS → SPONSOR
--     Son pocos y grandes; el nombre es la información.
--
-- Ninguno inventa una categoría: los tres cortes salen de columnas que la línea
-- o su asiento ya tenían.
--
-- ── 🔴 El signo ────────────────────────────────────────────────────────────
--
-- La vista venía calculando `debe - haber`, que es correcto para un egreso. Un
-- ingreso es al revés, y `v_pl_mensual` ya lo resuelve con un case por tipo.
-- Acá se copia ESE case, palabra por palabra: si los dos difirieran, el
-- desglose mostraría los ingresos en negativo y el total en positivo, que es la
-- clase de contradicción que hace desconfiar de toda la pantalla.
--
-- ── Desglosar NO cambia ningún total ───────────────────────────────────────
--
-- `v_pl_mensual` y `v_pl_mensual_total` no se tocan. Esta vista es el detalle
-- que se despliega debajo de una fila, y su suma por cuenta tiene que dar
-- exactamente el monto de esa cuenta. Se verifica con un contraste, no se
-- supone.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_pl_mensual_item as
with lineas as (
  select
    p.anio,
    p.mes,
    c.id     as cuenta_id,
    c.codigo,
    c.nombre as cuenta,
    -- El MISMO case que v_pl_mensual. No es una variante: es una copia.
    case when c.tipo = 'egreso' then l.debe - l.haber else l.haber - l.debe end as monto,
    coalesce(
      -- Egresos: la categoría del gasto, o la del gasto anulado.
      cg_dev.nombre, cg_anu.nombre,
      -- Sueldos de socios: el socio.
      soc.nombre,
      -- Amortización: el activo que se desgasta.
      act.nombre,
      -- Ingresos de equipo: cómo entró la plata.
      case pg.medio_pago
        when 'efectivo' then 'Efectivo'
        when 'transferencia' then 'Transferencia'
        when 'cheque' then 'Cheque'
        else null
      end,
      -- Bar: en qué predio.
      pr.nombre,
      -- Sponsors: cuál.
      spo.nombre,
      'Sin categoría'
    ) as item
  from asiento_linea l
    join cuenta c on c.id = l.cuenta_id and c.tipo in ('ingreso', 'egreso')
    join asiento a on a.id = l.asiento_id
    join periodo p on p.id = a.periodo_id
    left join gasto g_dev on g_dev.id = a.origen_id and a.origen = 'gasto_devengo'
    left join cat_gasto cg_dev on cg_dev.id = g_dev.cat_gasto_id
    left join asiento a_orig on a_orig.id = a.origen_id and a.origen = 'ajuste'
    left join gasto g_anu on g_anu.id = a_orig.origen_id
    left join cat_gasto cg_anu on cg_anu.id = g_anu.cat_gasto_id
    left join tercero soc on soc.id = l.tercero_id and soc.tipo = 'socio'
    left join activo act on act.id = a.origen_id and a.origen = 'amortizacion'
    left join pago pg on pg.id = a.origen_id and a.origen = 'pago_equipo'
    left join predio pr on pr.id = a.predio_id and a.origen = 'bar'
    left join tercero spo on spo.id = l.tercero_id and spo.tipo = 'sponsor'
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
