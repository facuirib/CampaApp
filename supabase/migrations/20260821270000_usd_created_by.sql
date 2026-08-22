-- ═══════════════════════════════════════════════════════════════
-- comprar_usd / vender_usd — agregar p_created_by
-- PROPUESTA, NO APLICAR sin revisión de Facu (regla 11 · motor).
--
-- Del board (Societario): "comprar_usd/vender_usd sin responsable
-- (p_created_by)". Confirmado contra pg_get_functiondef: ninguna de las
-- dos lo tiene. Sin él, crear_asiento cae a auth.uid() puro (sin
-- fallback, decisión 89) — fallan si se llaman sin sesión activa (ej.
-- desde el SQL Editor, o cualquier llamada de servidor sin auth).
--
-- Cambio: +1 param al final, default null, en las dos. Pasado a
-- crear_asiento como p_created_by (9no argumento posicional). El resto
-- de cada función queda BYTE A BYTE igual — verificado contra
-- pg_get_functiondef real antes de escribir esto, no de memoria.
--
-- Las dos difieren entre sí (comprar_usd ya tiene validar_saldo_caja,
-- vender_usd no) — se mantiene esa diferencia, no se unifican.
--
-- Cambia la firma (+1 param) → requiere DROP explícito de la versión
-- vieja antes del CREATE OR REPLACE, mismo patrón que pagar_gasto —
-- CREATE OR REPLACE con más parámetros NO reemplaza, crea sobrecarga.
-- ═══════════════════════════════════════════════════════════════

drop function if exists comprar_usd(date, numeric, numeric, text, text);

create or replace function public.comprar_usd(
  p_fecha       date,
  p_cantidad    numeric,
  p_tc          numeric,
  p_motivo      text default null::text,
  p_medio       text default 'transferencia'::text,
  p_created_by  uuid default null
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

  perform validar_saldo_caja(v_cuenta, null, p_fecha, v_pesos, 'compra de USD');

  v_asiento := crear_asiento(
    p_fecha, 'usd',
    'Compra USD ' || p_cantidad || ' @ ' || p_tc || coalesce(' · ' || p_motivo, ''),
    jsonb_build_array(
      jsonb_build_object('cuenta','CAJA_USD', 'debe',  v_pesos),
      jsonb_build_object('cuenta', v_cuenta,  'haber', v_pesos)
    ),
    null, null, null, null,
    p_created_by
  );

  insert into usd_operacion (fecha, tipo, cantidad, tc, monto_pesos, motivo, asiento_id)
  values (p_fecha, 'compra', p_cantidad, p_tc, v_pesos, p_motivo, v_asiento);

  return v_asiento;
end;
$function$;


drop function if exists vender_usd(date, numeric, numeric, text, text);

create or replace function public.vender_usd(
  p_fecha       date,
  p_cantidad    numeric,
  p_tc          numeric,
  p_motivo      text default null::text,
  p_medio       text default 'transferencia'::text,
  p_created_by  uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_cuenta   text;
  v_tenencia numeric(14,2);
  v_costo    numeric(16,2);
  v_ppp      numeric;
  v_salida   numeric(16,2);
  v_recibido numeric(16,2);
  v_dif      numeric(16,2);
  v_lineas   jsonb;
  v_asiento  uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a vender debe ser positiva (recibido: %)', p_cantidad;
  end if;
  if p_tc is null or p_tc <= 0 then
    raise exception 'El tipo de cambio debe ser positivo (recibido: %)', p_tc;
  end if;

  v_cuenta := case p_medio
                when 'transferencia' then 'CAJA_TRANSFERENCIA'
                when 'central'       then 'CAJA_CENTRAL'
              end;
  if v_cuenta is null then
    raise exception 'Medio "%" desconocido. Usá transferencia o central.', p_medio;
  end if;

  select coalesce(sum(cantidad), 0) into v_tenencia from usd_operacion;

  select coalesce(sum(l.debe - l.haber), 0) into v_costo
    from asiento_linea l
    join cuenta c on c.id = l.cuenta_id
   where c.codigo = 'CAJA_USD';

  if v_tenencia <= 0 then
    raise exception 'No hay dólares en caja: no se puede vender.';
  end if;
  if p_cantidad > v_tenencia then
    raise exception 'Se quieren vender % USD y en caja hay %.', p_cantidad, v_tenencia;
  end if;

  v_ppp := v_costo / v_tenencia;

  if p_cantidad = v_tenencia then
    v_salida := v_costo;
  else
    v_salida := round(p_cantidad * v_ppp, 2);
  end if;

  v_recibido := round(p_cantidad * p_tc, 2);
  v_dif      := v_recibido - v_salida;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta,   'debe',  v_recibido),
    jsonb_build_object('cuenta','CAJA_USD',  'haber', v_salida)
  );

  if v_dif > 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta','FIN_DIF_CAMBIO','haber', v_dif));
  elsif v_dif < 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta','FIN_DIF_CAMBIO','debe', -v_dif));
  end if;

  v_asiento := crear_asiento(
    p_fecha,
    'usd',
    'Venta USD ' || p_cantidad || ' @ ' || p_tc ||
      ' (PPP ' || round(v_ppp, 2) || ')' || coalesce(' · ' || p_motivo, ''),
    v_lineas,
    null, null, null, null,
    p_created_by
  );

  insert into usd_operacion (fecha, tipo, cantidad, tc, monto_pesos, motivo, asiento_id)
  values (p_fecha, 'venta', -p_cantidad, p_tc, v_recibido, p_motivo, v_asiento);

  return v_asiento;
end;
$function$;

comment on function comprar_usd(date, numeric, numeric, text, text, uuid) is
  'Compra de USD. p_created_by agregado 21/08 (aditivo) — sin fallback, fallaba sin sesión activa.';
comment on function vender_usd(date, numeric, numeric, text, text, uuid) is
  'Venta de USD (PPP). p_created_by agregado 21/08 (aditivo) — sin fallback, fallaba sin sesión activa.';