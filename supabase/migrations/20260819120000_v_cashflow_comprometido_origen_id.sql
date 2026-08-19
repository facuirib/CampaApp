-- ═══════════════════════════════════════════════════════════════════════════
-- v_cashflow_comprometido · origen_id
--
-- ⚠️ PROPUESTA · NO APLICADA. Y es una vista de HORACIO: se avisa en
-- coordinacion.md antes de aplicar.
--
-- ── Por qué ────────────────────────────────────────────────────────────────
--
-- La vista da 7 columnas y ninguna es un id. Para el cashflow no hacía falta
-- —ahí se suma por fecha y nivel—, pero el Calendario de pagos que se va a
-- construir encima necesita dos cosas que sin id no se pueden:
--
--   · una CLAVE DE FILA. Hoy la tupla (fecha_original, origen, detalle, monto)
--     resulta única —284 filas, 284 combinaciones— pero nada lo garantiza: dos
--     cuotas del mismo equipo que venzan el mismo día por el mismo importe
--     colisionan, y con inscripción y partidos conviviendo eso es plausible.
--
--   · el ENLACE AL ORIGEN. Un calendario donde clickeás un vencimiento y no
--     podés ir al equipo, al cheque o al gasto es la mitad de útil. Es lo mismo
--     que en /cheques resolvió el enlace a /movimientos/[id].
--
-- Cada rama ya tiene su id a mano, así que es exponer lo que ya está.
--
-- ── Por qué va ÚLTIMA, y no al lado de `origen` ────────────────────────────
--
-- `create or replace view` no permite reordenar ni cambiar las columnas que ya
-- existen: sólo AGREGAR al final. No es una preferencia de estilo, es lo único
-- que Postgres acepta sin un drop. Y de paso es lo más seguro para quien lea
-- con `select *`.
--
-- ── Que no rompe nada, verificado ──────────────────────────────────────────
--
-- Dos consumidores, los dos por columna nombrada:
--
--   · `v_cashflow` la mete en un UNION ALL con v_cashflow_real y
--     v_cashflow_estimado, pero enumera (fecha, nivel, origen, detalle, monto).
--     Una columna nueva al final no entra al UNION y no descuadra el arity.
--   · `/proyeccion/[periodo]` hace `.select('*')` y mapea por nombre: una
--     columna de más se ignora sola.
--
-- Las 5 ramas quedan idénticas —mismos FROM, mismos WHERE, mismos montos—, así
-- que el conteo no se mueve: 284 filas antes y después.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_cashflow_comprometido as
select GREATEST(ec.vence_at, CURRENT_DATE) as fecha,
    ec.vence_at as fecha_original,
    'comprometido'::text as nivel,
    'cuota_equipo'::text as origen,
    t.nombre as detalle,
    ec.saldo as monto,
    ec.vence_at < CURRENT_DATE as arrastrada,
    ec.id as origen_id                      -- cuota
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
    false as arrastrada,
    q.cuota_id as origen_id                 -- cuota_cobro_sponsor
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
    cm.vence_at < CURRENT_DATE as arrastrada,
    cm.id as origen_id                      -- compromiso
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
    ch.fecha_cobro < CURRENT_DATE as arrastrada,
    ch.id as origen_id                      -- cheque
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
    g.devengado_at < CURRENT_DATE as arrastrada,
    g.id as origen_id                       -- gasto
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
  'el patrón GREATEST/fecha_original/arrastrada con devengado_at. '
  'origen_id (19/08) es el id del registro de cada rama: sirve de clave de '
  'fila y de enlace al origen. El PAR (origen, origen_id) es lo que '
  'identifica: los ids son de tablas distintas y solos no son únicos.';
