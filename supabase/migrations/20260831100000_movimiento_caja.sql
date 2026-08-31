-- ═══════════════════════════════════════════════════════════════════════════
-- CAJA · el historial de cada caja
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `/caja` muestra saldos y nada más: cuánto hay en cada una, hoy. La pregunta
-- que sigue —«¿y cómo llegó a eso?»— no tenía dónde contestarse, así que para
-- entender un saldo raro había que ir al libro diario y filtrar a ojo por la
-- cuenta de esa caja.
--
-- ── De dónde salen los movimientos ─────────────────────────────────────────
--
-- No hay tabla de movimientos de caja, y no hace falta: **una caja ES una
-- cuenta contable** —`caja.cuenta_id`— así que sus movimientos son las líneas
-- del diario contra esa cuenta. Inventar una tabla paralela sería duplicar el
-- diario y darle a alguien la chance de que las dos versiones difieran.
--
-- ── El predio, que no es un detalle ────────────────────────────────────────
--
-- Todas las cajas de efectivo comparten la MISMA cuenta contable
-- (`CAJA_EFECTIVO`): lo que las distingue es el predio. Por eso el join lleva
-- las dos condiciones —la cuenta y, cuando la caja tiene predio, que el asiento
-- sea de ese predio—. Sin eso, el historial de la caja de un predio mostraría
-- también los movimientos del otro, y el saldo corrido no cerraría con
-- `v_saldo_caja`, que ya filtra así.
--
-- ── El saldo corrido ───────────────────────────────────────────────────────
--
-- `sum(debe - haber) over (...)` por caja, ordenado por fecha. La última fila
-- de cada caja tiene que dar exactamente su saldo de `v_saldo_caja` — es la
-- misma cuenta y el mismo filtro, así que si no cierran, una de las dos está
-- mal. Se verifica al aplicar.
--
-- ── Los anulados se muestran ───────────────────────────────────────────────
--
-- No se filtra `anulado_por`, y es la regla 4: esto LISTA asientos, no los
-- suma. El original y su contraasiento aparecen los dos, y el saldo corrido los
-- compensa solo. Filtrar escondería el original y dejaría el contraasiento
-- huérfano — un −X sin nada que lo explique.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_movimiento_caja as
select
  cj.id                                as caja_id,
  cj.nombre                            as caja,
  a.id                                 as asiento_id,
  a.fecha,
  a.origen,
  a.descripcion,
  l.debe,
  l.haber,
  (l.debe - l.haber)                   as neto,

  -- El saldo de la caja después de este movimiento. `asiento.id` desempata
  -- dos asientos de la misma fecha para que el orden sea estable entre
  -- consultas: sin eso el corrido cambiaría de una carga a la otra.
  sum(l.debe - l.haber) over (
    partition by cj.id
    order by a.fecha, a.created_at, a.id
    rows between unbounded preceding and current row
  )                                    as saldo_corrido,

  -- El original anulado se marca; el contraasiento se reconoce por su tipo.
  (a.anulado_por is not null)          as anulado

from caja cj
join asiento_linea l on l.cuenta_id = cj.cuenta_id
join asiento a       on a.id = l.asiento_id
-- La caja con predio sólo ve los asientos de SU predio; las que no tienen
-- predio —central, transferencia, USD— ven todo lo de su cuenta.
where cj.activo
  and (cj.predio_id is null or a.predio_id = cj.predio_id);

comment on view public.v_movimiento_caja is
  'Los movimientos de cada caja, con saldo corrido. Una caja ES una cuenta '
  'contable, así que salen del diario: no hay tabla paralela que pueda diferir. '
  'Las cajas con predio filtran por él —todas las de efectivo comparten cuenta— '
  'y los asientos anulados se muestran marcados, no se esconden (regla 4).';
