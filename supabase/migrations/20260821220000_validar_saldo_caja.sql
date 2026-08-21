-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ · validar_saldo_caja — no se saca efectivo que no está
-- PROPUESTA, NO APLICAR sin revisión (regla 11)
--
-- Migración APARTE de ③+④: otro circuito, otro riesgo. Ésta toca CINCO puertas
-- de pago que están en producción.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0 · El alcance real, medido ────────────────────────────────────────────
--
-- No es un bug de `pagar_gasto`. **Ninguna puerta que saca plata valida saldo**,
-- salvo `retirar_efectivo_bar`, que se escribió ayer. Recorriendo el diario en
-- orden cronológico:
--
--   CAJA_EFECTIVO       3 salidas · 2 dejan la caja NEGATIVA · peor: −1.708.000
--                       culpables: gasto_pago · socio
--   CAJA_TRANSFERENCIA  8 salidas · 4 dejan negativo · peor: −5.750.000
--                       culpables: socio · usd
--
-- Reproducido: pagar un gasto de $2.400.000 en efectivo desde Tirolesa, que
-- estaba en −$508.000, funcionó y la dejó en −$2.908.000.
--
--
-- ── La decisión: SOLO efectivo ─────────────────────────────────────────────
--
-- **Efectivo negativo es físicamente imposible.** No se pueden sacar más
-- billetes de los que hay en el cajón. Un saldo negativo ahí no es un
-- descubierto: es un error de carga, siempre.
--
-- **Transferencia negativa es un descubierto, y existe.** El peor caso
-- —−$5.750.000— es una COMPRA DE DÓLARES: una decisión deliberada, no un
-- error. Validarla bloquearía operaciones legítimas. `CAJA_USD` igual: su
-- control es el promedio ponderado, no el saldo.
--
-- Por eso la validación cubre CAJA_EFECTIVO, BAR_EFECTIVO y CAJA_CENTRAL, y
-- deja afuera CAJA_TRANSFERENCIA y CAJA_USD.
--
--
-- ── El límite que NO se blinda ─────────────────────────────────────────────
--
-- Se valida A LA FECHA DEL MOVIMIENTO, no contra el saldo de hoy — mismo
-- criterio que `retirar_efectivo_bar`. Eso hace que la carga en cualquier orden
-- funcione mientras cada movimiento tenga respaldo ese día.
--
-- Lo que NO cubre: un movimiento con fecha vieja puede pasar y aun así dejar
-- corto un día posterior. Blindarlo obligaría a revalidar toda la línea de
-- tiempo en cada alta, y a decidir qué hacer con el pasado ya escrito. Lo que
-- detecta ese caso es el ARQUEO, que para eso existe.
--
--
-- ── NO revalida lo existente ───────────────────────────────────────────────
--
-- Es una validación DENTRO de funciones, no un CHECK sobre la tabla: las filas
-- que ya están no se tocan. Tirolesa sigue en −$508.000 y CAJA_TRANSFERENCIA en
-- −$305.000 después de aplicar. La validación es para lo que venga.
--
-- (Mismo mecanismo que la migración de Horacio con check_gasto_coherente: un
-- `create or replace` de función no revalida el pasado.)


-- ── 1 · La función ─────────────────────────────────────────────────────────
-- Devuelve void y levanta excepción: es una guarda, no un predicado. Que el
-- que la llama tenga que decidir qué hacer con un `false` es cómo se olvida.

create or replace function public.validar_saldo_caja(
  p_cuenta    text,
  p_predio_id uuid,
  p_fecha     date,
  p_monto     numeric,
  p_contexto  text default null
)
returns void
language plpgsql
stable
as $function$
declare
  v_saldo  numeric(16,2);
  v_nombre text;
begin
  -- Las cuentas que NO son efectivo físico pasan sin control. Ver el bloque 0:
  -- el descubierto en transferencia es legítimo y en USD el control es otro.
  if p_cuenta not in ('CAJA_EFECTIVO', 'BAR_EFECTIVO', 'CAJA_CENTRAL') then
    return;
  end if;

  v_saldo := case p_cuenta
               when 'CAJA_EFECTIVO' then saldo_efectivo_predio(p_predio_id, p_fecha)
               when 'BAR_EFECTIVO'  then saldo_bar_predio(p_predio_id, p_fecha)
               -- La central es global: no tiene predio, así que se suma entera.
               when 'CAJA_CENTRAL'  then (
                 select coalesce(sum(l.debe - l.haber), 0)::numeric(16,2)
                   from asiento_linea l
                   join asiento a on a.id = l.asiento_id
                   join cuenta  c on c.id = l.cuenta_id
                  where c.codigo = 'CAJA_CENTRAL' and a.fecha <= p_fecha)
             end;

  if p_monto > v_saldo then
    select nombre into v_nombre from predio where id = p_predio_id;

    raise exception
      'No hay tanto efectivo. Se quiere sacar % de % al %, y hay %.%'
      ' Si la plata está, falta cargar el movimiento que la hizo entrar.',
      p_monto,
      coalesce(v_nombre, 'la caja central'),
      p_fecha,
      v_saldo,
      coalesce(' (' || p_contexto || ')', '');
  end if;
end;
$function$;

comment on function validar_saldo_caja(text, uuid, date, numeric, text) is
  'Guarda de saldo para las cuentas de efectivo FÍSICO — CAJA_EFECTIVO, '
  'BAR_EFECTIVO y CAJA_CENTRAL. Mide A LA FECHA del movimiento, no contra hoy. '
  'CAJA_TRANSFERENCIA y CAJA_USD pasan sin control a propósito: el descubierto '
  'bancario es legítimo (comprar_usd deja −5.750.000 deliberadamente) y en USD '
  'el control es el promedio ponderado. No revalida lo ya escrito.';


-- ── 2 · Las cinco puertas ──────────────────────────────────────────────────
-- ⚠️ NINGUNA cambia de firma: se agrega una llamada, no un parámetro. Así que
-- NO hace falta `drop function` y ninguna llamada existente se rompe. Es
-- deliberado, después de lo que pasó con crear_arqueo (ERROR 42725).
--
-- Se muestran solo los fragmentos que cambian; el cuerpo completo va en la
-- migración real. Las cinco son:
--
--   pagar_gasto                 CAJA_EFECTIVO haber, con predio
--   crear_retiro_socio          CAJA_EFECTIVO / CAJA_CENTRAL haber
--   comprar_usd                 CAJA_CENTRAL haber (medio='central')
--   reponer_efectivo_transito   CAJA_EFECTIVO haber, con predio
--   registrar_entrega_central   CAJA_EFECTIVO haber, por el CONTADO
--
-- `retirar_efectivo_bar` ya valida y NO se toca.
-- `asentar_diferencia_arqueo` NO se valida: un faltante baja la caja hasta lo
-- contado, que es ≥ 0 por construcción — nunca puede dejarla negativa. Y si
-- pudiera, bloquearlo sería impedir que el libro reconozca la realidad.
--
--
-- ── 2.a · registrar_entrega_central, el caso más interesante ───────────────
--
-- Es la puerta donde la validación CAMBIA UN COMPORTAMIENTO CONOCIDO, y por eso
-- va explicada: hoy entrega el CONTADO, así que con un SOBRANTE sin ajustar
-- saca más de lo que hay y deja la caja negativa (verificado: sistema
-- 1.120.000, contado 1.300.000 → saldo −180.000).
--
-- Con la guarda, ese caso pasa a fallar con un mensaje que dice qué hacer:
-- asentar la diferencia primero. Después del ajuste el saldo ES el contado, así
-- que la entrega pasa justo. **No bloquea ninguna entrega legítima: bloquea
-- exactamente la que dejaba la caja negativa.**

-- ── 2.a · pagar_gasto ──────────────────────────────────────────────────────
-- Cuerpo verbatim del aplicado (B13 + cheque), con UNA línea insertada en la
-- rama de efectivo, justo después de verificar que la caja existe y antes de
-- crear el asiento. Nada más cambia.

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

    -- ⑤ · No se saca efectivo que no está. A la fecha del PAGO, no a hoy.
    perform validar_saldo_caja('CAJA_EFECTIVO', v_predio_pago, p_pagado_at,
                               v_total, 'pago de gasto');

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

-- ── 2.b · crear_retiro_socio ───────────────────────────────────────────────
-- Verbatim, con la guarda antes del asiento. Cubre efectivo (con predio) y
-- central (global); transferencia pasa sin control, como corresponde.

create or replace function public.crear_retiro_socio(
  p_socio_id uuid, p_monto numeric, p_medio text,
  p_fecha date default null, p_predio_id uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_tipo text; v_nombre text; v_cuenta text; v_fecha date;
begin
  select tipo, nombre into v_tipo, v_nombre from tercero where id = p_socio_id;

  if not found then
    raise exception 'El tercero % no existe', p_socio_id;
  end if;
  if v_tipo <> 'socio' then
    raise exception 'El tercero % es de tipo "%": el retiro de sueldo es de un socio',
      p_socio_id, v_tipo;
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del retiro debe ser positivo (recibido: %)', p_monto;
  end if;

  v_cuenta := case p_medio
                when 'transferencia' then 'CAJA_TRANSFERENCIA'
                when 'central'       then 'CAJA_CENTRAL'
                when 'efectivo'      then 'CAJA_EFECTIVO'
              end;

  if v_cuenta is null then
    raise exception 'Medio "%" desconocido. Usá transferencia, central o efectivo.', p_medio;
  end if;

  -- crear_asiento ya exige predio para CAJA_EFECTIVO, pero el mensaje de acá
  -- dice qué hacer: si un socio se lleva efectivo de un predio y el asiento no
  -- lo declara, el arqueo de ese día no cuadra (§3.6).
  if p_medio = 'efectivo' and p_predio_id is null then
    raise exception
      'Un retiro en efectivo tiene que decir de qué predio salió la plata, o el '
      'arqueo de ese día no cierra. Para transferencia o caja central no hace falta.';
  end if;
  if p_medio <> 'efectivo' and p_predio_id is not null then
    raise exception 'Solo el retiro en efectivo de predio lleva predio_id.';
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  -- ⑤ · el socio no se puede llevar plata que no está en el cajón.
  perform validar_saldo_caja(v_cuenta, p_predio_id, v_fecha, p_monto,
                             'retiro de ' || v_nombre);

  return crear_asiento(
    v_fecha, 'socio', 'Retiro ' || v_nombre || ' · ' || p_medio,
    jsonb_build_array(
      jsonb_build_object('cuenta','SOCIOS_A_PAGAR','debe', p_monto, 'tercero_id', p_socio_id),
      jsonb_build_object('cuenta', v_cuenta, 'haber', p_monto)
    ),
    null,           -- torneo_id: estructura permanente, igual que el devengo
    null,           -- jornada_id
    p_predio_id,
    null
  );
end;
$function$;


-- ── 2.c · comprar_usd ──────────────────────────────────────────────────────
-- Solo cuando el medio es 'central'. Con 'transferencia' la guarda devuelve sin
-- hacer nada — y es el caso que dejó −5.750.000 a propósito.

create or replace function public.comprar_usd(
  p_fecha date, p_cantidad numeric, p_tc numeric,
  p_motivo text default null, p_medio text default 'transferencia'
)
returns uuid
language plpgsql
as $function$
declare
  v_cuenta text; v_pesos numeric(16,2); v_asiento uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad de dólares debe ser positiva (recibido: %)', p_cantidad;
  end if;
  if p_tc is null or p_tc <= 0 then
    raise exception 'El tipo de cambio debe ser positivo (recibido: %)', p_tc;
  end if;

  v_cuenta := case p_medio
                when 'transferencia' then 'CAJA_TRANSFERENCIA'
                when 'central'       then 'CAJA_CENTRAL'
              end;
  if v_cuenta is null then
    raise exception
      'Medio "%" desconocido. La compra de dólares sale de transferencia o de '
      'caja central — no de la caja de un predio.', p_medio;
  end if;

  v_pesos := round(p_cantidad * p_tc, 2);

  -- ⑤ · solo muerde con 'central'. Con transferencia la guarda no aplica.
  perform validar_saldo_caja(v_cuenta, null, p_fecha, v_pesos, 'compra de USD');

  v_asiento := crear_asiento(
    p_fecha, 'usd',
    'Compra USD ' || p_cantidad || ' @ ' || p_tc || coalesce(' · ' || p_motivo, ''),
    jsonb_build_array(
      jsonb_build_object('cuenta','CAJA_USD', 'debe',  v_pesos),
      jsonb_build_object('cuenta', v_cuenta,  'haber', v_pesos)
    ),
    null, null, null, null
  );

  insert into usd_operacion (fecha, tipo, cantidad, tc, monto_pesos, motivo, asiento_id)
  values (p_fecha, 'compra', p_cantidad, p_tc, v_pesos, p_motivo, v_asiento);

  return v_asiento;
end;
$function$;


-- ── 2.d · reponer_efectivo_transito ────────────────────────────────────────

create or replace function public.reponer_efectivo_transito(
  p_gasto_id uuid, p_predio_id uuid,
  p_fecha date default null, p_responsable_id uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_gasto record; v_fecha date; v_lineas jsonb; v_asiento uuid;
begin
  select id, total, medio_pago, asiento_pag_id into v_gasto
    from gasto where id = p_gasto_id;

  if not found then
    raise exception 'El gasto % no existe', p_gasto_id;
  end if;

  if v_gasto.medio_pago <> 'efectivo_transito' then
    raise exception
      'El gasto % no se pagó con efectivo_transito (medio: %). No hay nada que reponer.',
      p_gasto_id, v_gasto.medio_pago;
  end if;

  if not exists (
    select 1 from caja k where k.tipo = 'efectivo' and k.activo and k.predio_id = p_predio_id
  ) then
    raise exception 'El predio % no tiene una caja de efectivo activa', p_predio_id;
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  -- ⑤ · reponerle a alguien de su bolsillo sale de una caja que tiene que tener
  -- la plata. Si no la tiene, lo que falta es cargar lo que entró.
  perform validar_saldo_caja('CAJA_EFECTIVO', p_predio_id, v_fecha,
                             v_gasto.total, 'reposición de efectivo en tránsito');

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', 'EFECTIVO_EN_TRANSITO', 'debe',  v_gasto.total),
    jsonb_build_object('cuenta', 'CAJA_EFECTIVO',        'haber', v_gasto.total)
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


-- ── 2.e · registrar_entrega_central ────────────────────────────────────────
--
-- ⚠️ DEPENDE DE LA MIGRACIÓN ③+④ (20260821210000): esta versión incluye el
-- estado 'cerrado' y el chequeo de anulado. Aplicar en orden.
--
-- Es la puerta donde la guarda CAMBIA un comportamiento conocido: hoy entrega
-- el CONTADO, así que con un sobrante sin ajustar saca más de lo que hay
-- (verificado: sistema 1.120.000, contado 1.300.000 → saldo −180.000). Con la
-- guarda, ese caso falla con un mensaje que dice qué hacer.
--
-- **No bloquea ninguna entrega legítima**: después de asentar la diferencia el
-- saldo ES el contado, así que la entrega pasa justo.

create or replace function public.registrar_entrega_central(
  p_arqueo_id uuid, p_fecha date default null, p_responsable_id uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_arq record; v_fecha date; v_asiento uuid;
begin
  select a.id, a.estado, a.saldo_contado, a.ambito, a.anulado_at,
         dc.fecha as fecha_dia, dc.predio_id, p.codigo as predio
    into v_arq
  from arqueo a
  join dia_cancha dc on dc.id = a.dia_cancha_id
  join predio p on p.id = dc.predio_id
  where a.id = p_arqueo_id;

  if not found then
    raise exception 'El arqueo % no existe', p_arqueo_id;
  end if;
  if v_arq.anulado_at is not null then
    raise exception 'El arqueo % está anulado: no se entrega.', p_arqueo_id;
  end if;
  if v_arq.ambito <> 'torneo' then
    raise exception
      'La entrega a central es del arqueo del torneo. El efectivo del bar sale '
      'con retirar_efectivo_bar, que además admite banco como destino.';
  end if;
  if v_arq.estado = 'entregado' then
    raise exception 'El arqueo % ya fue entregado', p_arqueo_id;
  end if;
  if v_arq.estado = 'cerrado' then
    raise exception
      'El arqueo % está cerrado: contó cero, no hay efectivo que entregar.', p_arqueo_id;
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  if v_fecha < v_arq.fecha_dia then
    raise exception 'La entrega (%) no puede ser anterior al día arqueado (%)',
      v_fecha, v_arq.fecha_dia;
  end if;

  -- ⑤ · no se entrega plata que la caja no tiene. Si hay sobrante sin asentar,
  -- acá se frena y el mensaje del validador dice cuánto hay de verdad.
  perform validar_saldo_caja('CAJA_EFECTIVO', v_arq.predio_id, v_fecha,
                             v_arq.saldo_contado,
                             'entrega a central · asentá la diferencia primero');

  v_asiento := crear_asiento(
    v_fecha, 'arqueo',
    'Entrega a central · ' || v_arq.predio || ' · ' || v_arq.fecha_dia,
    jsonb_build_array(
      jsonb_build_object('cuenta', 'CAJA_CENTRAL',  'debe',  v_arq.saldo_contado),
      jsonb_build_object('cuenta', 'CAJA_EFECTIVO', 'haber', v_arq.saldo_contado)
    ),
    null, null, v_arq.predio_id, p_arqueo_id, p_responsable_id
  );

  update arqueo
     set estado = 'entregado', entregado_at = now(), asiento_entrega_id = v_asiento
   where id = p_arqueo_id;

  return v_asiento;
end;
$function$;
