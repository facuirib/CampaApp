-- ─────────────────────────────────────────────────────────────────────────────
-- La modalidad de pago, en la cuenta corriente
--
-- Commit 5 de A1: el historial de torneos del equipo.
--
-- ── Por qué acá y no en una vista nueva ────────────────────────────────────
--
-- `v_cuenta_corriente_equipo` ya es UNA FILA POR FICHA con torneo, categoría,
-- serie y plata. O sea que **ya era el historial**: lo único que le faltaba
-- para contarlo entero era con qué modalidad se pactó cada torneo.
--
-- Una vista nueva sería una segunda fuente de los mismos importes, que es
-- exactamente lo que la regla 2 prohíbe. Se agregan tres columnas al final
-- —lo único que `create or replace` permite— y no hay número que pueda
-- discrepar consigo mismo.
--
-- Los joins a `plan_tarifa` son INNER como el resto: `equipo_torneo` tiene los
-- dos plan_* NOT NULL, así que no pueden sacar filas.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_cuenta_corriente_equipo as
select
  et.id                                     as equipo_torneo_id,
  te.id                                     as tercero_id,
  te.nombre                                 as equipo,
  t.nombre                                  as torneo,
  cat.nombre                                as categoria,
  cat.genero,
  s.nombre                                  as serie,
  et.total_plan,
  coalesce(sum(i.imputado), 0::numeric)     as total_pagado,
  et.total_plan - coalesce(sum(i.imputado), 0::numeric) as saldo,
  count(c.id)                               as cuotas_total,
  count(c.pagado_at)                        as cuotas_pagadas,
  min(case
        when c.pagado_at is null and (j.id is null or j.estado <> 'suspendida') then c.vence_at
        else null::date
      end)                                  as proximo_vencimiento,
  t.id                                      as torneo_id,
  -- ── Las tres nuevas, al final ───────────────────────────────────────────
  pi.opcion_nombre                          as plan_inscripcion,
  pp.opcion_nombre                          as plan_partidos,
  et.medio_previsto
from equipo_torneo et
  join tercero te on te.id = et.tercero_id
  join torneo t on t.id = et.torneo_id
  join serie s on s.id = et.serie_id
  join categoria cat on cat.id = s.categoria_id
  join plan_tarifa pi on pi.id = et.plan_inscripcion_id
  join plan_tarifa pp on pp.id = et.plan_partidos_id
  left join cuota c on c.equipo_torneo_id = et.id
  left join jornada j on j.id = c.jornada_id
  left join (
    select cuota_id, sum(monto) as imputado
    from pago_imputacion
    group by cuota_id
  ) i on i.cuota_id = c.id
group by et.id, te.id, te.nombre, t.id, t.nombre, cat.nombre, cat.genero, s.nombre,
         et.total_plan, pi.opcion_nombre, pp.opcion_nombre, et.medio_previsto;
