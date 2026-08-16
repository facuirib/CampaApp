-- ═══════════════════════════════════════════════════════════════
-- BLOQUE 8 · cambiar_estado_cheque — caja elegible (revisión de Facu)
--
-- Responde a la revisión de Facu en coordinacion.md (14/08). Los 3 asientos
-- de cambiar_estado_cheque fueron APROBADOS (casos 1 y 3), con un solo
-- cambio pedido: la caja no va fija a CAJA_TRANSFERENCIA, tiene que ser
-- elegible — mismo patrón que registrar_movimiento_fondo (caso 4, también
-- aprobado), que ya resuelve la cuenta desde p_caja_id.
--
-- registrar_movimiento_fondo queda IGUAL — Facu la aprobó tal cual.
-- Esta migración reemplaza SOLO cambiar_estado_cheque.
--
-- El caso 2 (rechazo) sigue sin resolver acá — depende del eslabón
-- cheque↔pago (migración 20260814180000, aparte).
--
-- Cambio de firma (+1 param) → drop explícito de la versión vieja.
-- ═══════════════════════════════════════════════════════════════

drop function if exists cambiar_estado_cheque(uuid, text, date, uuid);

create or replace function public.cambiar_estado_cheque(
  p_cheque_id      uuid,
  p_nuevo_estado   text,
  p_caja_id        uuid default null,
  p_fecha          date default null,
  p_responsable_id uuid default null
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
  select id, sentido, estado, monto
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
  elsif p_nuevo_estado in ('rechazado','anulado') then
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

comment on function cambiar_estado_cheque(uuid, text, uuid, date, uuid) is
  'Cambia el estado de un cheque y genera el asiento de cierre cuando '
  'corresponde (acreditado/debitado). La caja es elegible por p_caja_id, no '
  'hardcodeada (revisión de Facu, 14/08). Rechazo/anulación sin asiento '
  'hasta que se resuelva el eslabón cheque↔pago.';