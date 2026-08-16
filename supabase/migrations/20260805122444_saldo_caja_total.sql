-- ============================================================================
-- CAMPA · v_saldo_caja_total — la posición de caja de hoy, en un solo número
--
-- /proyeccion necesita mostrar "cuánta plata hay HOY", que es la suma de las
-- cajas activas. Ese total no existía como número: `v_saldo_caja` devuelve una
-- fila por caja.
--
-- No se suma en el front. La regla 1 es explícita: el front nunca suma,
-- promedia ni calcula totales, y un `.reduce()` para un número que va a
-- pantalla está mal. Si hace falta un total nuevo, se crea la vista.
--
-- Es la contracara del saldo PROYECTADO: v_cashflow.saldo_proyectado responde
-- "cuánta plata voy a tener al cierre de esa semana" e incluye lo comprometido
-- todavía sin cobrar. Éste responde "cuánta hay ahora", y solo cuenta lo que ya
-- tocó caja.
-- ============================================================================

create view v_saldo_caja_total as
select coalesce(sum(saldo), 0)::numeric(16,2) as saldo_total,
       count(*)                               as cajas
from v_saldo_caja;

comment on view v_saldo_caja_total is
  'Posición de caja de hoy: la suma de las cajas activas, derivada del diario. '
  'Es el saldo REAL, sin nada proyectado — la contracara de '
  'v_cashflow.saldo_proyectado.';
