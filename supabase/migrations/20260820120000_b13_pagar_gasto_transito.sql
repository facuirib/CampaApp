-- ═══════════════════════════════════════════════════════════════
-- B13 (extensión) · pagar_gasto con medio efectivo_transito
-- PROPUESTA, NO APLICAR sin revisión de Facu.
--
-- Par simétrico de recibir_efectivo_en_transito (cobros): pagar_gasto
-- exige predio para efectivo, sin contemplar pagar en mano fuera de una
-- caja (ej. pagarle a un árbitro en la cancha antes de que exista caja
-- abierta ese día).
--
-- Reusa la cuenta EFECTIVO_EN_TRANSITO de B13. Se agrega como CUARTO
-- medio válido (efectivo | transferencia | cheque | efectivo_transito),
-- no reemplaza 'efectivo' — así el operador elige explícito cuándo hay
-- caja disponible y cuándo no.
--
-- El asiento: PROVEEDORES debe / EFECTIVO_EN_TRANSITO haber. No exige
-- predio. Cuando la plata efectivamente sale de una caja real más tarde
-- (alguien repone lo que pagó de su bolsillo, o retira para pagar), se
-- usa liquidar_efectivo_transito de B13 — mismo mecanismo que en cobros.
--
-- ✅ RESUELTO (Facu, 20/08): función SEPARADA reponer_efectivo_transito,
-- al final de este mismo archivo — no un parámetro de sentido en
-- liquidar_efectivo_transito. Mismo patrón que comprar_usd/vender_usd.
--
-- No cambia la firma de pagar_gasto — 'efectivo_transito' viaja por el
-- p_medio existente. El drop function queda igual (redundante pero
-- inofensivo con create or replace cuando la firma no cambia).
-- ═══════════════════════════════════════════════════════════════

drop function if exists pagar_gasto(uuid, text, date, uuid, uuid, text, text, date);

create or replace function public.pagar_gasto(
  p_gasto_id   uuid,
  p_medio      text,
  p_pagado_at  date,
  p_predio_id  uuid default null,
  p_created_by uuid default null,
  -- ── El eslabón del cheque emitido ────────────────────────────────────────
  -- Al final y con default null: la firma es aditiva y el pago normal no cambia.
  p_cheque_numero  text default null,
  p_cheque_banco   text default null,
  p_cheque_debito  date default null
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

  -- El medio se valida ANTES que el predio, como en registrar_cobro.
  if p_medio not in ('efectivo', 'transferencia', 'cheque', 'efectivo_transito') then
    raise exception
      'Medio de pago inválido: "%". Los válidos son efectivo, transferencia, cheque y efectivo_transito.', p_medio;
  end if;

  -- Un cheque sin número, banco y fecha de débito es un cheque que después no se
  -- puede seguir: no se sabe cuál se debitó, ni cuándo esperar que salga la
  -- plata. Se exige al pagar, que es cuando alguien tiene la chequera delante.
  if p_medio = 'cheque' then
    if p_cheque_numero is null or p_cheque_banco is null or p_cheque_debito is null then
      raise exception
        'Un pago con cheque necesita número, banco y fecha de débito esperada: '
        'sin esos datos no se puede seguir el cheque ni proyectar cuándo sale la plata.';
    end if;
  end if;

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
        'El predio % no tiene una caja de efectivo activa. Sin caja, el pago quedaría en el diario pero invisible en el saldo de caja.', v_predio_pago;
    end if;

    v_cuenta_caja := 'CAJA_EFECTIVO';

  elsif p_medio = 'efectivo_transito' then
    if p_predio_id is not null then
      raise exception 'efectivo_transito no lleva predio: todavía no hay caja involucrada.';
    end if;

    v_predio_pago := null;
    v_cuenta_caja := 'EFECTIVO_EN_TRANSITO';

  else
    if p_predio_id is not null then
      raise exception 'Solo el efectivo lleva predio. % es una caja global.', p_medio;
    end if;

    v_predio_pago := null;

    -- CHEQUES_A_PAGAR y no VALORES_A_DEPOSITAR: emitir un cheque cambia una
    -- deuda por otra. VALORES_A_DEPOSITAR es de cheques RECIBIDOS, y acreditarla
    -- acá la dejaba negativa. Además es la cuenta que cambiar_estado_cheque
    -- debita al debitarse el cheque: así las dos puntas conectan.
    v_cuenta_caja := case p_medio
                       when 'transferencia' then 'CAJA_TRANSFERENCIA'
                       when 'cheque'        then 'CHEQUES_A_PAGAR'
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

  -- ── El alta del cheque ───────────────────────────────────────────────────
  -- `fecha_emision` es cuándo se entregó (la fecha del pago) y `fecha_cobro`
  -- cuándo se espera que el banco lo debite: es la que lee
  -- v_cashflow_comprometido para proyectar el egreso.
  --
  -- `tercero_id` queda NULL: `gasto` no registra a quién se le paga. Es una
  -- limitación del modelo de gastos, no de este eslabón — el cashflow cae al
  -- fallback 'Cheque <numero>'.
  if p_medio = 'cheque' then
    insert into cheque (
      sentido, numero, banco, fecha_emision, fecha_cobro,
      monto, estado, gasto_id, asiento_alta_id
    ) values (
      'emitido', p_cheque_numero, p_cheque_banco, p_pagado_at, p_cheque_debito,
      v_total, 'pendiente', p_gasto_id, v_asiento_id
    );
  end if;

  return v_asiento_id;
end $function$;

comment on function public.pagar_gasto(uuid, text, date, uuid, uuid, text, text, date) is
  'Paga un gasto y genera su asiento. Con medio=cheque exige número, banco y '
  'fecha de débito, acredita CHEQUES_A_PAGAR en vez de una caja —la plata sale '
  'cuando el banco lo debita— y da de alta la fila en `cheque` con sentido '
  'emitido, vinculada por gasto_id. El cheque emitido pendiente se proyecta solo '
  'como egreso futuro en v_cashflow_comprometido, por su fecha_cobro. '
  'Medio efectivo_transito (B13, 20/08) agregado para pagos en efectivo sin '
  'caja de predio disponible — asienta contra EFECTIVO_EN_TRANSITO. '
  'La reposición usa reponer_efectivo_transito, más abajo en este mismo archivo.';

-- ═══════════════════════════════════════════════════════════════
-- reponer_efectivo_transito — RESUELTO (Facu, 20/08): función SEPARADA,
-- no parámetro de sentido en liquidar_efectivo_transito. Mismo patrón
-- que comprar_usd/vender_usd del proyecto — cuenta común, direcciones
-- opuestas, dos funciones con nombre que dice qué pasa.
--
-- Acá la plata SALE de una caja real para reponer a quien pagó de su
-- bolsillo (pagar_gasto medio efectivo_transito). No es espejo de
-- liquidar: ahí la plata entra porque alguien cobró; acá la contraparte
-- es una persona a la que hay que devolverle plata.
--
-- Asiento: EFECTIVO_EN_TRANSITO debe / CAJA_EFECTIVO (del predio) haber.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.reponer_efectivo_transito(
  p_gasto_id       uuid,
  p_predio_id      uuid,
  p_fecha          date default null,
  p_responsable_id uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_gasto   record;
  v_fecha   date;
  v_lineas  jsonb;
  v_asiento uuid;
begin
  select id, total, medio_pago, asiento_pag_id
    into v_gasto
    from gasto
   where id = p_gasto_id;

  if not found then
    raise exception 'El gasto % no existe', p_gasto_id;
  end if;

  if v_gasto.medio_pago <> 'efectivo_transito' then
    raise exception
      'El gasto % no se pagó con efectivo_transito (medio: %). No hay nada que reponer.',
      p_gasto_id, v_gasto.medio_pago;
  end if;

  if not exists (
    select 1 from caja k
     where k.tipo = 'efectivo' and k.activo and k.predio_id = p_predio_id
  ) then
    raise exception 'El predio % no tiene una caja de efectivo activa', p_predio_id;
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', 'EFECTIVO_EN_TRANSITO', 'debe',  v_gasto.total),
    jsonb_build_object('cuenta', 'CAJA_EFECTIVO',         'haber', v_gasto.total)
  );

  v_asiento := crear_asiento(
    p_fecha       => v_fecha,
    p_origen      => 'gasto_pago',
    p_descripcion => 'Reposición de efectivo en tránsito',
    p_lineas      => v_lineas,
    p_predio_id   => p_predio_id,
    p_origen_id   => p_gasto_id,
    p_created_by  => coalesce(p_responsable_id, auth.uid())
  );

  return v_asiento;
end;
$function$;

comment on function reponer_efectivo_transito(uuid, uuid, date, uuid) is
  'B13 extendida — repone desde una caja real el efectivo que alguien pagó de su bolsillo (pagar_gasto medio efectivo_transito). Función separada de liquidar_efectivo_transito (decisión de Facu, 20/08).';