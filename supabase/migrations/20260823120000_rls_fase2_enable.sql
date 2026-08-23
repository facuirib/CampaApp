-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · FASE 2 · 11 tablas de solo lectura
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Segunda tanda. Las once tienen policy de SELECT y nada las escribe desde una
-- ruta que pase por RLS. RLS queda en 15/51.
--
-- ── 🔴 Eran 13, y DOS quedaron afuera ──────────────────────────────────────
--
-- El plan las listaba como «solo SELECT». Dos de ellas SÍ se escriben, y con la
-- policy actual el INSERT falla — probado, no deducido:
--
--   reclamo      `/reclamos/acciones.ts` es una Server Action que hace
--                `supabase.from('reclamo').insert(...)` con la sesión del
--                usuario. Con RLS activo:
--                «new row violates row-level security policy for table "reclamo"»
--                → la pantalla de reclamos deja de poder registrar. Tiene 6 filas.
--
--   compromiso   `generar_cuotas_plan` inserta y NO es SECURITY DEFINER, así que
--                corre con el rol del que llama. Mismo error. Hoy es latente
--                —0 filas, y nada crea `plan_pago`— pero rompería igual.
--
-- Las dos necesitan policy de INSERT antes de activarse. Quedan para cuando la
-- tengan; el inventario las clasificaba mal.
--
-- ── Por qué `audit_log` SÍ entra, aunque se escriba ────────────────────────
--
-- `fn_audit` es SECURITY DEFINER: corre con los permisos de su dueño, así que
-- escribe aunque RLS esté activo y la tabla no tenga policy de INSERT. Es
-- deliberado —nadie debería escribir el log a mano— y está verificado: con RLS
-- encendido, una operación auditada llevó la tabla de 1190 a 1191 filas.
--
-- La diferencia con `reclamo` y `compromiso` es exactamente esa: SECURITY
-- DEFINER esquiva RLS, una función común no.
--
-- ── Lo verificado ──────────────────────────────────────────────────────────
--
-- En rollback, con las once encendidas y `set local role authenticated`
-- (`bypassrls = false` confirmado dentro de la transacción), comparando el conteo
-- SIN RLS contra el conteo CON RLS — que es la única forma de distinguir «0
-- porque la tabla está vacía» de «0 porque RLS bloqueó»:
--
--     ejercicio 1=1 · concepto_gasto 100=100 · activo 1=1 · audit_log 1190=1190
--     plan_tarifa 10=10 · plan_tarifa_linea 26=26 · config_contable 1=1
--     formato_instancia 3=3 · envio 0=0 · escenario 0=0 · equipo_playoff 0=0
--
-- Las tres en cero lo están **sin RLS también**: es tabla vacía, no bloqueo.
--
-- Más las vistas que las consumen —v_activo, v_auditoria, v_amortizacion,
-- v_torneo_escala, v_presupuesto_total, v_calendario_jornadas, v_inscripcion— y
-- el circuito de cargar un gasto. 21 de 21.

alter table ejercicio         enable row level security;
alter table concepto_gasto    enable row level security;
alter table activo            enable row level security;
alter table audit_log         enable row level security;
alter table plan_tarifa       enable row level security;
alter table plan_tarifa_linea enable row level security;
alter table config_contable   enable row level security;
alter table envio             enable row level security;
alter table escenario         enable row level security;
alter table formato_instancia enable row level security;
alter table equipo_playoff    enable row level security;
