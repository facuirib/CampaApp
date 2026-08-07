-- ═══════════════════════════════════════════════════════════════
-- ESCRITURA DE GASTOS — preview_gasto + registrar_gasto + pagar_gasto
--
-- El circuito de escritura del módulo de gastos (encargo de Horacio).
-- El gasto son DOS asientos (concepto 5 del modelo):
--   · registrar_gasto → asiento de DEVENGO (Gasto / Proveedores) al cargar
--   · pagar_gasto      → asiento de PAGO (Proveedores / Caja) al pagar
--   · preview_gasto    → muestra el asiento de devengo en vivo (formulario)
--
-- Escritas espejando registrar_cobro + preview_cobro. Todas exigen
-- responsable sin fallback a auth.users (decisión 89). preview_gasto hecha
-- SIN los dos vicios de preview_cobro (nombre de cuenta + totales derivados).
--
-- ⚠️ TOCA EL MOTOR (llaman a crear_asiento). Pendiente de revisión y
-- aplicación de Facu (regla 11). No probada contra la base todavía.
--
-- Falta (siguiente): anular_gasto() — contraasienta el devengo y resuelve
-- el caso espejo. Va aparte.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.preview_gasto(
  p_cat_gasto_id uuid,
  p_total        numeric
)
returns jsonb
language plpgsql
stable
as $function$
declare
  v_cuenta_codigo text;
  v_cuenta_nombre text;
  v_lineas        jsonb;
  v_total_debe    numeric(16,2);
  v_total_haber   numeric(16,2);
  v_prov_nombre   text;
begin
  if p_total is null or p_total <= 0 then
    raise exception 'El total del gasto debe ser positivo (se recibió %)', p_total;
  end if;

  select c.codigo, c.nombre
    into v_cuenta_codigo, v_cuenta_nombre
    from cat_gasto cg
    join cuenta c on c.id = cg.cuenta_id
   where cg.id = p_cat_gasto_id;

  if v_cuenta_codigo is null then
    raise exception 'La categoría de gasto % no existe o no tiene cuenta asociada', p_cat_gasto_id;
  end if;

  select nombre into v_prov_nombre from cuenta where codigo = 'PROVEEDORES';

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_codigo, 'cuenta_nombre', v_cuenta_nombre, 'debe', p_total),
    jsonb_build_object('cuenta', 'PROVEEDORES', 'cuenta_nombre', v_prov_nombre, 'haber', p_total)
  );

  select
    coalesce(sum((l->>'debe')::numeric),  0),
    coalesce(sum((l->>'haber')::numeric), 0)
    into v_total_debe, v_total_haber
    from jsonb_array_elements(v_lineas) l;

  return jsonb_build_object(
    'lineas', v_lineas,
    'total_debe', v_total_debe,
    'total_haber', v_total_haber,
    'balanceado', v_total_debe = v_total_haber
  );
end $function$;

comment on function public.preview_gasto(uuid, numeric) is
  'Preview del asiento de devengo de un gasto. STABLE, solo lee. Devuelve nombre de cuenta y totales derivados. Espeja registrar_gasto.';


create or replace function public.registrar_gasto(
  p_cat_gasto_id   uuid,
  p_arancel        numeric,
  p_cantidad       numeric,
  p_devengado_at   date,
  p_concepto_id    uuid   default null,
  p_concepto_libre text   default null,
  p_torneo_id      uuid   default null,
  p_jornada_id     uuid   default null,
  p_predio_id      uuid   default null,
  p_created_by     uuid   default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id       uuid;
  v_total         numeric(16,2);
  v_cuenta_codigo text;
  v_gasto_id      uuid;
  v_asiento_id    uuid;
  v_lineas        jsonb;
begin
  if p_arancel is null or p_arancel <= 0 then
    raise exception 'El arancel del gasto debe ser positivo (se recibió %)', p_arancel;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad del gasto debe ser positiva (se recibió %)', p_cantidad;
  end if;

  if p_devengado_at is null then
    raise exception 'El gasto necesita fecha de devengado (cuándo se reconoce)';
  end if;

  if (p_concepto_id is null) = (p_concepto_libre is null) then
    raise exception 'El gasto necesita concepto_id (del catálogo) o concepto_libre (texto), exactamente uno.';
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable del gasto: se requiere p_created_by o sesión autenticada.';
  end if;

  select c.codigo into v_cuenta_codigo
    from cat_gasto cg
    join cuenta c on c.id = cg.cuenta_id
   where cg.id = p_cat_gasto_id;

  if v_cuenta_codigo is null then
    raise exception 'La categoría de gasto % no existe o no tiene cuenta asociada', p_cat_gasto_id;
  end if;

  v_total := p_arancel * p_cantidad;

  insert into gasto (
    cat_gasto_id, concepto_id, concepto_libre,
    torneo_id, jornada_id, predio_id,
    arancel, cantidad, devengado_at
  ) values (
    p_cat_gasto_id, p_concepto_id, p_concepto_libre,
    p_torneo_id, p_jornada_id, p_predio_id,
    p_arancel, p_cantidad, p_devengado_at
  ) returning id into v_gasto_id;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_codigo, 'debe', v_total),
    jsonb_build_object('cuenta', 'PROVEEDORES', 'haber', v_total)
  );

  v_asiento_id := crear_asiento(
    p_fecha       => p_devengado_at,
    p_origen      => 'devengo_gasto',
    p_descripcion => 'Devengo de gasto',
    p_lineas      => v_lineas,
    p_torneo_id   => p_torneo_id,
    p_jornada_id  => p_jornada_id,
    p_predio_id   => p_predio_id,
    p_origen_id   => v_gasto_id,
    p_created_by  => v_user_id
  );

  update gasto set asiento_dev_id = v_asiento_id where id = v_gasto_id;

  return v_gasto_id;
end $function$;

comment on function public.registrar_gasto(uuid, numeric, numeric, date, uuid, text, uuid, uuid, uuid, uuid) is
  'Carga un gasto y genera su asiento de devengo. No paga: pagado_at null. Exige responsable sin fallback. El pago lo hace pagar_gasto().';


create or replace function public.pagar_gasto(
  p_gasto_id    uuid,
  p_medio       text,
  p_pagado_at   date,
  p_predio_id   uuid default null,
  p_created_by  uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id      uuid;
  v_total        numeric(16,2);
  v_pagado_at    date;
  v_torneo_id    uuid;
  v_jornada_id   uuid;
  v_gasto_predio uuid;
  v_cuenta_caja  text;
  v_asiento_id   uuid;
  v_lineas       jsonb;
begin
  select g.total, g.pagado_at, g.torneo_id, g.jornada_id, g.predio_id
    into v_total, v_pagado_at, v_torneo_id, v_jornada_id, v_gasto_predio
    from gasto g
   where g.id = p_gasto_id;

  if not found then
    raise exception 'El gasto % no existe', p_gasto_id;
  end if;

  if v_pagado_at is not null then
    raise exception 'El gasto % ya está pagado (el %). No se paga dos veces.', p_gasto_id, v_pagado_at;
  end if;

  if p_pagado_at is null then
    raise exception 'El pago necesita fecha (p_pagado_at)';
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable del pago: se requiere p_created_by o sesión autenticada.';
  end if;

  if p_medio = 'efectivo' then
    v_gasto_predio := coalesce(p_predio_id, v_gasto_predio);
    if v_gasto_predio is null then
      raise exception 'El pago en efectivo requiere predio (para saber de qué caja sale).';
    end if;
    v_cuenta_caja := 'CAJA_EFECTIVO';
  elsif p_medio = 'transferencia' then
    v_cuenta_caja := 'CAJA_TRANSFERENCIA';
    v_gasto_predio := null;
  elsif p_medio = 'cheque' then
    v_cuenta_caja := 'VALORES_A_DEPOSITAR';
    v_gasto_predio := null;
  else
    raise exception 'Medio de pago inválido: "%". Los válidos son efectivo, transferencia y cheque.', p_medio;
  end if;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', 'PROVEEDORES', 'debe', v_total),
    jsonb_build_object('cuenta', v_cuenta_caja, 'haber', v_total)
  );

  v_asiento_id := crear_asiento(
    p_fecha       => p_pagado_at,
    p_origen      => 'pago_gasto',
    p_descripcion => 'Pago de gasto',
    p_lineas      => v_lineas,
    p_torneo_id   => v_torneo_id,
    p_jornada_id  => v_jornada_id,
    p_predio_id   => v_gasto_predio,
    p_origen_id   => p_gasto_id,
    p_created_by  => v_user_id
  );

  update gasto
     set pagado_at = p_pagado_at,
         medio_pago = p_medio,
         asiento_pag_id = v_asiento_id
   where id = p_gasto_id;

  return v_asiento_id;
end $function$;

comment on function public.pagar_gasto(uuid, text, date, uuid, uuid) is
  'Paga un gasto ya devengado: asiento PROVEEDORES (debe) / caja (haber). Falla si ya está pagado. Exige responsable sin fallback.';