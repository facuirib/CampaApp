-- ─────────────────────────────────────────────────────────────────────────────
-- La tercera pata del comprobante: el ingreso extraordinario se recibe y factura
--
-- Fase C del Grupo A (decisión de Facu, 20/10). Tres piezas:
--
-- 1 · `comprobante.ingreso_extraordinario_id` — el comprobante ya colgaba de
--     un pago de equipo O de una cuota de sponsor; ahora también de un
--     ingreso extraordinario. `comprobante_un_origen` pasa a exigir
--     EXACTAMENTE UNO de los tres (o ninguno con sin_origen) — el patrón que
--     ya tenía, extendido.
--
-- 2 · `registrar_ingreso_extraordinario` genera el RECIBO interno en la misma
--     transacción, igual que registrar_cobro: todo cobro deja comprobante.
--     Sin tercero el recibo sale sin receptor (tipo 0 lo permite).
--
-- 3 · `reservar_numero_comprobante` gana `p_ingreso_extraordinario_id` (AL
--     FINAL, con default — los llamadores usan parámetros nombrados, nadie
--     se rompe) y lo inserta: la factura que se emita sobre este recibo
--     queda atada al ingreso, trazable ida y vuelta.
--
-- `v_comprobante` se recrea: tercero_id también sale del ingreso, ya_facturado
-- contempla la tercera pata, y expone ingreso_extraordinario_id al final.
-- ─────────────────────────────────────────────────────────────────────────────

alter table comprobante
  add column ingreso_extraordinario_id uuid references ingreso_extraordinario(id);

alter table comprobante drop constraint comprobante_un_origen;
alter table comprobante add constraint comprobante_un_origen check (
  case when sin_origen
    then pago_id is null and cuota_cobro_sponsor_id is null and ingreso_extraordinario_id is null
    else (pago_id is not null)::int
       + (cuota_cobro_sponsor_id is not null)::int
       + (ingreso_extraordinario_id is not null)::int = 1
  end
);

create or replace function public.registrar_ingreso_extraordinario(
  p_monto          numeric,
  p_medio          text,
  p_fecha          date,
  p_concepto       text,
  p_cuenta_ingreso uuid,
  p_tercero_id     uuid default null,
  p_torneo_id      uuid default null,
  p_predio_id      uuid default null,
  p_created_by     uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id       uuid;
  v_cuenta_tipo   text;
  v_cuenta_imp    boolean;
  v_cuenta_codigo text;
  v_cuenta_caja   text;
  v_ingreso_id    uuid;
  v_asiento_id    uuid;
  v_lineas        jsonb;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Registrar un ingreso extraordinario es de administrador o finanzas. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser positivo (recibido: %)', p_monto;
  end if;

  if p_concepto is null or trim(p_concepto) = '' then
    raise exception 'El ingreso extraordinario necesita un concepto: qué es esta plata.';
  end if;

  if p_fecha is null then
    raise exception 'El ingreso necesita fecha.';
  end if;

  if p_medio not in ('efectivo', 'transferencia') then
    raise exception
      'Medio de pago inválido: "%". Los válidos son efectivo y transferencia '
      '— cheque no está soportado todavía en un ingreso extraordinario.', p_medio;
  end if;

  select tipo, imputable, codigo into v_cuenta_tipo, v_cuenta_imp, v_cuenta_codigo
    from cuenta where id = p_cuenta_ingreso;

  if v_cuenta_tipo is null then
    raise exception 'La cuenta % no existe.', p_cuenta_ingreso;
  end if;

  if v_cuenta_tipo <> 'ingreso' or not v_cuenta_imp then
    raise exception 'La cuenta "%" no es una cuenta de ingreso imputable.', v_cuenta_codigo;
  end if;

  -- Las cuatro cuentas con circuito propio no se tocan por acá: cada una ya
  -- tiene su función de alta (registrar_cobro, registrar_cobro_sponsor,
  -- etc.) con su propia validación. Imputarles un ingreso extraordinario
  -- directo las dejaría con movimientos que esas funciones no esperan.
  if v_cuenta_codigo in ('ING_INSCRIPCIONES', 'ING_PARTIDOS', 'ING_SPONSORS', 'ING_BAR') then
    raise exception
      'La cuenta "%" tiene su propio circuito de cobro — usá ese, no un ingreso extraordinario.',
      v_cuenta_codigo;
  end if;

  if p_medio = 'efectivo' then
    if p_predio_id is null then
      raise exception 'El efectivo requiere predio: sin él no se puede cuadrar el arqueo.';
    end if;
    if not exists (
      select 1 from caja k where k.tipo = 'efectivo' and k.activo and k.predio_id = p_predio_id
    ) then
      raise exception 'El predio % no tiene una caja de efectivo activa.', p_predio_id;
    end if;
    v_cuenta_caja := 'CAJA_EFECTIVO';
  else
    -- El predio con transferencia SÍ se acepta (revisión de Facu): un
    -- estacionamiento pagado por transferencia sigue siendo «del predio X».
    -- Es dimensión de la fila — al asiento no viaja (ver crear_asiento abajo),
    -- porque CAJA_TRANSFERENCIA es global y trg_caja_predio lo exige así.
    v_cuenta_caja := 'CAJA_TRANSFERENCIA';
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable: se requiere p_created_by o sesión autenticada.';
  end if;

  -- ── El id se genera ANTES del asiento, no después ──────────────────────
  --
  -- `asiento.origen_id` no tiene FK (es polimórfico: según `origen`, puede
  -- apuntar a gasto, pago, activo... o ahora ingreso_extraordinario) — así
  -- que no hay problema en pasarle un id que todavía no existe como fila en
  -- ninguna tabla. Esto permite insertar `ingreso_extraordinario` UNA sola
  -- vez, ya con `asiento_id` completo, en vez de insertar y actualizar
  -- después — que es justo lo que NO hay que hacer: sin policy de UPDATE,
  -- RLS lo habría denegado afectando 0 filas EN SILENCIO, dejando
  -- `asiento_id` en null para siempre sin ningún error que lo delate.
  v_ingreso_id := gen_random_uuid();

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_caja, 'debe', p_monto),
    jsonb_build_object('cuenta', v_cuenta_codigo, 'haber', p_monto, 'tercero_id', p_tercero_id)
  );

  v_asiento_id := crear_asiento(
    p_fecha       => p_fecha,
    p_origen      => 'ingreso_extraordinario',
    p_descripcion => p_concepto,
    p_lineas      => v_lineas,
    p_torneo_id   => p_torneo_id,
    -- Solo con efectivo: el predio del asiento acompaña caja física
    -- (trg_caja_predio). Con transferencia, el predio vive en la fila del
    -- ingreso como dimensión y nada más.
    p_predio_id   => case when p_medio = 'efectivo' then p_predio_id else null end,
    p_origen_id   => v_ingreso_id,
    p_created_by  => v_user_id
  );

  insert into ingreso_extraordinario (
    id, concepto, monto, medio_pago, fecha, cuenta_id,
    tercero_id, torneo_id, predio_id, asiento_id, created_by
  ) values (
    v_ingreso_id, trim(p_concepto), p_monto, p_medio, p_fecha, p_cuenta_ingreso,
    p_tercero_id, p_torneo_id, p_predio_id, v_asiento_id, v_user_id
  );

  -- ── El recibo interno nace acá, como en registrar_cobro ────────────────
  -- Fase C del Grupo A (20/10): todo cobro deja comprobante, y el ingreso
  -- extraordinario es un cobro. El receptor se CONGELA desde el tercero si
  -- lo hay; sin tercero, el recibo sale sin receptor (tipo 0 lo permite) con
  -- condición Consumidor Final (5), el fallback de todo el circuito.
  declare
    v_rec_nombre    text;
    v_rec_doc_tipo  smallint;
    v_rec_doc_nro   text;
    v_rec_domicilio text;
    v_rec_cond_iva  smallint := 5;
  begin
    if p_tercero_id is not null then
      select coalesce(t.razon_social, t.nombre), t.doc_tipo_default,
             t.doc_nro_default, t.domicilio_fiscal,
             coalesce(t.condicion_iva_receptor_default, 5)
        into v_rec_nombre, v_rec_doc_tipo, v_rec_doc_nro, v_rec_domicilio, v_rec_cond_iva
        from tercero t where t.id = p_tercero_id;
    end if;

    insert into comprobante (
      ingreso_extraordinario_id, tipo_comprobante, punto_venta, numero,
      condicion_iva_receptor_id, monto, estado, emitida_por, fecha_emision,
      receptor_nombre, receptor_doc_tipo, receptor_doc_nro, receptor_domicilio,
      detalle
    ) values (
      v_ingreso_id, 0, 0, nextval('comprobante_recibo_numero_seq'),
      v_rec_cond_iva, p_monto, 'generado', v_user_id, p_fecha,
      v_rec_nombre, v_rec_doc_tipo, v_rec_doc_nro, v_rec_domicilio,
      trim(p_concepto)
    );
  end;

  return v_ingreso_id;
end
$function$;

create or replace view v_comprobante as
 SELECT c.id,
    c.fecha_emision,
    to_char(c.fecha_emision::timestamp with time zone, 'YYYY-MM'::text) AS periodo,
    EXTRACT(year FROM c.fecha_emision)::integer AS anio,
    c.tipo_comprobante,
        CASE c.tipo_comprobante
            WHEN 0 THEN 'Recibo'::text
            WHEN 1 THEN 'Factura A'::text
            WHEN 6 THEN 'Factura B'::text
            WHEN 2 THEN 'Nota de débito A'::text
            WHEN 7 THEN 'Nota de débito B'::text
            WHEN 3 THEN 'Nota de crédito A'::text
            WHEN 8 THEN 'Nota de crédito B'::text
            ELSE 'Tipo '::text || c.tipo_comprobante
        END AS tipo_label,
        CASE
            WHEN c.tipo_comprobante = ANY (ARRAY[1, 2, 3]) THEN 'A'::text
            WHEN c.tipo_comprobante = ANY (ARRAY[6, 7, 8]) THEN 'B'::text
            ELSE NULL::text
        END AS letra,
    c.tipo_comprobante <> 0 AS es_factura,
    c.punto_venta,
    c.numero,
    (lpad(c.punto_venta::text, 4, '0'::text) || '-'::text) || lpad(c.numero::text, 8, '0'::text) AS numero_formateado,
    c.receptor_nombre,
    (
        CASE c.receptor_doc_tipo
            WHEN 80 THEN 'CUIT'::text
            WHEN 86 THEN 'CUIL'::text
            WHEN 96 THEN 'DNI'::text
            ELSE 'Doc.'::text
        END || ' '::text) || COALESCE(c.receptor_doc_nro, '—'::text) AS receptor_doc,
    civ.descripcion AS condicion_iva,
    c.receptor_domicilio,
    c.detalle,
    c.monto,
    c.neto,
    c.iva,
    c.moneda,
    c.cotizacion,
    c.cae,
    c.cae_vencimiento,
    c.tipo_cod_aut,
    c.estado,
        CASE c.estado
            WHEN 'emitida'::text THEN 'Emitida'::text
            WHEN 'pendiente'::text THEN 'Pendiente'::text
            WHEN 'error'::text THEN 'Error'::text
            WHEN 'generado'::text THEN 'Generado'::text
            ELSE c.estado
        END AS estado_label,
    c.error_detalle,
    c.emisor_domicilio,
    c.sin_origen,
    c.motivo_sin_origen,
    c.pago_id,
    c.cuota_cobro_sponsor_id,
    c.emitida_por,
    c.created_at,
    c.tipo_comprobante = 0 OR c.estado = 'emitida'::text AS tiene_pdf,
    COALESCE(p.tercero_id, cs.sponsor_id, ie.tercero_id) AS tercero_id,
    c.pago_id IS NOT NULL AND (EXISTS ( SELECT 1
           FROM comprobante f
          WHERE f.pago_id = c.pago_id AND f.tipo_comprobante <> 0 AND f.estado <> 'error'::text)) OR c.cuota_cobro_sponsor_id IS NOT NULL AND (EXISTS ( SELECT 1
           FROM comprobante f
          WHERE f.cuota_cobro_sponsor_id = c.cuota_cobro_sponsor_id AND f.tipo_comprobante <> 0 AND f.estado <> 'error'::text)) OR c.ingreso_extraordinario_id IS NOT NULL AND (EXISTS ( SELECT 1
           FROM comprobante f
          WHERE f.ingreso_extraordinario_id = c.ingreso_extraordinario_id AND f.tipo_comprobante <> 0 AND f.estado <> 'error'::text)) AS ya_facturado,
    c.ingreso_extraordinario_id
   FROM comprobante c
     LEFT JOIN condicion_iva_receptor civ ON civ.id = c.condicion_iva_receptor_id
     LEFT JOIN pago p ON p.id = c.pago_id
     LEFT JOIN cuota_cobro_sponsor q ON q.id = c.cuota_cobro_sponsor_id
     LEFT JOIN contrato_sponsor cs ON cs.id = q.contrato_id
     LEFT JOIN ingreso_extraordinario ie ON ie.id = c.ingreso_extraordinario_id;

-- reservar_numero_comprobante: el parámetro nuevo va AL FINAL con default —
-- drop primero porque agregar un parámetro con create or replace crea una
-- SOBRECARGA en vez de reemplazar, y las dos firmas conviviendo rompen los
-- llamadores nombrados con «function is not unique».
drop function public.reservar_numero_comprobante(smallint,smallint,smallint,numeric,text,smallint,text,uuid,uuid,text,text,numeric,numeric,date,integer,uuid);

CREATE OR REPLACE FUNCTION public.reservar_numero_comprobante(p_punto_venta smallint, p_tipo_comprobante smallint, p_condicion_iva_receptor_id smallint, p_monto numeric, p_receptor_nombre text, p_receptor_doc_tipo smallint, p_receptor_doc_nro text, p_pago_id uuid DEFAULT NULL::uuid, p_cuota_cobro_sponsor_id uuid DEFAULT NULL::uuid, p_receptor_domicilio text DEFAULT NULL::text, p_detalle text DEFAULT NULL::text, p_neto numeric DEFAULT NULL::numeric, p_iva numeric DEFAULT NULL::numeric, p_fecha_emision date DEFAULT NULL::date, p_ultimo_numero_arca integer DEFAULT NULL::integer, p_emitida_por uuid DEFAULT NULL::uuid, p_ingreso_extraordinario_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, numero integer)
 LANGUAGE plpgsql
AS $function$
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

  if (p_pago_id is not null)::int + (p_cuota_cobro_sponsor_id is not null)::int
     + (p_ingreso_extraordinario_id is not null)::int <> 1 then
    raise exception
      'Hay que informar exactamente uno: pago_id, cuota_cobro_sponsor_id o ingreso_extraordinario_id.';
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
    pago_id, cuota_cobro_sponsor_id, ingreso_extraordinario_id, tipo_comprobante, punto_venta,
    numero, condicion_iva_receptor_id, monto, estado, emitida_por,
    receptor_nombre, receptor_doc_tipo, receptor_doc_nro, receptor_domicilio,
    detalle, neto, iva, fecha_emision, emisor_domicilio
  ) values (
    p_pago_id, p_cuota_cobro_sponsor_id, p_ingreso_extraordinario_id, p_tipo_comprobante, p_punto_venta,
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
$function$
;
