-- ═══════════════════════════════════════════════════════════════
-- v_cashflow_comprometido · 5ta rama: gastos devengados e impagos
--
-- PROPUESTA, NO APLICAR sin revisión — con OK de Facu (coordinacion.md,
-- 16/08: "Adelante. Tu diseño coincide con lo que se decidió... Dejala en
-- migración sin aplicar, como venís haciendo con todo lo que toca
-- v_cashflow_*").
--
-- Los gastos devengados sin pagar (pagado_at is null) son plata pactada
-- con monto cierto — igual que una cuota vencida e impaga. Se agregan
-- como 5ta rama, aditiva, sin tocar las 4 que ya están.
--
-- Calca el patrón exacto de las otras ramas: GREATEST(fecha, CURRENT_DATE)
-- arrastra lo vencido a hoy, fecha_original conserva la fecha real,
-- arrastrada marca que se movió. Acá con devengado_at en vez de vence_at
-- (gasto no tiene columna de vencimiento — devengado_at es la fecha
-- pactada de origen, mismo rol).
--
-- Monto negativo (egreso), mismo criterio que compromiso 'pagar' y
-- cheque 'emitido'.
--
-- ── Corregido antes de aplicar (Facu, 19/08) ──────────────────────────────
--
-- Faltaba excluir los gastos ANULADOS. `anular_gasto` limpia `pagado_at`, así
-- que un gasto anulado cumple `pagado_at is null` y entraba a la proyección:
-- con los datos de hoy sobreestimaba los egresos comprometidos en $3.350.000
-- (proyectaba 9 gastos por $15.544.767 en vez de 7 por $12.194.767).
--
-- El filtro sale de `v_gasto_detalle.estado`, que ya deriva la anulación desde
-- `asiento.anulado_por` — la fuente de verdad, sin reimplementarla. Es el mismo
-- patrón que usa `v_activo` para no contar la compra de un activo cuyo gasto
-- fue anulado. El join es 1:1 (una fila por gasto), así que no multiplica.
--
-- Se corrige el archivo EN EL LUGAR y no con una migración aparte: todavía no
-- se había aplicado, así que la vista nunca llega a existir con el error y el
-- historial no queda con un bug seguido de su parche.
-- ═══════════════════════════════════════════════════════════════

create or replace view public.v_cashflow_comprometido as
select GREATEST(ec.vence_at, CURRENT_DATE) as fecha,
    ec.vence_at as fecha_original,
    'comprometido'::text as nivel,
    'cuota_equipo'::text as origen,
    t.nombre as detalle,
    ec.saldo as monto,
    ec.vence_at < CURRENT_DATE as arrastrada
   from v_estado_cuota ec
     join equipo_torneo et on et.id = ec.equipo_torneo_id
     join tercero t on t.id = et.tercero_id
  where ec.saldo > 0::numeric and ec.estado <> 'suspendida'::text
union all
 select q.fecha_cobro as fecha,
    q.fecha_cobro as fecha_original,
    'comprometido'::text as nivel,
    'cuota_sponsor'::text as origen,
    q.sponsor as detalle,
    q.monto,
    false as arrastrada
   from v_cuotas_sponsor_futuras q
union all
 select GREATEST(cm.vence_at, CURRENT_DATE) as fecha,
    cm.vence_at as fecha_original,
    'comprometido'::text as nivel,
    'compromiso_'::text || cm.tipo as origen,
    COALESCE(t.nombre, cm.descripcion) as detalle,
        case
            when cm.sentido = 'pagar'::text then - cm.monto
            else cm.monto
        end as monto,
    cm.vence_at < CURRENT_DATE as arrastrada
   from compromiso cm
     left join tercero t on t.id = cm.tercero_id
  where cm.estado = 'pendiente'::text
union all
 select GREATEST(ch.fecha_cobro, CURRENT_DATE) as fecha,
    ch.fecha_cobro as fecha_original,
    'comprometido'::text as nivel,
    'cheque_'::text || ch.sentido as origen,
    COALESCE(t.nombre, 'Cheque '::text || ch.numero) as detalle,
        case
            when ch.sentido = 'emitido'::text then - ch.monto
            else ch.monto
        end as monto,
    ch.fecha_cobro < CURRENT_DATE as arrastrada
   from cheque ch
     left join tercero t on t.id = ch.tercero_id
  where ch.estado = 'pendiente'::text
union all
 select GREATEST(g.devengado_at, CURRENT_DATE) as fecha,
    g.devengado_at as fecha_original,
    'comprometido'::text as nivel,
    'gasto_impago'::text as origen,
    cg.nombre as detalle,
    -g.total as monto,
    g.devengado_at < CURRENT_DATE as arrastrada
   from gasto g
     join cat_gasto cg on cg.id = g.cat_gasto_id
     join v_gasto_detalle d on d.gasto_id = g.id
  where g.pagado_at is null
    and g.devengado_at is not null
    and d.estado <> 'anulado';

comment on view public.v_cashflow_comprometido is
  '5 ramas de plata comprometida (monto cierto, no estimación): cuotas '
  'equipo/sponsor, compromisos, cheques pendientes, gastos devengados '
  'impagos. La 5ta (gasto_impago) agregada 17/08 con OK de Facu — calca '
  'el patrón GREATEST/fecha_original/arrastrada con devengado_at.';