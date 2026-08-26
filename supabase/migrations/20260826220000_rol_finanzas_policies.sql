-- ═══════════════════════════════════════════════════════════════════════════
-- Roles · el 5º rol: `finanzas` — las policies
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Finanzas es **admin menos tres cosas**: el bar, la estructura del torneo y la
-- administración de usuarios. Es potente a propósito — decisión de Facu — y por
-- eso entra en 58 de las 83 policies de escritura.
--
-- ── Por qué NO se reusa el `DO` de la Fase 2 ───────────────────────────────
--
-- Aquel reescribía las 83 con una condición uniforme, y funcionaba porque todas
-- tenían la misma forma. Ya no la tienen: `comprobante_insert` mezcla rol con
-- un predicado de columna —`tipo_comprobante = 0`— y un rewrite uniforme lo
-- **borraría**, dejando al operador emitiendo facturas ante ARCA.
--
-- Así que esta migración es quirúrgica: una lista explícita de 58 pares
-- `tabla:cmd`, y a cada policy se le **suma** el rol conservando los que ya
-- tenía. Los que no están en la lista no se tocan.
--
-- ── El alcance, derivado y no supuesto ─────────────────────────────────────
--
-- Se armó siguiendo el grafo de llamadas de cada circuito hasta las tablas que
-- termina escribiendo. Dos casos que solo aparecen midiendo:
--
--   · **`cuota.UPDATE` sí, `cuota.INSERT` no.** El INSERT lo hace
--     `crear_equipo_torneo` —crear la ficha, o sea estructura del torneo—. El
--     UPDATE lo hace `sync_cuota_pagada`, un trigger SECURITY INVOKER que corre
--     al imputar un cobro. Sin él, finanzas cobraría y la cuota quedaría impaga
--     **sin un solo error**: medido, el saldo va a 0 y `pagado_at` queda NULL.
--
--   · **Arqueo sí, `dia_cancha` no.** `/arqueo/nuevo` elige un día que ya
--     existe; el único que crea días es `/bar/nuevo`. Darle `dia_cancha` a
--     finanzas sería darle la puerta de entrada del bar por el costado.
--
-- Las 52 policies de SELECT no se tocan (nota #1) y la migración aborta si
-- alguna cambió.
-- ═══════════════════════════════════════════════════════════════════════════

do $finanzas$
declare
  p           record;
  v_roles     text[];
  v_cond      text;
  v_tocadas   int := 0;
  v_select_antes int;
  v_select_despues int;

  -- Las 58, por circuito. Cada par se midió; ninguno se dedujo del nombre.
  v_alcance text[] := array[
    -- Asienta: todo circuito que toca el diario necesita estas cuatro
    'asiento:INSERT', 'asiento:UPDATE', 'asiento_linea:INSERT', 'periodo:INSERT',
    -- Cobranza y clientes
    'pago:INSERT', 'pago:UPDATE', 'pago_imputacion:INSERT', 'pago_imputacion:DELETE',
    'anticipo:INSERT', 'anticipo:UPDATE', 'anticipo_uso:INSERT',
    'cuota:UPDATE',                       -- el trigger, no la ficha
    'plan_pago:INSERT', 'plan_pago:UPDATE',
    'reclamo:INSERT', 'plantilla_mail:INSERT', 'plantilla_mail:UPDATE',
    'tercero:INSERT', 'tercero:UPDATE',
    -- Gastos y caja
    'gasto:INSERT', 'gasto:UPDATE', 'cat_gasto:INSERT', 'cat_gasto:UPDATE',
    'gasto_planificado:INSERT', 'gasto_planificado:UPDATE',
    'compromiso:INSERT', 'compromiso:UPDATE',
    'caja:INSERT', 'caja:UPDATE', 'movimiento_fondo:INSERT',
    'cheque:INSERT', 'cheque:UPDATE',
    -- Activos y presupuesto
    'activo:INSERT', 'activo:UPDATE', 'amortizacion:INSERT', 'amortizacion:UPDATE',
    'presupuesto:INSERT', 'presupuesto:UPDATE',
    'presupuesto_linea:INSERT', 'presupuesto_linea:UPDATE', 'presupuesto_linea:DELETE',
    -- Cierre de período
    'periodo:UPDATE',
    -- Societario
    'contrato_sponsor:INSERT', 'contrato_sponsor:UPDATE',
    'cuota_cobro_sponsor:INSERT', 'cuota_cobro_sponsor:UPDATE', 'cuota_cobro_sponsor:DELETE',
    'devengo_socio:INSERT', 'devengo_sponsor:INSERT',
    'sueldo_socio:INSERT', 'sueldo_socio:UPDATE',
    -- USD (una de las tres sensibles)
    'usd_operacion:INSERT',
    -- Facturación
    'comprobante:UPDATE', 'condicion_iva_receptor:INSERT', 'condicion_iva_receptor:UPDATE',
    -- Arqueo: la caja física del torneo. SIN venta_bar/retiro_bar/dia_cancha
    'arqueo:INSERT', 'arqueo:UPDATE'
    -- 'comprobante:INSERT' va aparte: tiene predicado de columna
  ];
begin
  select count(*) into v_select_antes
    from pg_policies where schemaname = 'public' and cmd = 'SELECT';

  for p in
    select tablename, policyname, cmd, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and cmd <> 'SELECT'                       -- nota #1: no se tocan
       and (tablename || ':' || cmd) = any (v_alcance)
       and not (tablename = 'comprobante' and cmd = 'INSERT')
     order by tablename, policyname
  loop
    -- Se leen los roles que la policy YA tiene y se le suma finanzas. Así el
    -- `bar` de las cuatro compartidas sobrevive sin escribirlo a mano.
    select array_agg(distinct r order by r) into v_roles
      from regexp_matches(coalesce(p.qual, p.with_check),
                          '''(admin|operador|bar|finanzas)''', 'g') m(a),
           lateral unnest(m.a) r;

    if not ('finanzas' = any (v_roles)) then
      v_roles := array_append(v_roles, 'finanzas'::text);
    end if;

    -- Allowlist positiva: un rol que no está en el array no entra.
    select 'auth_rol() = any (array[' ||
           string_agg(quote_literal(r), ', ' order by r) || '])'
      into v_cond
      from unnest(v_roles) r;

    execute format('drop policy %I on public.%I', p.policyname, p.tablename);

    if p.cmd = 'INSERT' then
      execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                     p.policyname, p.tablename, v_cond);
    elsif p.cmd = 'UPDATE' then
      execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                     p.policyname, p.tablename, v_cond, v_cond);
    elsif p.cmd = 'DELETE' then
      execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                     p.policyname, p.tablename, v_cond);
    else
      raise exception 'Comando inesperado en %.%: %', p.tablename, p.policyname, p.cmd;
    end if;

    v_tocadas := v_tocadas + 1;
  end loop;

  -- ── `comprobante` a mano: rol Y predicado de columna ────────────────────
  --
  -- Finanzas emite facturas ante ARCA, como admin. El operador sigue pudiendo
  -- SOLO el recibo interno, y eso es el `tipo_comprobante = 0` que ningún
  -- rewrite automático debe tocar.
  drop policy comprobante_insert on public.comprobante;
  create policy comprobante_insert on public.comprobante
    for insert to authenticated
    with check (
      auth_rol() = any (array['admin', 'finanzas'])
      or (auth_rol() = 'operador' and tipo_comprobante = 0)
    );
  v_tocadas := v_tocadas + 1;

  -- ── Los dos chequeos de cierre ──────────────────────────────────────────
  select count(*) into v_select_despues
    from pg_policies where schemaname = 'public' and cmd = 'SELECT';

  if v_select_antes <> v_select_despues then
    raise exception 'Las policies de SELECT cambiaron (% → %). Nota #1: no se tocan.',
      v_select_antes, v_select_despues;
  end if;

  if exists (select 1 from pg_policies
              where schemaname = 'public' and cmd = 'SELECT' and qual <> 'true') then
    raise exception 'Alguna policy de SELECT dejó de ser using(true). Los invariantes del núcleo dependen de eso.';
  end if;

  if v_tocadas <> 58 then
    raise exception 'Se esperaban 58 policies con finanzas y se tocaron %', v_tocadas;
  end if;

  raise notice 'finanzas: % policies · SELECT intactas (%)', v_tocadas, v_select_despues;
end
$finanzas$;
