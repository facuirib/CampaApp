-- ═══════════════════════════════════════════════════════════════════════════
-- pagar_gasto — el medio se valida antes que el predio
--
-- Apareció probando el circuito, después de aplicar 20260809141359. La guarda
-- del predio corría primero, así que un medio inexistente acompañado de predio
-- —el caso de un llamador nuevo que manda cualquier cosa— contestaba
--
--     "Solo el efectivo lleva predio. bitcoin es una caja global."
--
-- El rechazo era correcto; el diagnóstico, no. Manda a sacar el predio, y
-- sacándolo el pago vuelve a fallar, ahora ya sin pista. registrar_cobro valida
-- el medio primero justamente por esto; acá quedan iguales.
--
-- El resto de la función no cambia.
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_predio_pago  uuid;
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

  -- El medio se valida ANTES que el predio, como en registrar_cobro. Al revés,
  -- un medio inexistente acompañado de predio contestaba "solo el efectivo
  -- lleva predio", que manda a corregir el campo equivocado: el operador iba a
  -- borrar el predio y a recibir el mismo rechazo, ahora sin pista de por qué.
  if p_medio not in ('efectivo', 'transferencia', 'cheque') then
    raise exception
      'Medio de pago inválido: "%". Los válidos son efectivo, transferencia y cheque.', p_medio;
  end if;

  -- ── Caja de destino y regla del predio ─────────────────────────────────
  -- Mismo criterio que registrar_cobro, incluida la verificación de que el
  -- predio tenga caja: sin ella el asiento se crea pero el movimiento no
  -- aparece en v_saldo_caja, que joinea contra `caja`. Plata que sale del
  -- diario y de ningún cajón.
  if p_medio = 'efectivo' then
    -- Comodidad deliberada: si no se indica predio, se usa el del gasto.
    v_predio_pago := coalesce(p_predio_id, v_gasto_predio);

    if v_predio_pago is null then
      raise exception 'El pago en efectivo requiere predio (para saber de qué caja sale).';
    end if;

    if not exists (
      select 1 from caja k
       where k.tipo = 'efectivo' and k.activo and k.predio_id = v_predio_pago
    ) then
      raise exception
        'El predio % no tiene una caja de efectivo activa. Sin caja, el pago '
        'quedaría en el diario pero invisible en el saldo de caja.', v_predio_pago;
    end if;

    v_cuenta_caja := 'CAJA_EFECTIVO';
  else
    -- Rechaza en vez de silenciar: quien mandó predio con transferencia se
    -- equivocó, y tiene que enterarse.
    if p_predio_id is not null then
      raise exception 'Solo el efectivo lleva predio. % es una caja global.', p_medio;
    end if;

    v_predio_pago := null;

    -- Sin `else`: el medio ya se validó arriba, así que acá el case es
    -- exhaustivo. Dejar una rama de error sería prometer una validación que
    -- nunca corre, y la próxima persona no sabría cuál de las dos manda.
    v_cuenta_caja := case p_medio
                       when 'transferencia' then 'CAJA_TRANSFERENCIA'
                       when 'cheque'        then 'VALORES_A_DEPOSITAR'
                     end;
  end if;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', 'PROVEEDORES', 'debe', v_total),
    jsonb_build_object('cuenta', v_cuenta_caja, 'haber', v_total)
  );

  v_asiento_id := crear_asiento(
    p_fecha       => p_pagado_at,
    p_origen      => 'gasto_pago',
    p_descripcion => 'Pago de gasto',
    p_lineas      => v_lineas,
    p_torneo_id   => v_torneo_id,
    p_jornada_id  => v_jornada_id,
    p_predio_id   => v_predio_pago,
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
  'Paga un gasto ya devengado: PROVEEDORES al debe, caja al haber. Valida el '
  'medio antes que el predio. Verifica que el predio tenga caja de efectivo '
  'activa, porque sin ella el movimiento no aparece en v_saldo_caja. Exige '
  'responsable: no hay fallback.';
