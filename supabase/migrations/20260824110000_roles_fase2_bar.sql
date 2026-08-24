-- ═══════════════════════════════════════════════════════════════════════════
-- Roles · Fase 2 · el rol `bar` restringido a su circuito
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La Fase 1 dejó la allowlist en `['admin','operador','bar']` en las 79 de
-- escritura, así que `bar` podía escribir casi todo. Esta fase lo baja a su
-- módulo.
--
-- Pero **el circuito del bar escribe mucho más que `venta_bar`**, y eso hubo
-- que medirlo rompiéndolo primero. Con `bar` permitido solo en las dos tablas
-- obvias:
--
--     ① crear_dia_cancha    → new row violates RLS for table "dia_cancha"
--     ② registrar_venta_bar → new row violates RLS for table "asiento"
--
-- Se rompe en los dos primeros pasos. Y al destrabar eso apareció una tercera
-- tabla que no estaba en ninguna lista:
--
--     ③ registrar_venta_bar → new row violates RLS for table "periodo"
--
-- `crear_asiento` llama a `periodo_de_fecha()`, que **crea el período si no
-- existe**. No se ve al probar con fechas de meses ya abiertos: aparece la
-- primera vez que alguien asienta en un mes nuevo. Cualquier rol que escriba
-- algo lo necesita.
--
-- ── Las 11 que permiten `bar` ──────────────────────────────────────────────
--
--   venta_bar      I/U   la venta y su asiento_id
--   retiro_bar     I/U   el retiro y su asiento_id
--   asiento        I/U   toda operación asienta · U para anular
--   asiento_linea  I     las líneas del asiento
--   periodo        I     periodo_de_fecha lo crea si falta
--   dia_cancha     I     /bar/nuevo lo llama para el día de solo bar
--   arqueo         I/U   el arqueo del bar
--
-- Las otras **68** pasan a `['admin','operador']`.
--
-- ── `asiento.UPDATE` queda con `bar`, y es su forma DEFINITIVA ─────────────
--
-- Parece contradecir el modelo —«anular asientos: solo admin»— pero no: es la
-- resolución de una colisión que el relevamiento sacó a la luz.
--
-- `anular_venta_bar` llama a `anular_asiento`, que hace
-- `update asiento set anulado_por`. Lo mismo `anular_gasto`, `anular_arqueo`,
-- `anular_retiro_bar` y `cambiar_estado_cheque`: **cinco circuitos comparten
-- esa función, y `asiento.UPDATE` es su único punto de control**. Restringirlo
-- a admin no bloquearía «anular un asiento suelto»: bloquearía que el bar anule
-- su venta y que el operador anule un gasto.
--
-- Una policy sobre una tabla no distingue **por qué** se llegó a ella. La
-- restricción de admin va a vivir dentro de `anular_asiento` (Fase 3), no acá.
-- Por eso esta línea no se vuelve a tocar.
--
-- ── El `bar` puede crear un `dia_cancha` ───────────────────────────────────
--
-- Es la misma tabla que usa el circuito del torneo, así que Augusto podría
-- crear un día que después use otro. Es inofensivo —un `dia_cancha` es una
-- fecha y un predio, sin plata— y la alternativa sería que no pueda abrir el
-- bar un día sin fútbol, que es justo el caso que `/bar/nuevo` existe para
-- cubrir (decisión 56).

do $fase2$
declare
  p          record;
  v_con_bar  text := 'auth_rol() = any (array[''admin'', ''operador'', ''bar''])';
  v_sin_bar  text := 'auth_rol() = any (array[''admin'', ''operador''])';
  v_cond     text;
  v_con      int := 0;
  v_sin      int := 0;
  v_select   int;

  -- El circuito del bar, como pares (tabla, operación). Medido corriéndolo de
  -- punta a punta, no deducido de los nombres de las tablas.
  v_circuito text[] := array[
    'venta_bar:INSERT',  'venta_bar:UPDATE',
    'retiro_bar:INSERT', 'retiro_bar:UPDATE',
    'asiento:INSERT',    'asiento:UPDATE',
    'asiento_linea:INSERT',
    'periodo:INSERT',
    'dia_cancha:INSERT',
    'arqueo:INSERT',     'arqueo:UPDATE'
  ];
begin
  select count(*) into v_select from pg_policies where schemaname = 'public' and cmd = 'SELECT';

  for p in
    select tablename, policyname, cmd
      from pg_policies
     where schemaname = 'public'
       and cmd <> 'SELECT'          -- las 50 de SELECT no se tocan: nota #1
     order by tablename, policyname
  loop
    if (p.tablename || ':' || p.cmd) = any (v_circuito) then
      v_cond := v_con_bar;  v_con := v_con + 1;
    else
      v_cond := v_sin_bar;  v_sin := v_sin + 1;
    end if;

    execute format('drop policy %I on public.%I', p.policyname, p.tablename);

    if p.cmd = 'INSERT' then
      execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                     p.policyname, p.tablename, v_cond);
    elsif p.cmd = 'UPDATE' then
      execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                     p.policyname, p.tablename, v_cond, v_cond);
    else
      execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                     p.policyname, p.tablename, v_cond);
    end if;
  end loop;

  if v_select <> (select count(*) from pg_policies where schemaname='public' and cmd='SELECT') then
    raise exception 'El loop tocó policies de SELECT. Abortado: la nota #1 no se negocia.';
  end if;

  if v_con <> 11 then
    raise exception
      'Se esperaban 11 policies para el circuito del bar y quedaron %. '
      'Revisá v_circuito contra las policies existentes antes de aplicar.', v_con;
  end if;

  raise notice 'Fase 2: % con bar, % sin bar, % de SELECT intactas', v_con, v_sin, v_select;
end $fase2$;
