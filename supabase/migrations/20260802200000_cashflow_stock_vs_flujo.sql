-- ============================================================================
-- CAMPA · v_cashflow: separar STOCK de FLUJO, y una fila por semana
--
-- Arregla dos defectos de 20260802133417_modulo_cashflow, en un solo cambio.
--
-- ── 1 · El doble conteo (el que se veía en pantalla) ────────────────────────
--
-- La ventana era:
--
--   (select sum(saldo) from v_saldo_caja)                    -- STOCK
--   + sum(flujo_neto) over (order by semana ...)             -- incluía monto_real
--
-- y `flujo_neto` = monto_real + monto_comprometido + monto_estimado.
--
-- El primer término es un STOCK: el saldo de caja YA contiene todos los
-- movimientos reales. El segundo volvía a sumar `monto_real`, que son esos
-- mismos movimientos. Cada cobro se contaba DOS VECES.
--
-- Con los datos de prueba, /proyeccion mostraba "Saldo actual $16.600.000"
-- cuando la caja real era $3.790.000: inflado en exactamente esa cifra, y
-- arrastrado a todas las semanas siguientes.
--
-- El arreglo separa las dos naturalezas:
--
--   STOCK  = movimientos reales de caja hasta el FIN de esa semana
--   FLUJO  = acumulado de lo que TODAVÍA NO está en el stock,
--            o sea comprometido + estimado. NUNCA monto_real.
--
-- Se toma el stock al fin de CADA semana, no el saldo de hoy fijo, y eso hace
-- que una sola expresión sirva para los tres casos:
--
--   semana pasada   stock = saldo histórico de esa semana · proyectado = 0
--                   → muestra el saldo real de entonces
--   semana en curso stock = caja de hoy · + lo comprometido de esta semana
--   semana futura   stock = caja de hoy · + el acumulado hasta ahí
--
-- Con el saldo de hoy fijo, las semanas pasadas habrían mostrado todas el mismo
-- número —una línea horizontal— y el tramo "real" del gráfico de /proyeccion no
-- diría nada.
--
-- El stock replica la lógica EXACTA de v_saldo_caja —join contra `caja`, filtro
-- por predio para las cajas de predio— más el corte por fecha. Así los dos
-- números son consistentes por construcción y no por coincidencia: si mañana
-- cambia qué cuentas son caja, cambian juntos.
--
-- ── 2 · El empate semana/mes ────────────────────────────────────────────────
--
-- `por_semana` agrupaba por (semana, mes), así que una semana partida entre dos
-- meses producía DOS filas con la misma `semana`. El `order by semana` de la
-- ventana quedaba empatado y el acumulado dependía de un orden arbitrario;
-- además /proyeccion mostraba la semana repetida.
--
-- En el rango del Clausura se parten cuatro semanas —31/08, 28/09, 26/10 y
-- 30/11— y tres ya tienen flujo. Hoy no se manifiesta porque en cada una el
-- flujo cae de un solo lado del límite, pero es cuestión de datos.
--
-- Se agrupa SOLO por semana y el mes se deriva del lunes de esa semana.
--
-- CONVENCIÓN, y conviene tenerla escrita: una semana pertenece al mes en que
-- EMPIEZA. Para la semana del 31/08 al 06/09, sus flujos cuentan como agosto.
-- No es una aproximación defectuosa: es la regla, y es la habitual cuando una
-- vista mensual se construye sobre una semanal. v_cashflow_mensual la hereda.
--
-- ── Qué NO cambia ───────────────────────────────────────────────────────────
--
-- Mismas 10 columnas, mismo orden y mismos tipos, así que `create or replace`
-- alcanza y v_cashflow_mensual (P3) sigue funcionando sin tocarla: solo LEE
-- saldo_proyectado y suma flujos por mes. Sus columnas de flujo (monto_real,
-- entradas, salidas) siguen siendo correctas — ahí sumar SÍ corresponde, porque
-- son flujos y no stocks. Su saldo_proyectado se corrige solo, porque toma el
-- de la última semana del mes.
-- ============================================================================

create or replace view v_cashflow as
with flujo as (
  select fecha, nivel, origen, null::text as detalle, monto from v_cashflow_real
  union all
  select fecha, nivel, origen, detalle, monto from v_cashflow_comprometido
  union all
  select fecha, nivel, origen, detalle, monto from v_cashflow_estimado
),
por_semana as (
  -- Una fila por semana. El mes se deriva después, del lunes de la semana.
  select date_trunc('week', fecha)::date                   as semana,
         sum(monto) filter (where nivel = 'real')          as monto_real,
         sum(monto) filter (where nivel = 'comprometido')  as monto_comprometido,
         sum(monto) filter (where nivel = 'estimado')      as monto_estimado,
         sum(monto)                                        as flujo_neto,
         sum(monto) filter (where monto > 0)               as entradas,
         sum(monto) filter (where monto < 0)               as salidas
  from flujo
  group by 1
)
select s.semana,
       date_trunc('month', s.semana)::date as mes,
       coalesce(s.monto_real, 0)         as monto_real,
       coalesce(s.monto_comprometido, 0) as monto_comprometido,
       coalesce(s.monto_estimado, 0)     as monto_estimado,
       coalesce(s.entradas, 0)           as entradas,
       coalesce(s.salidas, 0)            as salidas,
       s.flujo_neto,

       -- STOCK al cierre de esta semana (misma lógica que v_saldo_caja)
       (select coalesce(sum(l.debe - l.haber), 0)
          from caja cj
          join asiento_linea l on l.cuenta_id = cj.cuenta_id
          join asiento a       on a.id = l.asiento_id
         where cj.activo
           and (cj.predio_id is null or a.predio_id = cj.predio_id)
           and a.fecha <= s.semana + 6)
       -- + FLUJO que todavía no está en el stock. monto_real queda afuera a
       --   propósito: ya está contado arriba.
       + sum(coalesce(s.monto_comprometido, 0) + coalesce(s.monto_estimado, 0))
           over (order by s.semana rows between unbounded preceding and current row)
                                         as saldo_proyectado,

       s.semana >= date_trunc('week', current_date)::date as futura
from por_semana s;

comment on view v_cashflow is
  'Línea de tiempo semanal con los tres niveles y el saldo proyectado. El saldo '
  'es STOCK (caja real al cierre de la semana) + FLUJO acumulado de lo aún no '
  'ocurrido (comprometido + estimado); monto_real NUNCA se acumula, porque ya '
  'está en el stock. Una fila por semana: el mes se deriva del lunes, así que '
  'una semana pertenece al mes en que empieza.';
