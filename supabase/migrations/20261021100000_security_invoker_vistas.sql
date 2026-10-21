-- ═══════════════════════════════════════════════════════════════════════════
-- SEGURIDAD · security_invoker en TODAS las vistas + anon afuera
-- APLICADA EL 21/10/2026 (auditoría de seguridad, OK de Facu)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── El agujero que cierra ───────────────────────────────────────────────────
--
-- Una vista sin `security_invoker = true` evalúa la RLS de sus tablas base
-- como su CREADOR (postgres), no como quien la consulta. Las 106 vistas de
-- este schema nacieron sin el flag — salvo v_ingreso_extraordinario_detalle —
-- así que CUALQUIERA con la anon key (que viaja en el bundle de la app, por
-- diseño) podía leer, SIN LOGIN: v_saldo_socio (los sueldos de los dueños),
-- v_pl_mensual (el P&L completo), v_deuda_equipo (la deuda de cada equipo)…
-- 69 vistas con datos. Las tablas directas daban 0 — la RLS funcionaba — y
-- las vistas la salteaban entera. Demostrado en la auditoría del 21/10.
--
-- Con el flag, la vista corre con los permisos del que consulta: anon no
-- tiene policies en ninguna tabla, así que pasa a ver NADA; los roles
-- logueados ven EXACTAMENTE lo mismo que antes, porque hoy todos los SELECT
-- de tablas son using(true) — verificado con la matriz de las 106 vistas por
-- rol, firma md5 idéntica antes/después para admin · operador · finanzas ·
-- read-only · bar.
--
-- ── ⚠️ WATCH-LIST para la fase final de RLS (restricción de SELECT por rol) ──
--
-- Estas 11 vistas las leen FUNCIONES plpgsql por adentro (relevado contra
-- prosrc). Hoy el flag no las afecta: las funciones corren como authenticated
-- y todas las tablas les dan SELECT. Pero el día que un SELECT de tabla se
-- restrinja por rol, una función llamada por un rol restringido podría ver
-- VACÍO a través de ellas — y una invariante sobre un conjunto vacío pasa en
-- vacío (la lección de la Nota #1). Antes de restringir CUALQUIER SELECT de
-- sus tablas base, correr la suite de invariantes CON CADA ROL:
--
--   v_activo · v_anticipo_saldo · v_cashflow · v_cashflow_comprometido ·
--   v_deuda_detalle · v_dia_cancha_torneo · v_estado_cuota · v_ficha_torneo ·
--   v_gasto_detalle · v_presupuesto_total · v_saldo_caja
--
-- ── 1 · El flag, a todas ────────────────────────────────────────────────────
do $$
declare v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = true)', v.relname);
  end loop;
end $$;

-- ── 2 · Cinturón: anon sin SELECT sobre las vistas ──────────────────────────
--
-- Con el flag alcanza (anon no pasa ninguna RLS), pero la defensa doble es
-- barata: si mañana una vista nueva nace sin el flag —el error que esta
-- migración arregla 105 veces—, el revoke hace que anon tampoco la alcance.
-- Las tablas no necesitan esto: su RLS ya no nombra a anon en ninguna policy.
do $$
declare v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('revoke select on public.%I from anon', v.relname);
  end loop;
end $$;

-- Y que las PRÓXIMAS vistas/tablas nazcan sin el grant de anon: las
-- migraciones corren como postgres, así que es su default lo que se corrige.
alter default privileges for role postgres in schema public revoke select on tables from anon;

-- ── 3 · _prueba_marca con RLS, como todas ───────────────────────────────────
--
-- Era la única tabla de public sin RLS (ERROR del advisor). Está vacía desde
-- el 21/10 —el harness local la repuebla si hace falta— pero vacía-y-cerrada
-- es mejor que vacía-y-abierta. Sin policies: solo el server la toca, que es
-- exactamente su uso (seeds).
alter table public._prueba_marca enable row level security;
