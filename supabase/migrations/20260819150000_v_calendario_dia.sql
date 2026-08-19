-- ═══════════════════════════════════════════════════════════════════════════
-- v_calendario_dia · el resumen por día del Calendario de pagos
--
-- ⚠️ PROPUESTA · NO APLICADA.
--
-- ── Para qué ───────────────────────────────────────────────────────────────
--
-- El Calendario de pagos tiene dos presentaciones de los mismos datos: una
-- MATRIZ de días y una LISTA. En la matriz, cada celda muestra un resumen del
-- día —«+$X / −$Y · 3 vencimientos»— y el detalle se abre al clickear.
--
-- Ese resumen son totales por día, y por la regla 1 no los puede sumar el
-- front: `v_cashflow_comprometido` da una fila por vencimiento, no por día.
-- Esta vista es esa agregación, y nada más.
--
-- El DETALLE de un día NO necesita vista: sale de `v_cashflow_comprometido`
-- filtrando por `fecha_original`, que desde 20260819120000 ya trae `origen_id`
-- para la clave de fila y el enlace al origen.
--
-- ── Por qué agrupa por fecha_original y no por fecha ───────────────────────
--
-- Es la decisión que define la pantalla, así que queda escrita acá.
--
-- `fecha` es `GREATEST(vence_at, CURRENT_DATE)`: empuja lo vencido a hoy porque
-- para PROYECTAR CAJA lo que importa es cuándo va a entrar la plata, no cuándo
-- debió entrar. Para un CALENDARIO es exactamente lo contrario: un calendario
-- muestra dónde venció de verdad.
--
-- Medido sobre los datos de hoy, la diferencia no es sutil:
--
--     agrupado por          días   ítems en hoy   día más cargado
--     fecha_original          36              0                39
--     fecha                   28             68                68
--
-- Con `fecha`, julio y la primera mitad de agosto quedan VACÍOS y hoy tiene 68
-- vencimientos: el calendario diría que no venció nada justo en los días en que
-- venció todo. Con `fecha_original` cada cosa cae en su día y `vencidos` marca
-- cuáles ya pasaron.
--
-- ── El signo de `sale` ─────────────────────────────────────────────────────
--
-- Queda NEGATIVO, no en valor absoluto, por dos razones que apuntan igual:
--
--   · `neto = entra + sale` es una suma común y no hay convención que recordar;
--   · es lo que ya hace `v_cashflow`, que tiene `sum(monto) filter (monto < 0)
--     as salidas`. Invertirlo acá crearía dos convenciones para el mismo
--     concepto dentro del mismo módulo.
--
-- Que se muestre sin signo es decisión de la pantalla, no del dato.
--
-- ── El acumulado va acá, y no por ítem ─────────────────────────────────────
--
-- La lista necesita un acumulado. Va por DÍA porque por ítem no significa nada:
-- en un día con 39 vencimientos el orden entre ellos es arbitrario, así que un
-- acumulado que salta 39 veces dentro del mismo día informa sobre un orden que
-- no existe. Por día, cada salto es un hecho: «al cerrar este día, el neto
-- comprometido acumulado es X».
--
-- ⚠️ NO es un saldo de caja. No incluye la plata que ya hay: es cuánto neto
-- comprometido se acumula hasta ese día. El saldo proyectado de verdad —que
-- suma el saldo de las cajas— es `v_cashflow.saldo_proyectado`.
--
-- ── Verificado antes de aplicar (rollback, 19/08) ──────────────────────────
--
--   36 días · 285 ítems · 68 vencidos · neto $259.258.233
--   acumulado final = $259.258.233 = la suma de todos los netos ✓
--   9 días con vencidos, del 10/07 al 16/08 — TODOS en el pasado, ninguno en
--     hoy (19/08 no aparece: no vence nada ese día) ✓
--   2 días mixtos, y suman: 01/08 → 1.410.000 + (−4.300.000) = −2.890.000 ✓
--                           08/08 → 31.370.000 + (−1.450.000) = 29.920.000 ✓
--   la cuota de sponsor rescatada cae en su día: 05/08, 1 ítem, 1 vencido,
--     $4.000.000 ✓
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_calendario_dia as
select
  fecha_original                                                  as dia,
  count(*)::int                                                   as items,
  coalesce(sum(monto) filter (where monto > 0), 0)::numeric(16,2) as entra,
  coalesce(sum(monto) filter (where monto < 0), 0)::numeric(16,2) as sale,
  sum(monto)::numeric(16,2)                                       as neto,
  count(*) filter (where arrastrada)::int                         as vencidos,
  sum(sum(monto)) over (order by fecha_original)::numeric(16,2)   as acumulado
from v_cashflow_comprometido
group by fecha_original;

comment on view public.v_calendario_dia is
  'Un día por fila, para las celdas del Calendario de pagos: cuántos '
  'vencimientos, cuánto entra, cuánto sale, el neto y cuántos están vencidos. '
  'Agrupa por fecha_original —la fecha REAL de vencimiento— y no por fecha, '
  'que empuja lo vencido a hoy para proyectar caja y apilaría 68 ítems en un '
  'solo día. `sale` va negativo, igual que v_cashflow.salidas. `acumulado` es '
  'el neto comprometido corrido por día; NO es un saldo de caja — ese es '
  'v_cashflow.saldo_proyectado, que suma lo que hay en las cajas. El detalle '
  'de un día sale de v_cashflow_comprometido filtrando por fecha_original.';
