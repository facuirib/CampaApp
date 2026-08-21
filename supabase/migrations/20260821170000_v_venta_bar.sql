-- ═══════════════════════════════════════════════════════════════════════════
-- Vistas de lectura del bar — PROPUESTA, NO APLICAR sin revisión (regla 11)
--
-- Dos vistas, cada una con un consumidor concreto en la pantalla /bar. No hay
-- una tercera de KPI a propósito: ver la nota del final.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── v_venta_bar · la lista de cierres ──────────────────────────────────────
--
-- `venta_bar` sola no alcanza para la lista: la fecha y el predio viven en
-- dia_cancha y predio, así que sin vista la pantalla tendría que armar el join
-- —y el nombre del predio— del lado del cliente.
--
-- El `total` NO se calcula acá: sale de la columna generada de la tabla. Se
-- expone tal cual para que la pantalla lo muestre sin sumar nada (regla 1).
--
-- MUESTRA TODOS, incluidos los anulados, y los marca con `estado`. Es una
-- vista que lista CIERRES, no asientos, así que la nota de la regla 4 sobre
-- contraasientos huérfanos no aplica: un cierre anulado no deja contraparte
-- suelta en esta lista. Se muestran porque la pantalla los tacha y son parte
-- de lo que pasó — y porque esconderlos dejaría un día "sin cierre" que en
-- realidad tuvo uno.
create or replace view v_venta_bar as
select
  vb.id              as venta_bar_id,
  vb.dia_cancha_id,
  dc.fecha,
  dc.predio_id,
  p.codigo           as predio,
  p.nombre           as predio_nombre,
  vb.monto_efectivo,
  vb.monto_tarjeta,
  vb.monto_mp,
  vb.total,
  case when vb.anulado_at is null then 'vigente' else 'anulado' end as estado,
  vb.anulado_at,
  vb.anulado_motivo,
  vb.observaciones,
  vb.asiento_id,
  vb.created_by,
  vb.created_at
from venta_bar vb
join dia_cancha dc on dc.id = vb.dia_cancha_id
join predio     p  on p.id  = dc.predio_id;

comment on view v_venta_bar is
  'Los cierres de bar con su día, predio y total. Muestra TODOS y marca el '
  'anulado en `estado` — no filtra. El total sale de la columna generada de '
  'venta_bar, no se calcula acá.';


-- ── v_dia_cancha_bar · qué día se puede cerrar ─────────────────────────────
--
-- Espejo exacto de `v_saldo_efectivo_dia_cancha`, que es lo que usa
-- /arqueo/nuevo para ofrecer los días sin arquear: todos los dia_cancha, con
-- LEFT JOIN a lo que les cuelga, y la pantalla filtra `venta_bar_id is null`.
--
-- El `and vb.anulado_at is null` del JOIN es lo importante y va en el ON, no en
-- un WHERE: un día cuyo cierre se anuló tiene que volver a aparecer como
-- disponible —es justo lo que habilita el índice parcial de venta_bar—. Si
-- fuera un WHERE, el LEFT JOIN se degradaría a INNER y los días sin cierre
-- desaparecerían de la vista, que es lo contrario de para qué existe.
create or replace view v_dia_cancha_bar as
select
  dc.id            as dia_cancha_id,
  dc.fecha,
  dc.predio_id,
  p.codigo         as predio,
  p.nombre         as predio_nombre,
  vb.id            as venta_bar_id,
  vb.total         as venta_bar_total
from dia_cancha dc
join predio p on p.id = dc.predio_id
left join venta_bar vb
       on vb.dia_cancha_id = dc.id
      and vb.anulado_at is null;

comment on view v_dia_cancha_bar is
  'Todos los días de cancha con el cierre de bar VIGENTE que les cuelga, o '
  'NULL si no tienen. La pantalla de carga filtra venta_bar_id is null para '
  'ofrecer los días cerrables. Mismo patrón que v_saldo_efectivo_dia_cancha '
  'con arqueo. Un día cuyo cierre se anuló vuelve a aparecer disponible.';


-- ── Por qué NO hay v_venta_bar_kpi ─────────────────────────────────────────
-- Todos los módulos tienen una (v_cheque_kpi, v_activo_kpi, v_gasto_kpi…), así
-- que la ausencia es deliberada y no un olvido: con la tabla en 0 filas, una
-- banda de KPIs muestra cuatro ceros, que es ruido arriba de un empty state.
-- Cuando el bar tenga movimiento y la pantalla quiera un encabezado con totales
-- —que por regla 1 NO puede sumar el front— se agrega ahí, con datos que
-- justifiquen qué cortes valen la pena.
