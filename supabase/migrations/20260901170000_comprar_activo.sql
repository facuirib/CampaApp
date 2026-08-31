-- ─────────────────────────────────────────────────────────────────────────────
-- comprar_activo: el activo nace capitalizado, o no nace
--
-- D1 commit 2, y D3.
--
-- ── El agujero que cierra ──────────────────────────────────────────────────
--
-- Hasta hoy dar de alta un activo y capitalizarlo eran DOS PASOS EN DOS
-- PANTALLAS: `/activos/nuevo` hacía un `insert` directo en `activo` —sin un
-- solo asiento— y después había que ir a `/gastos/nuevo`, elegir una categoría
-- de inversión y apuntarla al activo.
--
-- El trigger `check_gasto_coherente` exige el activo si el gasto es inversión,
-- pero NO al revés: nada obligaba a que un activo tuviera su compra.
--
-- Hoy los dos activos están capitalizados, así que el agujero está cerrado por
-- suerte. Si no lo estuviera, la consecuencia aparecería recién al amortizar:
-- `asentar_amortizacion` debitaría GAS_AMORT contra un BIENES_USO que nunca
-- existió — un gasto en el resultado por un bien que no está en los libros, y
-- un AMORT_ACUM acumulando contra nada.
--
-- Con esta función las dos cosas pasan en la misma transacción.
--
-- ── Por qué llama a registrar_gasto en vez de asentar por su cuenta ────────
--
-- Porque la compra ES un gasto de naturaleza inversión, y esa lógica —la
-- cuenta, el asiento, el vínculo con el asiento de devengo— ya vive ahí. Si
-- esta función armara su propio `crear_asiento`, habría dos lugares que saben
-- cómo se capitaliza un bien, y el día que uno cambie el otro queda viejo.
--
-- Además así la compra sigue teniendo su fila de `gasto`: es lo que sostiene la
-- cuenta a pagar al proveedor, el circuito de `pagar_gasto` y el compromiso en
-- el cashflow. Sacarle la fila de gasto a la compra sería perder todo eso.
--
-- ── Quién puede: admin y finanzas ──────────────────────────────────────────
--
-- 🔴 Esto ESTRECHA lo de hoy. Hasta ahora capitalizar pasaba por
-- `registrar_gasto`, que es admin/finanzas/operador, así que un operador podía
-- hacerlo.
--
-- La compra de un bien de uso es la salida más grande que el sistema registra
-- —la última fue de $50.000.000, contra un gasto de fecha típico de $50.000— y
-- compromete el resultado de los cinco años siguientes vía amortización. Es del
-- mismo peso que `comprar_usd` o `anular_asiento`, que ya son admin/finanzas.
--
-- El operador sigue pudiendo cargar gastos; lo que no puede es decidir que el
-- club compra un bien.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── D3 · el texto libre ────────────────────────────────────────────────────
alter table activo add column if not exists descripcion text;

comment on column activo.descripcion is
  'Texto libre: qué es, dónde está, número de serie, lo que haga falta para reconocerlo.';

create or replace function public.comprar_activo(
  p_nombre            text,
  p_categoria         text,
  p_valor             numeric,
  p_vida_util_meses   integer,
  p_cat_gasto_id      uuid,
  p_fecha             date,
  p_predio_id         uuid default null,
  p_proveedor_id      uuid default null,
  p_descripcion       text default null,
  p_created_by        uuid default null
) returns uuid
language plpgsql
as $$
declare
  v_user_id    uuid;
  v_naturaleza text;
  v_activo_id  uuid;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Comprar un activo es de administrador o finanzas. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El activo necesita un nombre';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'El valor del activo debe ser positivo (se recibió %)', p_valor;
  end if;

  -- La vida útil no es decorativa: `proponer_amortizaciones` divide por ella.
  -- Un cero acá sería una división por cero recién dentro de un mes.
  if p_vida_util_meses is null or p_vida_util_meses <= 0 then
    raise exception 'La vida útil en meses debe ser positiva (se recibió %)', p_vida_util_meses;
  end if;

  if p_fecha is null then
    raise exception 'La compra necesita fecha';
  end if;

  -- La categoría tiene que ser de inversión: es lo que hace que el asiento vaya
  -- a BIENES_USO y no al resultado. Con una categoría de gasto común, esta
  -- función capitalizaría en la tabla `activo` y mandaría la plata al P&L al
  -- mismo tiempo — el bien contado dos veces y de dos formas incompatibles.
  select naturaleza into v_naturaleza from cat_gasto where id = p_cat_gasto_id;

  if v_naturaleza is null then
    raise exception 'La categoría de gasto % no existe', p_cat_gasto_id;
  end if;

  if v_naturaleza <> 'inversion' then
    raise exception
      'La categoría elegida es de naturaleza «%», y comprar un activo necesita una de inversión.',
      v_naturaleza;
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable de la compra: se requiere p_created_by o sesión autenticada.';
  end if;

  insert into activo (
    nombre, categoria, predio_id, fecha_alta,
    valor_origen, vida_util_meses, estado, descripcion, created_by
  ) values (
    btrim(p_nombre), p_categoria, p_predio_id, p_fecha,
    p_valor, p_vida_util_meses, 'activo', nullif(btrim(p_descripcion), ''), v_user_id
  )
  returning id into v_activo_id;

  -- El gasto y su asiento, por la puerta que ya existe. `arancel * cantidad`
  -- con cantidad 1 es el valor: un activo se compra de a uno.
  perform registrar_gasto(
    p_cat_gasto_id   => p_cat_gasto_id,
    p_arancel        => p_valor,
    p_cantidad       => 1,
    p_devengado_at   => p_fecha,
    p_concepto_libre => btrim(p_nombre),
    p_predio_id      => p_predio_id,
    p_activo_id      => v_activo_id,
    p_created_by     => v_user_id,
    p_proveedor_id   => p_proveedor_id
  );

  return v_activo_id;
end;
$$;

comment on function comprar_activo(text, text, numeric, integer, uuid, date, uuid, uuid, text, uuid) is
  'Alta de activo CON su capitalización: crea el activo, su gasto de inversión y el asiento BIENES_USO/PROVEEDORES en una transacción. Guarda de rol adentro (activo.comprar).';
