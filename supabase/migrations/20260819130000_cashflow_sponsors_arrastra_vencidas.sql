-- ═══════════════════════════════════════════════════════════════════════════
-- v_cashflow_comprometido · la rama de sponsors arrastra lo vencido
--
-- ⚠️ PROPUESTA · NO APLICADA · SE APRUEBA APARTE de la de origen_id.
-- Vista de Horacio: se avisa en coordinacion.md antes de aplicar.
--
-- Depende de 20260819120000 (origen_id): reescribe la vista entera, así que si
-- aquélla no se aplica, ésta tampoco — o habría que sacarle la columna.
--
-- ── El síntoma ─────────────────────────────────────────────────────────────
--
-- Cuatro de las cinco ramas arrastran lo vencido: GREATEST(fecha, CURRENT_DATE)
-- lo empuja a hoy, fecha_original conserva la real y arrastrada lo marca. La de
-- sponsors no: lee v_cuotas_sponsor_futuras, que filtra
-- `fecha_cobro >= current_date`, y por eso pone `false as arrastrada` fijo — no
-- porque no arrastre, sino porque lo vencido ya no llegó.
--
-- Hoy eso es 1 cuota de Bodega Los Cerros, vencida el 05/08/2026 por $4.000.000,
-- que no aparece ni en la proyección ni en ningún lado del cashflow.
--
-- ── Por qué NO es deliberado ───────────────────────────────────────────────
--
-- El filtro de `v_cuotas_sponsor_futuras` SÍ es deliberado para esa vista: se
-- llama "futuras", su comentario dice "cuotas por vencer" y la decisión 77 la
-- designó fuente del cashflow. Todo coherente. Lo que quedó viejo es la
-- ELECCIÓN DE FUENTE, no la vista.
--
-- Cuatro señales de que esconder lo vencido no es la regla de negocio:
--
--   1. El modelo de sponsors reconoce el vencimiento: `v_cuotas_sponsor` deriva
--      un estado 'vencida' explícito. Una cuota vencida no se renegocia ni se
--      da de baja — sigue siendo una cuota impaga con fecha pasada.
--
--   2. La migración que creó esa vista (20260809155729) ya juzgó el caso, con
--      todas las letras: «una cuota VENCIDA E IMPAGA —el caso que más importa
--      mirar— desaparecía de la pantalla el día que se vencía. Un sponsor
--      moroso era invisible.» Se arregló para la PANTALLA y se dejó
--      v_cuotas_sponsor_futuras «como está — tiene su uso, que es el cashflow
--      por venir». O sea: se vio el problema y se difirió, no se decidió que
--      estuviera bien.
--
--   3. Cuando se escribió la decisión 77 el mecanismo de arrastre NO EXISTÍA.
--      "Filtrar el pasado" era la única forma de que una fecha vieja no
--      ensuciara la proyección. GREATEST/fecha_original/arrastrada llegó
--      después, y las cuatro ramas que se escribieron con él lo usan. Sponsors
--      quedó con la fuente vieja: es deuda de sincronización, no criterio.
--
--   4. No hay asimetría de negocio que lo sostenga. Un equipo que no pagó una
--      cuota vencida cuenta como plata por cobrar; un sponsor que no pagó, no.
--      La plata se debe igual, y si la diferencia fuera la cobrabilidad, eso se
--      expresa con el NIVEL de certeza (comprometido vs estimado), no
--      borrando la fila.
--
-- ── El arreglo ─────────────────────────────────────────────────────────────
--
-- **No se toca `v_cuotas_sponsor_futuras`.** Su nombre y su comentario son
-- honestos, la decisión 77 la referencia, y cambiarle el filtro haría que
-- "futuras" mintiera. Lo que cambia es de dónde lee ESTA rama: pasa a
-- `v_cuotas_sponsor`, que trae todas las cuotas con su estado, y se le aplica
-- el mismo patrón que a las otras cuatro.
--
--     from v_cuotas_sponsor q
--    where q.cobrado_at is null          ← lo impago, sin importar la fecha
--
-- El `estado` de esa vista no se usa como filtro: 'vencida' vs 'por_vencer' es
-- exactamente lo que `arrastrada` ya expresa, y derivarlo dos veces sería
-- pedirle a dos lugares la misma respuesta.
--
-- ── Efecto ─────────────────────────────────────────────────────────────────
--
--   filas         284 → 285   (+1: la cuota de Bodega Los Cerros)
--   neto          +$255.258.233 → +$259.258.233
--   arrastradas   67 → 68
--
-- Sube el comprometido a cobrar en $4.000.000. Es plata que se debe de verdad;
-- que aparezca es el punto.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_cashflow_comprometido as
select GREATEST(ec.vence_at, CURRENT_DATE) as fecha,
    ec.vence_at as fecha_original,
    'comprometido'::text as nivel,
    'cuota_equipo'::text as origen,
    t.nombre as detalle,
    ec.saldo as monto,
    ec.vence_at < CURRENT_DATE as arrastrada,
    ec.id as origen_id
   from v_estado_cuota ec
     join equipo_torneo et on et.id = ec.equipo_torneo_id
     join tercero t on t.id = et.tercero_id
  where ec.saldo > 0::numeric and ec.estado <> 'suspendida'::text
union all
 -- ── La rama que cambia ───────────────────────────────────────────────────
 select GREATEST(q.fecha_cobro, CURRENT_DATE) as fecha,
    q.fecha_cobro as fecha_original,
    'comprometido'::text as nivel,
    'cuota_sponsor'::text as origen,
    q.sponsor as detalle,
    q.monto,
    q.fecha_cobro < CURRENT_DATE as arrastrada,
    q.cuota_id as origen_id
   from v_cuotas_sponsor q
  where q.cobrado_at is null
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
    cm.id as origen_id
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
    ch.id as origen_id
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
    g.id as origen_id
   from gasto g
     join cat_gasto cg on cg.id = g.cat_gasto_id
     join v_gasto_detalle d on d.gasto_id = g.id
  where g.pagado_at is null
    and g.devengado_at is not null
    and d.estado <> 'anulado';

comment on view public.v_cashflow_comprometido is
  '5 ramas de plata comprometida (monto cierto, no estimación): cuotas '
  'equipo/sponsor, compromisos, cheques pendientes, gastos devengados '
  'impagos. Las 5 arrastran lo vencido con el mismo patrón '
  'GREATEST/fecha_original/arrastrada. La de sponsors lee v_cuotas_sponsor '
  '(19/08): antes leía v_cuotas_sponsor_futuras, que filtra fecha_cobro >= '
  'hoy y escondía las cuotas vencidas e impagas. origen_id es el id del '
  'registro de cada rama; el PAR (origen, origen_id) es lo que identifica.';
