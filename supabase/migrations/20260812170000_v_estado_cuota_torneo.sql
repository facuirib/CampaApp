-- ═══════════════════════════════════════════════════════════════════════════
-- v_estado_cuota · agregar torneo_id y torneo
--
-- `v_estado_cuota` es, según CLAUDE.md, "el estado de cada cuota, base de toda
-- la cobranza". Y no sabía a qué torneo pertenece la cuota: sólo tenía
-- `equipo_torneo_id`, que hay que joinear para llegar al torneo.
--
-- Hoy no molesta porque ninguna pantalla la usa directo —lo verifiqué— y su
-- único consumidor SQL, `v_cashflow_comprometido`, ya hace ese join por otra
-- razón (necesita el nombre del equipo). Pero es la vista que alguien va a
-- agarrar para la próxima pantalla de cuotas, y se va a encontrar con que la
-- pregunta más obvia —"¿de qué torneo es esta cuota?"— no se puede contestar
-- sin salir de ella. `v_deuda_detalle` sí lo trae; la base de todo, no.
--
-- ── Es aditivo y no rompe a nadie ──────────────────────────────────────────
--
-- Las dos columnas van al FINAL, que es lo único que `create or replace view`
-- permite: cambiar el tipo o el orden de una columna existente lo rechaza.
--
-- `v_cashflow_comprometido` selecciona columnas por nombre —`ec.vence_at`,
-- `ec.saldo`, `ec.estado`, `ec.equipo_torneo_id`— y no `select *`, así que dos
-- columnas nuevas al final le son invisibles.
--
-- El join a `equipo_torneo` es INNER y no LEFT a propósito: `cuota` tiene FK
-- not null a `equipo_torneo`, y `equipo_torneo` a `torneo`. Una cuota sin
-- ficha o una ficha sin torneo no existen, así que un LEFT sugeriría una
-- posibilidad que el schema ya descarta — y haría que el planner cargue con un
-- caso imposible.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_estado_cuota as
select
  c.id,
  c.equipo_torneo_id,
  c.numero,
  c.vence_at,
  c.monto,
  c.pagado_at,
  coalesce(i.imputado, 0)                                   as pagado,
  c.monto - coalesce(i.imputado, 0)                         as saldo,
  j.id is not null and j.estado = 'suspendida'              as jornada_suspendida,
  case
    when c.pagado_at is not null                                     then 'pagada'
    when j.estado = 'suspendida'                                     then 'suspendida'
    when coalesce(i.imputado, 0) > 0 and c.vence_at < current_date    then 'parcial_vencida'
    when coalesce(i.imputado, 0) > 0                                 then 'parcial'
    when c.vence_at < current_date                                   then 'vencida'
    when c.vence_at <= (current_date + 7)                            then 'por_vencer'
    else                                                                  'al_dia'
  end                                                       as estado,

  -- ── Lo nuevo, al final ──────────────────────────────────────────────────
  et.torneo_id,
  t.nombre                                                  as torneo

from cuota c
join equipo_torneo et on et.id = c.equipo_torneo_id
join torneo t         on t.id = et.torneo_id
left join jornada j   on j.id = c.jornada_id
left join (
  select cuota_id, sum(monto) as imputado
    from pago_imputacion
   group by cuota_id
) i on i.cuota_id = c.id;

comment on view public.v_estado_cuota is
  'El estado de cada cuota: cuánto se imputó, cuánto queda y en qué situación '
  'está. Base de toda la cobranza. Incluye torneo_id y torneo para no tener '
  'que joinear equipo_torneo sólo para saber de qué torneo es la cuota.';
