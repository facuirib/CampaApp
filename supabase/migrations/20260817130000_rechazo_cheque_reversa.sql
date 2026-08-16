-- ═══════════════════════════════════════════════════════════════════════════
-- cambiar_estado_cheque · el rechazo deshace el cobro
--
-- ⚠️ PROPUESTA · NO APLICADA.
--
-- ── El hueco ───────────────────────────────────────────────────────────────
--
-- Hoy el rechazo hace `v_lineas := null` y sólo marca el estado del cheque. No
-- es un asiento mal hecho: **no hay asiento**. Era el caso 2 del bloque 8, que
-- quedó sin resolver a la espera del eslabón — y el eslabón ya está.
--
-- Con un cheque de $500.000 que rebota, hoy quedan tres cosas falsas:
--
--   · `VALORES_A_DEPOSITAR` con +$500.000: un activo que no existe, el papel no
--     vale. Y acumula: nada lo limpia nunca.
--   · el ingreso reconocido en `ING_*`, que nunca ocurrió.
--   · la cuota cancelada y el equipo sin deuda, así que nadie le reclama.
--
-- ── El arreglo ─────────────────────────────────────────────────────────────
--
-- **No se construye un asiento nuevo: se llama a `anular_asiento`** sobre el
-- asiento del cobro. Esa función toma las líneas del original y las invierte
-- —conservando `tercero_id`—, así que produce el espejo exacto:
--
--     ING_PARTIDOS            debe   500.000
--       VALORES_A_DEPOSITAR         haber  500.000
--
-- Y marca el original con `anulado_por`, así `/movimientos` lo muestra tachado
-- junto a su contraasiento. Regla 4 sin escribir una línea de asiento a mano.
--
-- El vínculo al asiento del cobro es **`cheque.asiento_alta_id`**: al cobrar,
-- `registrar_cobro` guarda ahí el mismo asiento que en `pago.asiento_id`. Se usa
-- el directo, sin pasar por `pago`.
--
-- ── Lo que anular_asiento NO hace ──────────────────────────────────────────
--
-- **No reabre la cuota.** Sólo escribe el contraasiento y marca el original; no
-- toca `pago` ni `pago_imputacion`. La cuota queda cancelada hasta que alguien
-- saque las imputaciones.
--
-- Por eso hace falta el `delete from pago_imputacion`: `trg_sync_cuota_pagada`
-- dispara en DELETE y `sync_cuota_pagada` recalcula `pagado_at` desde las
-- imputaciones que quedan. **La cuota se reabre sola**, sin tocarla a mano —
-- que es lo que la regla pide, porque `pagado_at` es derivado.
--
-- ── Por qué se borran las imputaciones y NO el pago ────────────────────────
--
-- Borrar el `pago` era la otra opción, y **la base lo impide**:
-- `cheque_pago_id_fkey` es NO ACTION, así que el delete falla mientras el cheque
-- lo referencie. Habría que anular el vínculo primero —perdiendo justo el
-- eslabón que se construyó para esto— o cambiar la FK.
--
-- Pero además no es lo que corresponde: **el pago ocurrió**. Alguien entregó un
-- cheque y se registró. Lo que falló fue el cheque. Borrar el pago borraría el
-- hecho; lo que hay que deshacer es su *efecto*, y de eso se ocupan el
-- contraasiento (lo contable) y el borrado de las imputaciones (lo operativo).
--
-- El pago queda como registro histórico, con su asiento anulado y su cheque
-- rechazado colgando. `pago_imputacion` en cero es coherente con eso: no imputó
-- nada, porque no entró plata.
--
-- ── Alcance ────────────────────────────────────────────────────────────────
--
-- Sólo cambia el branch de **rechazo**. `acreditado` y `debitado` quedan
-- idénticos. `anulado` también: sigue sin asiento, porque anular un cheque que
-- nunca llegó a cobrarse no tiene contraparte que revertir.
--
-- El responsable se propaga a `anular_asiento` (decisión 89), que a su vez lo
-- pasa a `crear_asiento`.
-- ═══════════════════════════════════════════════════════════════════════════

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
      p_responsable_id
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

comment on function public.cambiar_estado_cheque(uuid, text, uuid, date, uuid) is
  'Cambia el estado de un cheque. Acreditado/debitado generan su asiento con la '
  'caja elegible por p_caja_id. El RECHAZO deshace el cobro: anula su asiento '
  'con anular_asiento (espejo exacto, sin construir líneas a mano) y borra las '
  'imputaciones para que la cuota vuelva a deber por el trigger. El pago no se '
  'borra: ocurrió, y su asiento anulado ya lo deja sin efecto.';
