-- ═══════════════════════════════════════════════════════════════════════════
-- P&L mensual a nivel EMPRESA · las vistas de /resultados
--
-- Negocio unificado: el resultado no se parte por torneo, predio ni categoría
-- (arquitectura.md §1.d). Por eso ninguna tiene `torneo_id`, y por eso
-- `v_resultado_producto` y `v_comparador_torneos` —que sí partían— se dropean
-- en `20260812160632`, junto con la pantalla que las usaba.
--
-- Acá se cierra el 3.4 del reordenamiento del plan de cuentas: las cuentas de
-- tipo `financiero` ENTRAN al resultado. `FIN_DIF_CAMBIO` tenía $244.500 que
-- no aparecían en ninguna pantalla.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── v_pl_mensual — la matriz ───────────────────────────────────────────────
--
-- Los 12 MESES SE GENERAN, no salen de `periodo`: sólo existen los períodos
-- que tuvieron movimiento, así que la matriz tendría columnas salteadas. Un
-- mes sin movimiento es información —el negocio estuvo quieto—, no una fila
-- ausente.
--
-- El AÑO sale de `periodo.anio` y no de `ejercicio`: hay un solo ejercicio
-- cargado y no se crean más hasta que el estudio lo pida, así que por ahí el
-- selector mostraría siempre lo mismo.
--
-- El SIGNO se resuelve una vez, acá: `debe - haber` para egreso, `haber -
-- debe` para ingreso y financiero. Los financieros usan la fórmula del ingreso
-- porque en una cuenta de resultado el haber es ganancia; una diferencia de
-- cambio desfavorable va al debe y resta sola, sin condicional.
--
-- NO filtra anulados (regla 4): el original y su contraasiento se compensan.
create or replace view public.v_pl_mensual as
with anios as (select distinct anio from periodo),
     meses as (select generate_series(1, 12) as mes),
     cuentas as (
       select id, codigo, nombre, tipo from cuenta
        where tipo in ('ingreso', 'egreso', 'financiero')),
     grilla as (
       select a.anio, m.mes, c.id as cuenta_id, c.codigo, c.nombre, c.tipo
         from anios a cross join meses m cross join cuentas c),
     movs as (
       select p.anio, p.mes, l.cuenta_id,
              sum(case when c.tipo = 'egreso' then l.debe - l.haber
                                              else l.haber - l.debe end) as monto
         from asiento_linea l
         join cuenta c  on c.id = l.cuenta_id
                       and c.tipo in ('ingreso', 'egreso', 'financiero')
         join asiento a on a.id = l.asiento_id
         join periodo p on p.id = a.periodo_id
        group by p.anio, p.mes, l.cuenta_id)
select g.anio, g.mes, g.cuenta_id, g.codigo, g.nombre, g.tipo,
       coalesce(mv.monto, 0)::numeric(16,2) as monto
  from grilla g
  left join movs mv
         on mv.anio = g.anio and mv.mes = g.mes and mv.cuenta_id = g.cuenta_id;

comment on view public.v_pl_mensual is
  'Matriz del P&L: una fila por anio, mes y cuenta de resultado, con los 12 meses generados y ceros donde no hubo movimiento. Nivel empresa, sin torneo. Incluye las cuentas financiero. El signo ya viene resuelto: positivo suma al resultado en los tres tipos.';


-- ── v_pl_mensual_item — el expandible, sólo egresos ────────────────────────
--
-- Cuatro cadenas para llegar del asiento a su ítem, por `coalesce` en orden:
--
--   A · gasto_devengo → origen_id → gasto → cat_gasto
--   B · ajuste        → origen_id → asiento ANULADO → SU origen_id → gasto
--   C · socio         → asiento_linea.tercero_id → tercero
--   D · nada          → 'Sin categoría'
--
-- **La B es de DOS SALTOS y es la que no se ve venir.** El `origen_id` de un
-- contraasiento apunta al asiento que anula, no al gasto. Sin el rebote, la
-- anulación caería en 'Sin categoría' y el desglose mentiría: mostraría el
-- gasto anulado vigente en su categoría, y un negativo flotando al lado sin
-- nada que lo explique.
--
-- La vía NO forma parte de la clave, a propósito: si estuviera, el original y
-- su contraasiento serían dos filas distintas y no se compensarían.
--
-- Sólo egresos: ingresos quedó plano por decisión — con percibido puro no se
-- distinguen sub-conceptos de ingreso.
create or replace view public.v_pl_mensual_item as
with lineas as (
  select p.anio, p.mes,
         c.id as cuenta_id, c.codigo, c.nombre as cuenta,
         (l.debe - l.haber) as monto,
         coalesce(cg_dev.nombre, cg_anu.nombre, t.nombre, 'Sin categoría') as item
    from asiento_linea l
    join cuenta c  on c.id = l.cuenta_id and c.tipo = 'egreso'
    join asiento a on a.id = l.asiento_id
    join periodo p on p.id = a.periodo_id
    left join gasto     g_dev  on g_dev.id  = a.origen_id and a.origen = 'gasto_devengo'
    left join cat_gasto cg_dev on cg_dev.id = g_dev.cat_gasto_id
    left join asiento   a_orig on a_orig.id = a.origen_id and a.origen = 'ajuste'
    left join gasto     g_anu  on g_anu.id  = a_orig.origen_id
    left join cat_gasto cg_anu on cg_anu.id = g_anu.cat_gasto_id
    left join tercero   t      on t.id = l.tercero_id and t.tipo = 'socio'),
pares as (select distinct anio, cuenta_id, codigo, cuenta, item from lineas),
meses as (select generate_series(1, 12) as mes)
select pr.anio, m.mes, pr.cuenta_id, pr.codigo, pr.cuenta, pr.item,
       coalesce(sum(li.monto), 0)::numeric(16,2) as monto
  from pares pr
  cross join meses m
  left join lineas li
         on li.anio = pr.anio and li.mes = m.mes
        and li.cuenta_id = pr.cuenta_id and li.item = pr.item
 group by pr.anio, m.mes, pr.cuenta_id, pr.codigo, pr.cuenta, pr.item;

comment on view public.v_pl_mensual_item is
  'El desglose de cada cuenta de EGRESO por item, mes a mes. El item sale de cat_gasto para los gastos, del tercero para los sueldos de socios, y del gasto original -dos saltos- para los contraasientos, para que la anulacion netee dentro de su propio item. Suma exactamente lo que v_pl_mensual dice de cada cuenta.';
