-- ============================================================================
-- CAMPA · v_dashboard — los números de la pantalla de inicio, ya calculados
--
-- Una fila por torneo. La pantalla filtra por `activo` y lee UN número por
-- pieza: no suma, no resta, no cuenta. Esa es la razón de que esta vista
-- exista — sin ella el dashboard tendría que sumar `por_vencer + vencido`
-- para el Hero, contar equipos al día recorriendo fichas, y cruzar tres
-- vistas para armar el puente. Todo eso es la regla 1.
--
-- ── Por qué tres bloques laterales y no un join ─────────────────────────────
--
-- Los tres agregados —cuotas, equipos, asientos— cuelgan del mismo torneo pero
-- no tienen nada que ver entre sí. Cruzarlos en un solo `from` multiplicaría
-- cada cuota por cada línea de asiento y TODAS las sumas darían de más, en
-- silencio y proporcionalmente al volumen. Cada bloque agrega por su cuenta y
-- devuelve una fila.
--
-- ── Por qué siempre hay fila ────────────────────────────────────────────────
--
-- Se parte de `torneo` con `left join lateral`, así que un torneo recién
-- creado —sin fichas, sin cuotas, sin asientos— devuelve su fila con ceros y
-- no desaparece. `v_cobranza_kpi` y `v_resultado_producto` hacen lo contrario:
-- con la base en cero devuelven CERO FILAS, y un dashboard que lee una vista
-- vacía no muestra "$0", no muestra nada.
--
-- ── Qué NO está acá ─────────────────────────────────────────────────────────
--
-- El saldo de caja. Es de la empresa, no del torneo: en una fila por torneo se
-- repetiría en cada una y sugeriría que hay una caja por torneo. La pantalla
-- lee `v_saldo_caja_total` aparte. Son dos consultas, no una suma.
-- ============================================================================

create or replace view public.v_dashboard as
select
  t.id     as torneo_id,
  t.nombre as torneo,
  t.activo,

  -- ── Cobranza ──
  coalesce(cob.comprometido, 0)::numeric(16,2) as comprometido,
  coalesce(cob.cobrado, 0)::numeric(16,2)      as cobrado,
  coalesce(cob.por_cobrar, 0)::numeric(16,2)   as por_cobrar,
  coalesce(cob.por_vencer, 0)::numeric(16,2)   as por_vencer,
  coalesce(cob.vencido, 0)::numeric(16,2)      as vencido,

  -- ── Equipos ──
  coalesce(eq.equipos_total, 0)   as equipos_total,
  coalesce(eq.equipos_al_dia, 0)  as equipos_al_dia,
  coalesce(eq.equipos_en_mora, 0) as equipos_en_mora,

  -- ── Resultado ──
  coalesce(res.resultado, 0)::numeric(16,2) as resultado

from torneo t

-- ── Bloque 1 · cobranza, desde cuota ────────────────────────────────────────
--
-- Réplica exacta de la lógica de `v_cobranza_kpi`, incluida la excepción de
-- jornada suspendida: una cuota atada a una jornada suspendida NO está vencida
-- aunque su fecha haya pasado, porque el partido no se jugó. Si esa regla
-- cambia, cambia en los dos lados.
--
-- Los dos casos son complementarios y exhaustivos, así que
-- `por_vencer + vencido = por_cobrar` sale por construcción y no por los
-- datos. Y `por_cobrar = comprometido − cobrado` por la misma razón: es
-- `sum(monto − imputado)`. De ahí que el puente del waterfall cierre siempre.
left join lateral (
  select
    sum(c.monto)                           as comprometido,
    sum(coalesce(i.imputado, 0))           as cobrado,
    sum(c.monto - coalesce(i.imputado, 0)) as por_cobrar,

    sum(case
          when c.vence_at >= current_date
            or (j.id is not null and j.estado = 'suspendida')
          then c.monto - coalesce(i.imputado, 0)
          else 0
        end) as por_vencer,

    sum(case
          when c.vence_at < current_date
           and (j.id is null or j.estado <> 'suspendida')
          then c.monto - coalesce(i.imputado, 0)
          else 0
        end) as vencido

  from cuota c
  join equipo_torneo et on et.id = c.equipo_torneo_id
  left join jornada j   on j.id = c.jornada_id
  left join (
    select cuota_id, sum(monto) as imputado
      from pago_imputacion
     group by cuota_id
  ) i on i.cuota_id = c.id
  where et.torneo_id = t.id
) cob on true

-- ── Bloque 2 · equipos al día ───────────────────────────────────────────────
--
-- "Al día" es no tener NINGUNA cuota vencida e impaga, con el mismo criterio
-- de vencimiento del bloque anterior. Un equipo con saldo pendiente pero
-- todavía no vencido está al día: debe, pero no debe TODAVÍA.
--
-- Va con `exists` y no contando cuotas: alcanza con una para estar en mora, y
-- así el motor corta en la primera que encuentra.
left join lateral (
  select
    count(*)                               as equipos_total,
    count(*) filter (where not mora.tiene)  as equipos_al_dia,
    count(*) filter (where mora.tiene)      as equipos_en_mora
  from equipo_torneo et2
  cross join lateral (
    select exists (
      select 1
        from cuota c2
        left join jornada j2 on j2.id = c2.jornada_id
        left join (
          select cuota_id, sum(monto) as imputado
            from pago_imputacion
           group by cuota_id
        ) i2 on i2.cuota_id = c2.id
       where c2.equipo_torneo_id = et2.id
         and c2.vence_at < current_date
         and (j2.id is null or j2.estado <> 'suspendida')
         and c2.monto - coalesce(i2.imputado, 0) > 0
    ) as tiene
  ) mora
  where et2.torneo_id = t.id
) eq on true

-- ── Bloque 3 · resultado del torneo ─────────────────────────────────────────
--
-- Sale del diario, filtrando por `a.torneo_id = t.id`, y NO de
-- `v_resultado_producto`. Aquella agrupa por año y habría que empatarla por
-- NOMBRE de torneo —un join por string, que se rompe si alguien renombra un
-- torneo— y además un torneo a caballo de dos años daría dos filas. Yendo
-- directo al asiento las dos cosas se resuelven solas.
--
-- NO se filtra `anulado_por`, y es a propósito: ésta es una vista que SUMA.
-- El asiento original y su contraasiento se compensan entre sí (+X y −X dan
-- 0). Filtrar `anulado_por is null` sacaría el original y dejaría huérfano al
-- contraasiento, así que el resultado daría −X en vez de 0. Es la regla 4.
left join lateral (
  select sum(case when cu.tipo = 'ingreso' then l.haber - l.debe else 0 end)
       - sum(case when cu.tipo = 'egreso'  then l.debe  - l.haber else 0 end) as resultado
    from asiento a
    join asiento_linea l on l.asiento_id = a.id
    join cuenta cu       on cu.id = l.cuenta_id
   where a.torneo_id = t.id
     and cu.tipo in ('ingreso', 'egreso')
) res on true;

comment on view v_dashboard is
  'Los números de la pantalla de inicio, una fila por torneo y ya calculados: '
  'la pantalla lee uno por pieza y no suma nada. Siempre devuelve fila, aunque '
  'el torneo no tenga datos. El saldo de caja NO está acá: es de la empresa y '
  'no del torneo, y sale de v_saldo_caja_total.';
