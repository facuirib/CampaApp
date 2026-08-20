-- ═══════════════════════════════════════════════════════════════
-- B13 · Efectivo recibido por personal fuera de predio — PROPUESTA
-- NO APLICAR sin revisión de Facu (regla 11 · schema nuevo + motor).
--
-- Caso: alguien cobra efectivo de un equipo lejos de una caja de predio
-- (ej. un árbitro cobra en cancha antes de que exista una caja abierta
-- ese día). Hoy registrar_cobro lo rechaza explícito: "ese caso todavía
-- no está soportado: registralo cuando la plata llegue a una caja."
--
-- MODELO: dos momentos, dos funciones.
--   1. recibir_efectivo_en_transito — alguien queda "en custodia" de la
--      plata. Asienta EFECTIVO_EN_TRANSITO debe / ING_x haber (mismo
--      patrón de registrar_cobro: el ingreso se reconoce al cobrar, no
--      al liquidar — percibido puro).
--   2. liquidar_efectivo_transito — esa plata llega a una caja de predio
--      real. Asienta CAJA_EFECTIVO (del predio) debe / EFECTIVO_EN_
--      TRANSITO haber. Traslado puro, no genera ingreso nuevo (ya se
--      reconoció en el paso 1) — mismo patrón que entrega de arqueo a
--      central.
--
-- ✅ RESPUESTAS DE FACU (20/08, en coordinacion.md):
--  B13-1 nombre EFECTIVO_EN_TRANSITO: confirmado, no CAJA_* (no se
--    arquea, no tiene predio, el prefijo la metería en v_saldo_caja).
--  B13-2 reconocer al recibir: SÍ (regla 1.b, percibido puro).
--  B13-3 quién liquida: cualquiera. p_responsable_id deja el rastro.
--  B13-4 sin tabla de custodia; el responsable queda en asiento.created_by
--    (vía p_created_by), no en la línea — evita el error de mezclar
--    tercero_id (equipos) con usuario.
--
-- 🔧 CORREGIDO (Facu lo marcó pendiente antes de aplicar):
--  - p_torneo_id ahora se calcula de las cuotas imputadas y se pasa a
--    crear_asiento, igual que registrar_cobro. Sin esto el ingreso no
--    quedaba atribuido al torneo y el P&L por torneo lo perdía.
-- ═══════════════════════════════════════════════════════════════

insert into cuenta (codigo, nombre, tipo)
select 'EFECTIVO_EN_TRANSITO', 'Efectivo en tránsito', 'activo'
where not exists (select 1 from cuenta where codigo = 'EFECTIVO_EN_TRANSITO');


create or replace function public.recibir_efectivo_en_transito(
  p_tercero_id     uuid,
  p_monto          numeric,
  p_medio          text default 'efectivo',
  p_fecha          date default null,
  p_imputaciones   jsonb default null,
  p_responsable_id uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_pago_id     uuid;
  v_asiento_id  uuid;
  v_user_id     uuid;
  v_fecha       date;
  v_lineas      jsonb;
  v_agrupado    numeric(16,2);
  v_monto_imp   numeric(16,2);
  v_torneos     uuid[];
  v_torneo_id   uuid;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser positivo (recibido: %)', p_monto;
  end if;

  v_fecha := coalesce(p_fecha, current_date);
  v_user_id := coalesce(p_responsable_id, auth.uid());
  if v_user_id is null then
    raise exception
      'Falta responsable: se requiere p_responsable_id o sesión autenticada.';
  end if;

  if p_imputaciones is null or jsonb_array_length(p_imputaciones) = 0 then
    raise exception
      'Necesita al menos una imputación, igual que un cobro normal.';
  end if;

  select coalesce(sum((x->>'monto')::numeric), 0) into v_monto_imp
    from jsonb_array_elements(p_imputaciones) x;

  if v_monto_imp <> p_monto then
    raise exception
      'La imputación suma % y el monto es %. Tienen que coincidir.',
      v_monto_imp, p_monto;
  end if;

  select array_agg(distinct et.torneo_id) into v_torneos
    from jsonb_array_elements(p_imputaciones) x
    join cuota c          on c.id  = (x->>'cuota_id')::uuid
    join equipo_torneo et on et.id = c.equipo_torneo_id;

  if v_torneos is null then
    raise exception 'Ninguna de las cuotas indicadas existe';
  end if;

  if array_length(v_torneos, 1) > 1 then
    raise exception
      'La imputación cruza % torneos. Registrá un cobro por torneo.',
      array_length(v_torneos, 1);
  end if;

  v_torneo_id := v_torneos[1];

  insert into pago (tercero_id, fecha, monto, medio_pago, registrado_por)
  values (p_tercero_id, v_fecha, p_monto, p_medio, v_user_id)
  returning id into v_pago_id;

  perform imputar_pago(v_pago_id, p_imputaciones);

  with grupos as (
    select pt.concepto, sum(pi.monto) as monto
      from pago_imputacion pi
      join cuota c              on c.id = pi.cuota_id
      join plan_tarifa_linea l  on l.id = c.plan_tarifa_linea_id
      join plan_tarifa pt       on pt.id = l.plan_tarifa_id
     where pi.pago_id = v_pago_id
     group by pt.concepto
  )
  select
    coalesce(sum(g.monto), 0),
    jsonb_build_array(
      jsonb_build_object('cuenta', 'EFECTIVO_EN_TRANSITO', 'debe', coalesce(sum(g.monto), 0))
    ) || coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cuenta', case g.concepto
                      when 'inscripcion' then 'ING_INSCRIPCIONES'
                      when 'partidos'    then 'ING_PARTIDOS'
                    end,
          'haber', g.monto,
          'tercero_id', p_tercero_id)
        order by g.concepto),
      '[]'::jsonb)
    into v_agrupado, v_lineas
  from grupos g;

  if v_agrupado <> p_monto then
    raise exception
      'Las líneas suman % y el monto es %. No se registra un asiento que no cuadre.',
      v_agrupado, p_monto;
  end if;

  v_asiento_id := crear_asiento(
    p_fecha       => v_fecha,
    p_origen      => 'pago_equipo',
    p_descripcion => 'Efectivo recibido fuera de predio (en tránsito)',
    p_lineas      => v_lineas,
    p_torneo_id   => v_torneo_id,
    p_origen_id   => v_pago_id,
    p_created_by  => v_user_id
  );

  update pago set asiento_id = v_asiento_id where id = v_pago_id;

  return v_pago_id;
end;
$function$;


create or replace function public.liquidar_efectivo_transito(
  p_pago_id        uuid,
  p_predio_id      uuid,
  p_fecha          date default null,
  p_responsable_id uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_pago    record;
  v_fecha   date;
  v_lineas  jsonb;
  v_asiento uuid;
begin
  select id, monto, asiento_id into v_pago from pago where id = p_pago_id;

  if not found then
    raise exception 'El pago % no existe', p_pago_id;
  end if;

  if not exists (
    select 1 from caja k
     where k.tipo = 'efectivo' and k.activo and k.predio_id = p_predio_id
  ) then
    raise exception 'El predio % no tiene una caja de efectivo activa', p_predio_id;
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', 'CAJA_EFECTIVO',        'debe',  v_pago.monto),
    jsonb_build_object('cuenta', 'EFECTIVO_EN_TRANSITO', 'haber', v_pago.monto)
  );

  v_asiento := crear_asiento(
    p_fecha       => v_fecha,
    p_origen      => 'pago_equipo',
    p_descripcion => 'Liquidación de efectivo en tránsito',
    p_lineas      => v_lineas,
    p_predio_id   => p_predio_id,
    p_origen_id   => p_pago_id,
    p_created_by  => coalesce(p_responsable_id, auth.uid())
  );

  return v_asiento;
end;
$function$;

comment on function recibir_efectivo_en_transito(uuid, numeric, text, date, jsonb, uuid) is
  'B13 — registra un cobro en efectivo fuera de una caja de predio. Asienta contra EFECTIVO_EN_TRANSITO, no CAJA_EFECTIVO. Ingreso reconocido al cobrar (percibido puro). Confirmado por Facu 20/08.';
comment on function liquidar_efectivo_transito(uuid, uuid, date, uuid) is
  'B13 — mueve el efectivo en tránsito a la caja real del predio cuando la plata llega. Traslado puro, no genera ingreso nuevo.';