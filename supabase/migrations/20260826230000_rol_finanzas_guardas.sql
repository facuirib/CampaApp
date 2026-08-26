-- ═══════════════════════════════════════════════════════════════════════════
-- Roles · `finanzas` en las dos guardas que no son policies
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Anular un asiento suelto y rechazar un cheque no se separan por policy:
-- comparten función con operaciones que otros roles sí pueden. La restricción
-- vive adentro del plpgsql desde la Fase 3b, y acá se le suma `finanzas` — dos
-- de las tres sensibles que Facu le dio (la tercera, USD, sí es una policy).
--
-- **Allowlist positiva, no `<> all`.** `not (rol = any (array[...]))` deniega a
-- todo lo que no esté escrito, incluido un typo. Misma regla que las policies.
--
-- ── Dos funciones, no seis: la firma NO cambia ─────────────────────────────
--
-- La Fase 3b tuvo que tocar las seis porque **agregaba un parámetro**
-- (`p_via_circuito`), y agregar un parámetro sobrecarga en vez de reemplazar:
-- hacía falta `drop` + recrear los cinco llamadores para que no quedaran
-- apuntando a una firma muerta.
--
-- Acá sólo cambia el cuerpo. `create or replace` reemplaza en el lugar, la
-- firma queda idéntica y **los cinco llamadores no se tocan**: siguen pasando
-- `p_via_circuito => true` a la misma función. Menos superficie, menos riesgo.
--
-- El resto del cuerpo se copió EXACTO de `20260824184544`: lo único distinto
-- son las dos líneas de guarda y sus mensajes.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.anular_asiento(
  p_asiento_id    uuid,
  p_motivo        text,
  p_fecha         date default null,
  p_created_by    uuid default null,
  p_via_circuito  boolean default false
)
returns uuid
language plpgsql
as $function$
declare
  v_orig    record;
  v_nuevo   uuid;
  v_lineas  jsonb;
begin
  -- ── La guarda va PRIMERA ────────────────────────────────────────────────
  --
  -- Antes del `select`, para que un no-admin ni siquiera llegue a leer el
  -- asiento. Y el mensaje manda a la pantalla del circuito en vez de decir
  -- sólo «no podés»: el que llega acá casi seguro quería revertir un gasto o
  -- una venta, no anular un asiento contable.
  if not p_via_circuito
     and not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Anular un asiento suelto es una operación de administración o finanzas. '
      'Tu rol es «%». Para revertir un gasto, una venta del bar, un retiro o un '
      'arqueo, usá la pantalla de ese circuito: ahí la anulación la hace la '
      'función correspondiente.',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select * into v_orig from asiento where id = p_asiento_id;

  if not found then
    raise exception 'El asiento % no existe', p_asiento_id;
  end if;

  if v_orig.anulado_por is not null then
    raise exception 'El asiento % ya fue anulado', p_asiento_id;
  end if;

  if exists (select 1 from asiento where anulado_por = p_asiento_id) then
    raise exception
      'El asiento % es un contraasiento y no se puede anular', p_asiento_id;
  end if;

  select jsonb_agg(jsonb_build_object(
           'cuenta',     c.codigo,
           'debe',       l.haber,
           'haber',      l.debe,
           'tercero_id', l.tercero_id
         ))
    into v_lineas
    from asiento_linea l
    join cuenta c on c.id = l.cuenta_id
   where l.asiento_id = p_asiento_id;

  v_nuevo := crear_asiento(
    -- ── El coalesce que faltaba ──────────────────────────────────────────
    --
    -- Antes se pasaba `p_fecha` crudo. Cuatro de los cinco llamadores lo
    -- protegían con `coalesce(p_fecha, current_date)`; **`anular_gasto` no**.
    -- Con fecha NULL, `periodo_de_fecha` busca
    -- `where p_fecha between fecha_desde and fecha_hasta`, no matchea ningún
    -- ejercicio, y sale «No hay ejercicio que contenga la fecha» — un mensaje
    -- que no dice nada del gasto que se quiso anular.
    --
    -- Se cierra acá, para los siete llamadores de una vez. Y el default es la
    -- fecha del asiento original, no `current_date`: el contraasiento de algo
    -- de agosto pertenece a agosto, no al día en que alguien lo anuló.
    coalesce(p_fecha, v_orig.fecha),
    'ajuste',
    'Anulación: ' || v_orig.descripcion || ' · ' || p_motivo,
    v_lineas,
    v_orig.torneo_id,
    v_orig.jornada_id,
    v_orig.predio_id,
    p_asiento_id,
    p_created_by
  );

  update asiento set anulado_por = v_nuevo where id = p_asiento_id;

  return v_nuevo;
end;
$function$;

create or replace function public.cambiar_estado_cheque(
  p_cheque_id uuid, p_nuevo_estado text, p_caja_id uuid default null,
  p_fecha date default null, p_responsable_id uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_ch          record;
  v_fecha       date;
  v_cuenta_caja text;
  v_lineas      jsonb;
  v_asiento     uuid;
begin
  -- ── La guarda del rechazo ───────────────────────────────────────────────
  if p_nuevo_estado = 'rechazado'
     and not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Rechazar un cheque revierte el cobro y reabre la deuda del equipo: es '
      'una operación de administración o finanzas. Tu rol es «%». Acreditar, '
      'debitar y anular sí podés.',
      coalesce(auth_rol(), 'sin rol');
  end if;

  -- Se agregan asiento_alta_id, pago_id y numero: el rechazo los necesita.
  select id, sentido, estado, monto, asiento_alta_id, pago_id, numero
    into v_ch
  from cheque
  where id = p_cheque_id;

  if not found then
    raise exception 'El cheque % no existe', p_cheque_id;
  end if;

  if v_ch.estado <> 'pendiente' then
    raise exception 'El cheque ya está en estado %', v_ch.estado;
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  if p_nuevo_estado in ('acreditado', 'debitado') then
    if p_caja_id is null then
      raise exception
        'Acreditar o debitar un cheque necesita indicar a qué caja va — no '
        'hay una caja por defecto.';
    end if;

    select cu.codigo
      into v_cuenta_caja
    from caja c
    join cuenta cu on cu.id = c.cuenta_id
    where c.id = p_caja_id;

    if not found then
      raise exception 'La caja % no existe o no tiene cuenta asociada', p_caja_id;
    end if;
  end if;

  if v_ch.sentido = 'recibido' and p_nuevo_estado = 'acreditado' then
    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta', v_cuenta_caja,        'debe',  v_ch.monto),
      jsonb_build_object('cuenta', 'VALORES_A_DEPOSITAR','haber', v_ch.monto)
    );

  elsif v_ch.sentido = 'emitido' and p_nuevo_estado = 'debitado' then
    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta', 'CHEQUES_A_PAGAR', 'debe',  v_ch.monto),
      jsonb_build_object('cuenta', v_cuenta_caja,      'haber', v_ch.monto)
    );

  -- ── RECHAZO · deshace el cobro ───────────────────────────────────────────
  elsif p_nuevo_estado = 'rechazado' then
    if v_ch.sentido <> 'recibido' then
      raise exception
        'Sólo se rechaza un cheque recibido. Un cheque emitido que el banco no '
        'paga se maneja distinto: la deuda con el proveedor sigue viva.';
    end if;

    -- Sin el asiento del cobro no hay nada que revertir, y marcar el cheque
    -- igual dejaría el activo fantasma en VALORES_A_DEPOSITAR sin aviso.
    if v_ch.asiento_alta_id is null then
      raise exception
        'El cheque % no tiene asiento de alta, así que no hay cobro que '
        'deshacer. Si se cargó por fuera de registrar_cobro, revisalo a mano.',
        p_cheque_id;
    end if;

    -- El espejo exacto del cobro: invierte sus líneas y marca el original.
    v_asiento := anular_asiento(
      v_ch.asiento_alta_id,
      'Cheque rechazado' || coalesce(' · ' || v_ch.numero, ''),
      v_fecha,
      p_responsable_id,
      true
    );

    -- Lo operativo: sacar las imputaciones para que la cuota vuelva a deber.
    -- No se toca `cuota`: pagado_at es derivado y trg_sync_cuota_pagada lo
    -- recalcula en el DELETE. Si el pago imputó varias cuotas, se reabren
    -- todas — es correcto, el cheque las cubría a todas.
    if v_ch.pago_id is not null then
      delete from pago_imputacion where pago_id = v_ch.pago_id;
    end if;

    -- El asiento ya está hecho por anular_asiento: no hay líneas propias.
    v_lineas := null;

  elsif p_nuevo_estado = 'anulado' then
    -- Sin contraparte que revertir: un cheque anulado nunca llegó a cobrarse.
    v_lineas := null;

  else
    raise exception 'Transición no válida: % → %', v_ch.estado, p_nuevo_estado;
  end if;

  if v_lineas is not null then
    v_asiento := crear_asiento(
      v_fecha, 'cheque',
      'Cheque ' || v_ch.sentido || ' · ' || p_nuevo_estado,
      v_lineas, null, null, null, p_cheque_id, p_responsable_id
    );
  end if;

  update cheque
     set estado = p_nuevo_estado,
         fecha_estado = v_fecha,
         asiento_cierre_id = coalesce(v_asiento, asiento_cierre_id)
   where id = p_cheque_id;

  return v_asiento;
end;
$function$;
