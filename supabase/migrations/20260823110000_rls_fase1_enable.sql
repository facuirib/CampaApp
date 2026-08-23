-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · FASE 1 · se ACTIVA en 4 catálogos de solo lectura
-- Primera activación real de RLS en el sistema.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hasta acá había 104 policies escritas y RLS apagado en las 51 tablas: las
-- policies estaban inertes. Esto enciende las primeras cuatro.
--
-- Por qué estas: son las de MENOR riesgo del inventario. Solo tienen policy de
-- SELECT porque nadie las escribe desde el sistema —se cargan por seed—, así que
-- lo único que puede salir mal es que una pantalla quede vacía, y eso se ve en el
-- primer clic. Las tablas que se escriben van después; el núcleo, al final.
--
-- ── Lo verificado ANTES de esto, y cómo ────────────────────────────────────
--
-- En `begin/rollback`, con RLS ya encendido en las cuatro y **cambiando de rol**
-- a `authenticated` con claims reales:
--
--     set_config('request.jwt.claims', ...); set local role authenticated;
--
-- Ese paso NO es opcional. Desde el editor SQL uno es `postgres`, que tiene
-- `rolbypassrls = true`: RLS no se le aplica, y toda prueba da un falso OK.
-- Verificado dentro de la transacción: `bypassrls = false`.
--
-- Y se midieron FILAS, no ausencia de error. Es el hallazgo que cambió el
-- protocolo: **RLS no lanza excepción en UPDATE y DELETE — afecta 0 filas y
-- sigue.** Una policy mal escrita no rompe visiblemente: deja de guardar en
-- silencio. Para estas cuatro, que son SELECT, el síntoma sería una lectura
-- vacía; igual se midió todo.
--
--     predio 2 · serie 21 · categoria 7 · cuenta 33
--     v_saldo_caja 9 · v_libro_diario 83 · v_pl_mensual 168
--     v_saldo_efectivo_dia_cancha 58 · v_calendario_jornadas 284
--     v_inscripcion 34 · v_deuda_equipo 28 · v_gasto_detalle 13
--     v_cashflow 26 · v_presupuesto_total 6 · cat_gasto 32
--     + circuito completo: cargar un gasto (usa cuenta y cat_gasto) → OK
--
-- 17 de 17 con datos. Ninguna lectura vacía.

alter table predio    enable row level security;
alter table serie     enable row level security;
alter table categoria enable row level security;
alter table cuenta    enable row level security;

-- Las cuatro quedan con su policy de SELECT para `authenticated`. El efecto real
-- de esto es cerrarle la puerta a `anon` —la clave que viaja en el bundle del
-- navegador— que hasta hoy podía leerlas sin login.
--
-- ⚠️ Lo que esto NO hace: repartir permisos entre personas. Las 107 policies son
-- `authenticated · using(true)`, sin distinción de rol, porque no existe todavía
-- tabla de roles ni claim que la sostenga. La diferenciación por rol (admin,
-- operador, administración, encargado de bar) es una capa POSTERIOR, sobre esta.
