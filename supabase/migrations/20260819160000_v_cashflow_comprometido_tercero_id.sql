-- ═══════════════════════════════════════════════════════════════════════════
-- v_cashflow_comprometido · tercero_id
--
-- ⚠️ PROPUESTA · NO APLICADA. Vista de HORACIO: se avisa en coordinacion.md.
--
-- ── Por qué, y por qué NO alcanza con origen_id ────────────────────────────
--
-- `origen_id` (20260819120000) identifica el REGISTRO que vence. Sirve de clave
-- de fila y alcanza para enlazar donde la pantalla de destino se abre por ese
-- registro: /cheques/[cheque_id], /gastos.
--
-- Pero para una cuota de equipo el destino natural es la cuenta corriente del
-- EQUIPO —/cobranza/[terceroId]—, y `origen_id` ahí es el id de la CUOTA, no
-- del tercero. Con sólo origen_id el calendario podría decir «vence una cuota
-- de Alayama LF» y no poder llevarte a Alayama LF.
--
-- ── Qué aporta cada rama ───────────────────────────────────────────────────
--
--   rama            tercero_id        de dónde              enlace de la pantalla
--   ──────────────  ────────────────  ────────────────────  ─────────────────────
--   cuota_equipo    SIEMPRE           et.tercero_id         /cobranza/[tercero_id]
--   cuota_sponsor   SIEMPRE           q.sponsor_id          /sponsors/[tercero_id]
--   compromiso_*    a veces           cm.tercero_id (nul.)  según tipo
--   cheque_*        sólo RECIBIDO     ch.tercero_id         /cheques/[origen_id]
--   gasto_impago    NUNCA (NULL)      —                     /gastos
--
-- Tres aclaraciones que evitan malinterpretar los NULL:
--
--   · `contrato_sponsor.sponsor_id` ES un id de `tercero` —la vista de sponsors
--     hace `join tercero t on t.id = c.sponsor_id`—, así que sirve tal cual para
--     /sponsors/[sponsorId], que filtra por `sponsor_id`. Verificado en la
--     pantalla, no supuesto.
--
--   · En cheques el enlace NO va por tercero: va a /cheques/[origen_id], que es
--     donde está el circuito completo. `tercero_id` se expone igual porque es
--     información real —de quién es el cheque recibido— y porque permite
--     filtrar "todo lo de este tercero" a través de las ramas, que es una
--     pregunta legítima del calendario. En un cheque EMITIDO es NULL: `gasto`
--     no registra a quién se le paga, y por eso /cheques rotula «Categoría» y
--     no «Contraparte».
--
--   · En `gasto_impago` es NULL SIEMPRE, y no es un olvido: `gasto` no tiene
--     `tercero_id`. Es la limitación conocida del modelo de gastos, la misma
--     que deja sin beneficiario a los cheques emitidos. El día que gasto tenga
--     proveedor, esta rama se puebla sola cambiando una línea.
--
-- La pantalla decide el enlace por `origen`, no por si `tercero_id` viene o no:
-- un NULL no significa "no se puede enlazar", significa "no se enlaza por
-- tercero".
--
-- ── Aditivo, al final, como origen_id ──────────────────────────────────────
--
-- `create or replace view` sólo permite agregar columnas al final. Las 5 ramas
-- quedan idénticas en FROM, WHERE y montos: 285 filas antes y después.
--
-- Los tres consumidores siguen leyendo por columna nombrada:
--   · v_cashflow enumera (fecha, nivel, origen, detalle, monto) en su UNION ALL
--   · /proyeccion/[periodo] hace .select('*') y mapea por nombre
--   · v_calendario_dia agrupa por fecha_original y no toca tercero_id
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_cashflow_comprometido as
select GREATEST(ec.vence_at, CURRENT_DATE) as fecha,
    ec.vence_at as fecha_original,
    'comprometido'::text as nivel,
    'cuota_equipo'::text as origen,
    t.nombre as detalle,
    ec.saldo as monto,
    ec.vence_at < CURRENT_DATE as arrastrada,
    ec.id as origen_id,
    et.tercero_id                                  -- el equipo
   from v_estado_cuota ec
     join equipo_torneo et on et.id = ec.equipo_torneo_id
     join tercero t on t.id = et.tercero_id
  where ec.saldo > 0::numeric and ec.estado <> 'suspendida'::text
union all
 select GREATEST(q.fecha_cobro, CURRENT_DATE) as fecha,
    q.fecha_cobro as fecha_original,
    'comprometido'::text as nivel,
    'cuota_sponsor'::text as origen,
    q.sponsor as detalle,
    q.monto,
    q.fecha_cobro < CURRENT_DATE as arrastrada,
    q.cuota_id as origen_id,
    q.sponsor_id as tercero_id                     -- el sponsor ES un tercero
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
    cm.id as origen_id,
    cm.tercero_id                                  -- nullable en la tabla
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
    ch.id as origen_id,
    ch.tercero_id                                  -- sólo el recibido lo tiene
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
    g.id as origen_id,
    null::uuid as tercero_id                       -- gasto no tiene proveedor
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
  'registro de cada rama; el PAR (origen, origen_id) es lo que identifica. '
  'tercero_id (19/08) es para enlazar: SIEMPRE en cuota_equipo y '
  'cuota_sponsor, sólo en cheques RECIBIDOS, a veces en compromisos, y NUNCA '
  'en gasto_impago porque gasto no tiene proveedor. Un NULL no significa que '
  'no se pueda enlazar: significa que no se enlaza por tercero.';
