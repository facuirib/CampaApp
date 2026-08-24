-- ═══════════════════════════════════════════════════════════════════════════
-- Roles · Fase 3b · las dos operaciones que NO se separan por policy
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Anular un asiento suelto y rechazar un cheque son «solo admin» en el modelo,
-- pero **ninguna policy puede expresarlo**: las dos comparten función con
-- operaciones que otros roles sí pueden.
--
--   · `anular_asiento` la usan CINCO circuitos —gasto, venta de bar, retiro de
--     bar, arqueo y el rechazo de cheque— y `asiento.UPDATE` es su único punto
--     de control. Restringirlo a admin no bloquearía «anular un asiento
--     suelto»: bloquearía que el bar anule su venta y el operador su gasto.
--
--   · `cambiar_estado_cheque` hace las cuatro transiciones —acreditar,
--     debitar, anular y rechazar— y `cheque.UPDATE` no distingue cuál.
--
-- **Una policy sobre una tabla no distingue por qué se llegó a ella.** Por eso
-- la restricción vive acá, en la función.
--
-- ── Por qué no fue un `revoke`, que era el plan ────────────────────────────
--
-- Se probó y rompe las cinco. Son `SECURITY INVOKER`, así que llamar a
-- `anular_asiento` requiere `EXECUTE` **como el usuario que llama**: sacarle el
-- permiso a `authenticated` se lo saca también a las funciones que corren con
-- su rol. Medido: llamada directa `permission denied` ✅, `anular_gasto`
-- `permission denied` 🔴.
--
-- (Y una trampa que costó descubrir: el primer `revoke` **no hizo nada**,
-- porque las funciones tienen un grant a `PUBLIC` del que `authenticated` es
-- miembro. Hay que revocar a `PUBLIC` también.)
--
-- Hacerlas `SECURITY DEFINER` se descartó: escaparían RLS por completo y
-- `anular_gasto` dejaría de pasar por las policies de `gasto` — sería romper el
-- modelo de roles para proteger una función.
--
-- ── Las seis van JUNTAS ────────────────────────────────────────────────────
--
-- El estado intermedio es el peligroso: con la guarda puesta y los llamadores
-- sin el flag, **anular un gasto queda roto para el operador**. Verificado en
-- rollback. Por eso una sola migración: o están las seis o no está ninguna.
--
-- De las cinco que llaman, **sólo cambia la línea de la llamada**. El cuerpo se
-- copió exacto. Son SIETE puntos, no cinco: `anular_gasto` y `anular_arqueo`
-- llaman dos veces cada una —un gasto tiene devengo y pago, un arqueo puede
-- tener entrega y ajuste—.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · anular_asiento — la guarda y el arreglo de la fecha
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Agregar un parámetro **sobrecarga en vez de reemplazar**, así que va con
-- `drop` primero. El `default false` es lo que deja la puerta cerrada por
-- omisión: quien no sabe del flag, no pasa.

drop function if exists public.anular_asiento(uuid, text, date, uuid);

create function public.anular_asiento(
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
  if not p_via_circuito and coalesce(auth_rol(), '') <> 'admin' then
    raise exception
      'Anular un asiento suelto es una operación de administrador. Tu rol es '
      '«%». Para revertir un gasto, una venta del bar, un retiro o un arqueo, '
      'usá la pantalla de ese circuito: ahí la anulación la hace la función '
      'correspondiente.',
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

comment on function anular_asiento(uuid, text, date, uuid, boolean) is
  'Contraasienta un asiento y marca el original. p_via_circuito lo pasan en true las cinco funciones de circuito (anular_gasto, anular_venta_bar, anular_retiro_bar, anular_arqueo, cambiar_estado_cheque); una llamada directa lo deja en false y exige admin. No se resolvió con un revoke porque las cinco son SECURITY INVOKER: sacarle EXECUTE a authenticated se lo saca también a ellas.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · anular_gasto — DOS puntos de llamada (pago y devengo)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.anular_gasto(
  p_gasto_id uuid, p_motivo text, p_fecha date default current_date, p_created_by uuid default null
)
returns void
language plpgsql
as $function$
declare
  v_user_id      uuid;
  v_asiento_dev  uuid;
  v_asiento_pag  uuid;
  v_pagado_at    date;
  v_dev_anulado  uuid;
begin
  select g.asiento_dev_id, g.asiento_pag_id, g.pagado_at, adev.anulado_por
    into v_asiento_dev, v_asiento_pag, v_pagado_at, v_dev_anulado
    from gasto g
    left join asiento adev on adev.id = g.asiento_dev_id
   where g.id = p_gasto_id;

  if not found then
    raise exception 'El gasto % no existe', p_gasto_id;
  end if;

  if v_dev_anulado is not null then
    raise exception 'El gasto % ya está anulado', p_gasto_id;
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'La anulación necesita un motivo';
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable de la anulación: se requiere p_created_by o sesión autenticada.';
  end if;

  -- Sin asiento de devengo no hay qué contraasentar, y marcarlo igual dejaría
  -- un gasto que la vista sigue mostrando como vigente. Falla ruidoso.
  if v_asiento_dev is null then
    raise exception
      'El gasto % no tiene asiento de devengo, así que no hay qué contraasentar. Si se cargó por fuera de registrar_gasto, revisalo a mano.',
      p_gasto_id;
  end if;

  -- Pago primero, devengo después: orden inverso al de creación.
  if v_pagado_at is not null then
    if v_asiento_pag is not null then
      perform anular_asiento(
        v_asiento_pag, 'Anulación de gasto (pago) · ' || p_motivo, p_fecha, v_user_id, true);
    end if;

    update gasto
       set pagado_at = null, medio_pago = null, asiento_pag_id = null
     where id = p_gasto_id;
  end if;

  perform anular_asiento(
    v_asiento_dev, 'Anulación de gasto (devengo) · ' || p_motivo, p_fecha, v_user_id, true);
end;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · anular_venta_bar — un punto
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.anular_venta_bar(
  p_venta_id uuid, p_motivo text, p_fecha date default null, p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_venta   record;
  v_user_id uuid;
  v_asiento uuid;
begin
  select id, asiento_id, anulado_at
    into v_venta
    from venta_bar
   where id = p_venta_id;

  if not found then
    raise exception 'El cierre de bar % no existe', p_venta_id;
  end if;

  if v_venta.anulado_at is not null then
    raise exception 'El cierre % ya está anulado (el %)',
      p_venta_id, v_venta.anulado_at::date;
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'La anulación necesita motivo: es lo único que explica el contraasiento.';
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable de la anulación: se requiere p_created_by o sesión autenticada.';
  end if;

  if v_venta.asiento_id is null then
    raise exception 'El cierre % no tiene asiento. Es un estado imposible '
                    '(registrar_venta_bar siempre lo escribe) — revisar antes de seguir.',
                    p_venta_id;
  end if;

  v_asiento := anular_asiento(
    v_venta.asiento_id,
    'Anulación de cierre de bar: ' || p_motivo,
    coalesce(p_fecha, current_date),
    v_user_id,
    true
  );

  update venta_bar
     set anulado_at     = now(),
         anulado_motivo = p_motivo
   where id = p_venta_id;

  return v_asiento;
end;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · anular_retiro_bar — un punto
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.anular_retiro_bar(
  p_retiro_id uuid, p_motivo text, p_fecha date default null, p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_retiro  record;
  v_user_id uuid;
  v_asiento uuid;
begin
  select id, asiento_id, anulado_at into v_retiro from retiro_bar where id = p_retiro_id;

  if not found then
    raise exception 'El retiro % no existe', p_retiro_id;
  end if;

  if v_retiro.anulado_at is not null then
    raise exception 'El retiro % ya está anulado', p_retiro_id;
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'La anulación necesita motivo: es lo único que explica el contraasiento.';
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable de la anulación: se requiere p_created_by o sesión autenticada.';
  end if;

  if v_retiro.asiento_id is null then
    raise exception 'El retiro % no tiene asiento. Es un estado imposible — revisar.', p_retiro_id;
  end if;

  v_asiento := anular_asiento(
    v_retiro.asiento_id,
    'Anulación de retiro de bar: ' || p_motivo,
    coalesce(p_fecha, current_date),
    v_user_id,
    true
  );

  update retiro_bar
     set anulado_at = now(), anulado_motivo = p_motivo
   where id = p_retiro_id;

  return v_asiento;
end;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · anular_arqueo — DOS puntos (entrega y ajuste), los dos condicionales
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.anular_arqueo(
  p_arqueo_id uuid, p_motivo text, p_fecha date default null, p_created_by uuid default null
)
returns integer
language plpgsql
as $function$
declare
  v_arq       record;
  v_user_id   uuid;
  v_fecha     date;
  v_revertidos int := 0;
begin
  select a.id, a.estado, a.anulado_at, a.asiento_ajuste_id, a.asiento_entrega_id,
         dc.fecha as fecha_dia
    into v_arq
  from arqueo a join dia_cancha dc on dc.id = a.dia_cancha_id
  where a.id = p_arqueo_id;

  if not found then
    raise exception 'El arqueo % no existe', p_arqueo_id;
  end if;

  if v_arq.anulado_at is not null then
    raise exception 'El arqueo % ya está anulado (el %)',
      p_arqueo_id, v_arq.anulado_at::date;
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'La anulación necesita motivo: es lo único que explica los contraasientos.';
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable de la anulación: se requiere p_created_by o sesión autenticada.';
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  -- 1 · la entrega, si la hubo
  if v_arq.asiento_entrega_id is not null then
    perform anular_asiento(v_arq.asiento_entrega_id,
      'Anulación de arqueo (entrega): ' || p_motivo, v_fecha, v_user_id, true);
    v_revertidos := v_revertidos + 1;
  end if;

  -- 2 · el ajuste, si lo hubo
  if v_arq.asiento_ajuste_id is not null then
    perform anular_asiento(v_arq.asiento_ajuste_id,
      'Anulación de arqueo (ajuste): ' || p_motivo, v_fecha, v_user_id, true);
    v_revertidos := v_revertidos + 1;
  end if;

  update arqueo
     set anulado_at = now(), anulado_motivo = p_motivo
   where id = p_arqueo_id;

  return v_revertidos;
end;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6 · cambiar_estado_cheque — la guarda del rechazo + el flag
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Las dos cosas conviven sin tocarse porque están en lugares distintos: la
-- guarda arriba, junto a las validaciones de entrada; el flag adentro de la
-- rama del rechazo, donde ya estaba la llamada.
--
-- **Sólo el rechazo.** Acreditar y debitar mueven plata pero son el curso
-- normal del cheque. Anular tampoco es sensible: la propia función lo dice —«un
-- cheque anulado nunca llegó a cobrarse»— y su rama deja `v_lineas := null`,
-- o sea que no asienta nada ni llama a `anular_asiento`. El rechazo es el único
-- que revierte un cobro y reabre la deuda de un equipo.

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
  if p_nuevo_estado = 'rechazado' and coalesce(auth_rol(), '') <> 'admin' then
    raise exception
      'Rechazar un cheque revierte el cobro y reabre la deuda del equipo: es '
      'una operación de administrador. Tu rol es «%». Acreditar, debitar y '
      'anular sí podés.',
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

comment on function cambiar_estado_cheque(uuid, text, uuid, date, uuid) is
  'Las cuatro transiciones del cheque. Sólo el RECHAZO es de admin: revierte el cobro y reabre la deuda del equipo. Acreditar y debitar son el curso normal; anular no asienta nada porque un cheque anulado nunca llegó a cobrarse. La restricción va acá y no en una policy porque cheque.UPDATE no distingue cuál de las cuatro transiciones se está haciendo.';
