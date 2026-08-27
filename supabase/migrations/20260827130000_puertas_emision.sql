-- ═══════════════════════════════════════════════════════════════════════════
-- Las puertas de emisión: reservar → (ARCA) → cerrar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `registrar_factura_emitida` hacía todo en un solo paso: insertaba la fila ya
-- en 'emitida', con CAE. Eso obliga a llamar a ARCA ANTES de tener fila, y esa
-- ventana es el problema: si ARCA autoriza y la app se cae —timeout, deploy,
-- error de red— **la factura existe en ARCA y no existe en Campa**. Un
-- documento fiscal emitido del que no queda rastro.
--
-- El orden correcto es al revés. Primero la fila en 'pendiente' con su número
-- reservado; después la llamada a ARCA, afuera de la transacción; después el
-- cierre. Si algo se corta en el medio, queda una 'pendiente' —visible,
-- reconciliable con FECompConsultar— en vez de nada.
--
-- Por eso `registrar_factura_emitida` se DROPEA y no queda como wrapper: un
-- wrapper sería exactamente el camino que estamos sacando, disponible al lado
-- del bueno. Tiene 0 llamadores y hay 0 comprobantes, así que es gratis ahora
-- y no lo va a ser nunca más. La firma vieja quedó anotada en coordinacion.md
-- y ahí mismo se reemplaza por estas dos.
--
-- ── El advisory lock, y qué serializa exactamente ─────────────────────────
--
-- ARCA numera correlativo por (punto de venta, tipo). Dos emisiones simultáneas
-- del mismo punto+tipo que lean «el último es 407» las dos, las dos piden el
-- 408: una lo consigue y la otra recibe un rechazo de ARCA por número
-- duplicado — o peor, si el timing es infeliz, ARCA autoriza dos veces y queda
-- un número usado dos veces.
--
-- `pg_advisory_xact_lock(hashtext('comprobante_numero'), punto*1000+tipo)`
-- serializa la lectura-del-último + la reserva. Es xact: se suelta solo al
-- commit o al rollback, así que no hay lock huérfano si la función falla.
--
-- La clave es por punto+tipo y no global a propósito: dos facturas de puntos
-- distintos no compiten por el mismo número, y hacerlas esperar sería
-- serializar toda la facturación del club detrás de un solo mostrador.
--
-- ── De dónde sale el número ───────────────────────────────────────────────
--
-- **La autoridad es ARCA, no nuestra tabla.** El comentario de
-- comprobante_seguro.sql ya lo decía: una sequence propia se desincroniza de
-- ARCA en el primer rechazo. Por eso la puerta acepta `p_ultimo_numero_arca`
-- —lo que devolvió FECompUltimoAutorizado— y reserva
-- `greatest(nuestro_maximo, el_de_arca) + 1`.
--
-- Los dos términos hacen falta y por razones distintas:
--
--   · el de ARCA, porque es el que manda y porque cubre lo que se emitió por
--     afuera de Campa (la #407 es justamente eso);
--   · el nuestro, porque ARCA no sabe de las reservas 'pendiente' que todavía
--     no le pedimos. Dos reservas seguidas, sin ninguna emisión en el medio,
--     tienen que dar 408 y 409 — y ARCA seguiría contestando 407 a las dos.
--
-- Y las filas en 'error' NO cuentan. Si el 408 falló, el 408 no se consumió en
-- ARCA: el próximo intento tiene que volver a pedir el 408. Saltearlo dejaría
-- un hueco y ARCA rechaza los huecos. Por eso los tres únicos pasan a excluir
-- 'error': si no, la fila fallida bloquearía su propio reintento.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Los únicos, ahora ciegos a los intentos fallidos ──────────────────────

alter table comprobante drop constraint comprobante_pto_vta_numero_unique;

create unique index comprobante_pto_vta_numero_unique
  on comprobante (punto_venta, tipo_comprobante, numero)
  where estado <> 'error';

drop index comprobante_pago_unico;
create unique index comprobante_pago_unico
  on comprobante (pago_id)
  where pago_id is not null and estado <> 'error';

drop index comprobante_cuota_sponsor_unica;
create unique index comprobante_cuota_sponsor_unica
  on comprobante (cuota_cobro_sponsor_id)
  where cuota_cobro_sponsor_id is not null and estado <> 'error';

comment on index comprobante_pto_vta_numero_unique is
  'Un número por punto y tipo. Excluye las filas en error: un número que ARCA rechazó no se consumió, y el reintento tiene que poder volver a pedirlo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ① reservar_numero_comprobante — saca el número y deja la fila en pendiente
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists registrar_factura_emitida(
  uuid, uuid, smallint, smallint, integer, smallint, numeric, text, date,
  uuid, text, smallint, text, numeric, numeric, date, text);

create or replace function public.reservar_numero_comprobante(
  p_punto_venta               smallint,
  p_tipo_comprobante          smallint,
  p_condicion_iva_receptor_id smallint,
  p_monto                     numeric,
  p_receptor_nombre           text,
  p_receptor_doc_tipo         smallint,
  p_receptor_doc_nro          text,
  p_pago_id                   uuid    default null,
  p_cuota_cobro_sponsor_id    uuid    default null,
  p_receptor_domicilio        text    default null,
  p_detalle                   text    default null,
  p_neto                      numeric default null,
  p_iva                       numeric default null,
  p_fecha_emision             date    default null,
  p_ultimo_numero_arca        integer default null,
  p_emitida_por               uuid    default null
)
returns table (id uuid, numero integer)
language plpgsql
as $function$
declare
  v_domicilio text;
  v_numero    integer;
  v_id        uuid;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception 'Emitir facturas es de administrador o finanzas. Tu rol es %.',
      coalesce(auth_rol(), 'sin rol');
  end if;

  -- El recibo interno no pasa por acá: no toca ARCA, no tiene punto de venta y
  -- numera con su propia sequence. Mezclarlos le pondría un advisory lock a
  -- cada cobro para nada.
  if p_tipo_comprobante = 0 then
    raise exception
      'El recibo interno no se emite por esta puerta: numera con comprobante_recibo_numero_seq y no va a ARCA.';
  end if;

  if (p_pago_id is null) = (p_cuota_cobro_sponsor_id is null) then
    raise exception
      'Hay que informar exactamente uno: pago_id o cuota_cobro_sponsor_id, no los dos ni ninguno.';
  end if;

  select pv.domicilio into v_domicilio
    from punto_venta pv
   where pv.numero = p_punto_venta and pv.activo;

  if not found then
    raise exception
      'El punto de venta % no existe o está desactivado. Los habilitados son: %.',
      p_punto_venta,
      (select string_agg(pv.numero || ' (' || pv.nombre || ')', ', ' order by pv.numero)
         from punto_venta pv where pv.activo);
  end if;

  -- Desde acá hasta el commit, nadie más reserva para este punto+tipo.
  perform pg_advisory_xact_lock(
    hashtext('comprobante_numero'),
    p_punto_venta::int * 1000 + p_tipo_comprobante::int
  );

  select greatest(
           coalesce(max(c.numero) filter (where c.estado <> 'error'), 0),
           coalesce(p_ultimo_numero_arca, 0)
         ) + 1
    into v_numero
    from comprobante c
   where c.punto_venta = p_punto_venta
     and c.tipo_comprobante = p_tipo_comprobante;

  insert into comprobante (
    pago_id, cuota_cobro_sponsor_id, tipo_comprobante, punto_venta,
    numero, condicion_iva_receptor_id, monto, estado, emitida_por,
    receptor_nombre, receptor_doc_tipo, receptor_doc_nro, receptor_domicilio,
    detalle, neto, iva, fecha_emision, emisor_domicilio
  ) values (
    p_pago_id, p_cuota_cobro_sponsor_id, p_tipo_comprobante, p_punto_venta,
    v_numero, p_condicion_iva_receptor_id, p_monto, 'pendiente',
    coalesce(p_emitida_por, auth.uid()),
    p_receptor_nombre, p_receptor_doc_tipo, p_receptor_doc_nro, p_receptor_domicilio,
    p_detalle,
    coalesce(p_neto, round(p_monto / 1.21, 2)),
    coalesce(p_iva,  p_monto - round(p_monto / 1.21, 2)),
    coalesce(p_fecha_emision, current_date),
    v_domicilio
  )
  returning comprobante.id into v_id;

  return query select v_id, v_numero;
exception when unique_violation then
  raise exception
    'Este pago/cuota ya tiene un comprobante vigente, o el número % ya existe para el punto % tipo %.',
    v_numero, p_punto_venta, p_tipo_comprobante;
end;
$function$;

comment on function reservar_numero_comprobante is
  'Puerta 1 de 2 de la emisión. Serializa con advisory lock por (punto, tipo), reserva el número siguiente —greatest(nuestro máximo sin errores, el último de ARCA) + 1— y deja la fila en pendiente con receptor y emisor_domicilio congelados. Devuelve id y numero. Después se llama a ARCA y se cierra con cerrar_comprobante.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ② cerrar_comprobante — llegó el CAE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La guarda de rol acá no es simetría: es lo único que hace ruido. Sin ella,
-- un rol sin permiso de UPDATE recibe el silencio de RLS —0 filas, sin
-- excepción— y quien llamó se queda pensando que cerró. La fila seguiría en
-- 'pendiente' con el CAE ya otorgado por ARCA, que es el estado exacto que
-- todo este rediseño existe para evitar.

create or replace function public.cerrar_comprobante(
  p_id              uuid,
  p_cae             text,
  p_cae_vencimiento date
)
returns void
language plpgsql
as $function$
declare
  v_estado text;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception 'Cerrar un comprobante es de administrador o finanzas. Tu rol es %.',
      coalesce(auth_rol(), 'sin rol');
  end if;

  if p_cae is null or btrim(p_cae) = '' then
    raise exception 'No se puede cerrar sin CAE: una factura «emitida» sin CAE es una que no se emitió.';
  end if;

  select estado into v_estado from comprobante where id = p_id;

  if not found then
    raise exception 'No existe el comprobante %.', p_id;
  end if;

  if v_estado <> 'pendiente' then
    raise exception 'El comprobante % está en «%», no en «pendiente». Sólo se cierra lo reservado.',
      p_id, v_estado;
  end if;

  update comprobante
     set estado = 'emitida', cae = p_cae, cae_vencimiento = p_cae_vencimiento
   where id = p_id;

  if not found then
    raise exception 'No se pudo cerrar el comprobante % (denegado por RLS).', p_id;
  end if;
end;
$function$;

comment on function cerrar_comprobante is
  'Puerta 2 de 2 de la emisión. Pasa una reserva pendiente a emitida con el CAE que devolvió ARCA. Falla si no está en pendiente.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ marcar_error_comprobante — ARCA rechazó
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La fila queda como registro del intento y su número se libera: los tres
-- únicos excluyen 'error', así que el reintento vuelve a pedir el mismo número
-- —que es lo que ARCA espera, porque nunca lo consumió.

create or replace function public.marcar_error_comprobante(
  p_id      uuid,
  p_detalle text
)
returns void
language plpgsql
as $function$
declare
  v_estado text;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception 'Marcar el error de un comprobante es de administrador o finanzas. Tu rol es %.',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select estado into v_estado from comprobante where id = p_id;

  if not found then
    raise exception 'No existe el comprobante %.', p_id;
  end if;

  if v_estado <> 'pendiente' then
    raise exception 'El comprobante % está en «%», no en «pendiente».', p_id, v_estado;
  end if;

  update comprobante
     set estado = 'error', error_detalle = p_detalle
   where id = p_id;

  if not found then
    raise exception 'No se pudo marcar el comprobante % (denegado por RLS).', p_id;
  end if;
end;
$function$;

comment on function marcar_error_comprobante is
  'Cierra una reserva pendiente como fallida, guardando lo que dijo ARCA. Libera el número: los únicos excluyen error, así que el reintento vuelve a pedirlo.';
