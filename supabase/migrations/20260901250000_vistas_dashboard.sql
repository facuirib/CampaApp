-- ─────────────────────────────────────────────────────────────────────────────
-- Los agregados que el dashboard necesita
--
-- Hito 4. Tres vistas, y las tres existen por la misma razón: el grano que hay
-- es más fino que el que el gráfico dibuja, y juntarlo en la pantalla sería
-- sumar en el front (regla 1).
--
-- Ninguna inventa un número: todas agrupan una vista que ya se usa en su
-- pantalla de detalle, así que el dashboard y el detalle no pueden discrepar.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · Los equipos por etapa de cobranza ──────────────────────────────────
--
-- Sale de `v_cobranza_momento`, que es LA MISMA fuente de las tres colas de
-- /cobranza. Importa que sea ésa y no `v_dashboard`: aunque hoy los números
-- coincidan —3 al día / 25 en mora contra 3 por_vencer / 25 firme—, son dos
-- preguntas distintas. `v_dashboard` cuenta equipos con deuda vencida;
-- `v_cobranza_momento` asigna a cada equipo UNA etapa, la más severa, que es
-- lo que decide en qué cola aparece.
--
-- Mezclarlas daría un gráfico que dice «estado» y un KPI que dice otra cosa,
-- con los mismos números por casualidad — y el día que dejen de coincidir,
-- nadie sabría cuál mirar.
create or replace view v_cobranza_etapa as
select
  torneo_id,
  etapa,
  count(*)                                        as equipos,
  coalesce(sum(total_adeudado), 0)::numeric(16,2) as adeudado,
  coalesce(sum(total_vencido), 0)::numeric(16,2)  as vencido,
  coalesce(sum(total_por_vencer), 0)::numeric(16,2) as por_vencer
from v_cobranza_momento
group by torneo_id, etapa;

comment on view v_cobranza_etapa is
  'Equipos y deuda por etapa de cobranza y torneo. Misma fuente que las colas de /cobranza (v_cobranza_momento): una etapa por equipo, la más severa.';


-- ── 2 · El P&L por cuenta y año ────────────────────────────────────────────
--
-- `v_pl_mensual` viene por mes. La torta de composición mira el AÑO, y juntar
-- los doce meses en la pantalla sería el `reduce` de siempre.
create or replace view v_pl_anual_cuenta as
select
  anio,
  cuenta_id,
  codigo,
  nombre,
  tipo,
  coalesce(sum(monto), 0)::numeric(16,2) as monto
from v_pl_mensual
group by anio, cuenta_id, codigo, nombre, tipo;

comment on view v_pl_anual_cuenta is
  'El P&L agrupado por cuenta y año. El grano mensual está en v_pl_mensual.';


-- ── 3 · Cómo se cobró, por año ─────────────────────────────────────────────
create or replace view v_cobro_medio_anio as
select
  anio,
  medio_pago,
  sum(cobros)::bigint            as cobros,
  sum(total)::numeric(16,2)      as total
from v_cobro_medio_mes
group by anio, medio_pago;

comment on view v_cobro_medio_anio is
  'Cobros por medio de pago y año. El grano mensual está en v_cobro_medio_mes.';
