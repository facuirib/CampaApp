-- ═══════════════════════════════════════════════════════════════
-- crear_contrato_sponsor / registrar_cobro_sponsor — agregar p_created_by
--
-- Hallazgo de Facu (Fase 4, 23/08): ninguna de las dos toma p_created_by,
-- a diferencia del resto de las puertas (decisión 89). No bloquea nada
-- hoy, pero el asiento queda sin responsable, y fallan sin sesión activa
-- (mismo caso que USD, resuelto ayer).
--
-- Cambio aditivo: +1 param al final, default null, en las dos. Pasado a
-- crear_asiento como p_created_by.
--
-- Nota de proceso: el primer intento de aplicar las dos juntas en un
-- solo bloque falló silenciosamente (mismo patrón que el bloque grande
-- de RLS de ayer) — se resolvió aplicando cada función por separado,
-- verificando pg_get_function_identity_arguments después de cada una.
-- ═══════════════════════════════════════════════════════════════

drop function if exists crear_contrato_sponsor(uuid, numeric, date, date, jsonb, date);

create or replace function public.crear_contrato_sponsor(
  p_sponsor_id      uuid,
  p_monto_total     numeric,
  p_vigente_desde   date,
  p_vigente_hasta   date,
  p_cuotas          jsonb default null::jsonb,
  p_fecha_firma     date default null::date,
  p_created_by      uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_nombre    text;
  v_contrato  uuid;
  v_asiento   uuid;
  v_fecha     date;
begin
  select nombre into v_nombre from tercero where id = p_sponsor_id;
  if not found then
    raise exception 'El tercero % no existe', p_sponsor_id;
  end if;

  if p_monto_total is null or p_monto_total <= 0 then
    raise exception 'El monto del contrato debe ser positivo (recibido: %)', p_monto_total;
  end if;

  v_fecha := coalesce(p_fecha_firma, p_vigente_desde);

  insert into contrato_sponsor (sponsor_id, monto_total, vigente_desde, vigente_hasta)
  values (p_sponsor_id, p_monto_total, p_vigente_desde, p_vigente_hasta)
  returning id into v_contrato;

  v_asiento := crear_asiento(
    v_fecha,
    'sponsor',
    'Firma contrato · ' || v_nombre || ' · ' ||
      to_char(p_vigente_desde,'MM/YYYY') || '-' || to_char(p_vigente_hasta,'MM/YYYY'),
    jsonb_build_array(
      jsonb_build_object('cuenta','DEUDORES_SPONSORS',
                         'debe',  p_monto_total, 'tercero_id', p_sponsor_id),
      jsonb_build_object('cuenta','INGRESO_DIFERIDO',
                         'haber', p_monto_total, 'tercero_id', p_sponsor_id)
    ),
    null, null, null,
    v_contrato,
    p_created_by
  );

  update contrato_sponsor set asiento_firma_id = v_asiento where id = v_contrato;

  if p_cuotas is not null then
    perform cargar_cuotas_sponsor(v_contrato, p_cuotas);
  end if;

  return v_contrato;
end;
$function$;


drop function if exists registrar_cobro_sponsor(uuid, text, date, uuid);

create or replace function public.registrar_cobro_sponsor(
  p_cuota_id    uuid,
  p_medio       text,
  p_fecha       date default null::date,
  p_predio_id   uuid default null::uuid,
  p_created_by  uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_c       record;
  v_cuenta  text;
  v_fecha   date;
  v_asiento uuid;
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

  return v_asiento;
end;
$function$;

comment on function crear_contrato_sponsor(uuid, numeric, date, date, jsonb, date, uuid) is
  'Alta de contrato de sponsor + asiento de firma + cuotas. p_created_by agregado 23/08 (aditivo) — sin fallback, fallaba sin sesión activa.';
comment on function registrar_cobro_sponsor(uuid, text, date, uuid, uuid) is
  'Cobro de una cuota de sponsor. p_created_by agregado 23/08 (aditivo) — sin fallback, fallaba sin sesión activa.';