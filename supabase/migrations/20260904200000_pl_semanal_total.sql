-- ─────────────────────────────────────────────────────────────────────────────
-- El resultado por SEMANA
--
-- ── Por qué una vista nueva y no reusar v_cashflow ─────────────────────────
--
-- `v_cashflow` ya tiene `semana`, `entradas` y `salidas`, y era tentador. Pero
-- mide otra cosa: es CAJA —plata que entró y salió—, y el panel de «ingresos vs
-- gastos» del inicio muestra RESULTADO.
--
-- Para los ingresos las dos coinciden, porque en CAMPA el ingreso se reconoce al
-- cobrar. Para los gastos no: un gasto se devenga al cargarlo y se paga después,
-- así que `salidas` es lo que se pagó y no lo que se gastó. Cambiar la fuente
-- habría cambiado el significado del gráfico en silencio, con la excusa de
-- cambiarle la granularidad.
--
-- Así que esto es `v_pl_mensual_total` con otro corte temporal, y nada más.
--
-- ── El corte es por la FECHA del asiento, no por el período ────────────────
--
-- La mensual agrupa por `periodo.anio` y `periodo.mes`, que es lo correcto
-- cuando el balde ES el mes. Una semana no cabe en esa clave —cruza meses— así
-- que se agrupa por `asiento.fecha`. No es una fuente distinta: el trigger
-- `trg_asiento_fecha_periodo` garantiza que la fecha cae dentro de su período,
-- o sea que las dos vistas parten del mismo hecho y lo agrupan distinto.
--
-- El lunes es el primer día: `date_trunc('week')` en Postgres usa ISO-8601.
--
-- ── 🔴 No filtra los anulados, y es a propósito (regla 4) ──────────────────
--
-- Esta vista SUMA. El asiento original y su contraasiento se compensan solos
-- —+X y −X dan 0— mientras estén los dos. `anular_asiento` marca sólo el
-- original, así que un `where anulado_por is null` dejaría el contraasiento
-- huérfano y el resultado de la semana daría −X en vez de 0.
--
-- Y como el contraasiento tiene su propia fecha, incluir los dos además es lo
-- correcto con corte temporal: cada semana muestra lo que el diario decía esa
-- semana. `v_pl_mensual` hace exactamente lo mismo.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_pl_semanal_total as
with movs as (
  select
    date_trunc('week', a.fecha)::date as semana,
    c.tipo,
    -- Misma convención de signo que v_pl_mensual: un egreso suma por el debe y
    -- un ingreso por el haber, así que los dos salen positivos.
    sum(case when c.tipo = 'egreso' then l.debe - l.haber else l.haber - l.debe end) as monto
  from asiento_linea l
    join cuenta c on c.id = l.cuenta_id
      and c.tipo = any (array['ingreso', 'egreso', 'financiero'])
    join asiento a on a.id = l.asiento_id
  group by 1, 2
)
select
  semana,
  -- El año de la semana, para poder filtrar igual que la mensual. Sale del
  -- LUNES: una semana que cruza el año entra entera en el año en que empieza,
  -- que es la única forma de que cada semana aparezca una sola vez.
  extract(year from semana)::int as anio,
  coalesce(sum(monto) filter (where tipo = 'ingreso'), 0)::numeric(16,2)    as ingresos,
  coalesce(sum(monto) filter (where tipo = 'egreso'), 0)::numeric(16,2)     as egresos,
  coalesce(sum(monto) filter (where tipo = 'financiero'), 0)::numeric(16,2) as financiero,
  (coalesce(sum(monto) filter (where tipo = 'ingreso'), 0)
   - coalesce(sum(monto) filter (where tipo = 'egreso'), 0)
   + coalesce(sum(monto) filter (where tipo = 'financiero'), 0))::numeric(16,2) as resultado
from movs
group by semana;

comment on view v_pl_semanal_total is
  'Resultado por semana (lunes ISO). Mismo contenido que v_pl_mensual_total con otro corte temporal: agrupa por asiento.fecha porque una semana cruza meses.';
