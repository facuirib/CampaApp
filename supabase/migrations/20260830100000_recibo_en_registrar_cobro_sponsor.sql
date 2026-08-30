-- ═══════════════════════════════════════════════════════════════
-- registrar_cobro_sponsor · el recibo interno nace en la misma
-- transacción
-- Pedido de Facu (30/08, punto ①, prioridad máxima — "destraba
-- sponsors"): la función cobra y asienta, pero no crea comprobante.
-- Mismo patrón exacto que registrar_cobro, con la diferencia real de
-- que cuelga de cuota_cobro_sponsor_id, no de pago_id (esta función
-- no toca la tabla pago).
--
-- select ... into strict (pedido explícito de Facu): si el tercero no
-- aparece, NO_DATA_FOUND ruidoso en vez de silencio — es el corazón
-- de un circuito de cobros.
--
-- El receptor se CONGELA (nombre, doc, domicilio, condición de IVA),
-- no se referencia.
--
-- Verificado con BEGIN...ROLLBACK contra la base real (30/08): cobro
-- de prueba sobre una cuota de sponsor real (Ferretería del Centro,
-- $1.800.000), el recibo se creó correctamente (numero=19,
-- cuota_cobro_sponsor_id vinculado, pago_id=null, receptor_nombre
-- congelado, estado='generado'). Todo deshecho con rollback.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.registrar_cobro_sponsor(p_cuota_id uuid, p_medio text, p_fecha date DEFAULT NULL::date, p_predio_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_c        record;
  v_cuenta   text;
  v_fecha    date;
  v_asiento  uuid;
  v_receptor record;
begin
  select q.id, q.monto, q.fecha_cobro, q.cobrado_at,
         c.id as contrato_id, c.sponsor_id, t.nombre
    into v_c
  from cuota_cobro_sponsor q
  join contrato_sponsor c on c.id = q.contrato_id
  join tercero t on t.id = c.sponsor_id
  where q.id = p_cuota_id;

  if not found then
    raise exception 'La cuota de cobro % no existe', p_cuota_id;
  end if;
  if v_c.cobrado_at is not null then
    raise exception 'La cuota % ya fue cobrada el %', p_cuota_id, v_c.cobrado_at;
  end if;

  v_cuenta := case p_medio
                when 'transferencia' then 'CAJA_TRANSFERENCIA'
                when 'central'       then 'CAJA_CENTRAL'
                when 'efectivo'      then 'CAJA_EFECTIVO'
              end;
  if v_cuenta is null then
    raise exception
      'Medio "%" desconocido. Usá transferencia, central o efectivo.', p_medio;
  end if;

  if p_medio = 'efectivo' and p_predio_id is null then
    raise exception
      'Un cobro en efectivo tiene que decir en qué predio entró la plata, o el '
      'arqueo de ese día no cierra.';
  end if;
  if p_medio <> 'efectivo' and p_predio_id is not null then
    raise exception 'Solo el cobro en efectivo de predio lleva predio_id.';
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  v_asiento := crear_asiento(
    v_fecha,
    'sponsor',
    'Cobro sponsor · ' || v_c.nombre || ' · ' || p_medio,
    jsonb_build_array(
      jsonb_build_object('cuenta', v_cuenta, 'debe', v_c.monto),
      jsonb_build_object('cuenta','DEUDORES_SPONSORS',
                         'haber', v_c.monto, 'tercero_id', v_c.sponsor_id)
    ),
    null, null, p_predio_id,
    v_c.contrato_id,
    p_created_by
  );

  update cuota_cobro_sponsor
     set cobrado_at = v_fecha, asiento_id = v_asiento
   where id = p_cuota_id;

  select
    coalesce(t.razon_social, t.nombre) as nombre,
    t.doc_tipo_default,
    t.doc_nro_default,
    t.domicilio_fiscal,
    t.condicion_iva_receptor_default
    into strict v_receptor
  from tercero t
  where t.id = v_c.sponsor_id;

  insert into comprobante (
    cuota_cobro_sponsor_id, tipo_comprobante, punto_venta, numero,
    condicion_iva_receptor_id, monto, estado, emitida_por,
    fecha_emision, receptor_nombre, receptor_doc_tipo,
    receptor_doc_nro, receptor_domicilio, detalle
  ) values (
    p_cuota_id, 0, 0, nextval('comprobante_recibo_numero_seq'),
    coalesce(v_receptor.condicion_iva_receptor_default, 5),
    v_c.monto, 'generado', coalesce(p_created_by, auth.uid()),
    v_fecha, v_receptor.nombre, v_receptor.doc_tipo_default,
    v_receptor.doc_nro_default, v_receptor.domicilio_fiscal,
    'Cuota de sponsor · ' || v_c.nombre
  );

  return v_asiento;
end;
$function$;
