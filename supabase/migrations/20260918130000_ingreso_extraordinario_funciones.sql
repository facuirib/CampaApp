-- ═══════════════════════════════════════════════════════════════════════════
-- REVISADA Y APLICADA (20/10/2026), con un cambio de Facu sobre la propuesta:
-- el predio se acepta TAMBIÉN con transferencia — el estacionamiento es «del
-- predio X» aunque lo paguen por transferencia. El predio con transferencia
-- es una DIMENSIÓN del ingreso (queda en la fila), no una caja: al asiento
-- solo viaja con efectivo, porque trg_caja_predio exige que el predio del
-- asiento acompañe movimientos de caja física y nada más.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ingreso extraordinario (3/3) · asiento_origen_check + las dos funciones
--
-- La lista de abajo es la que devolvió, en la base hosted, el día de esta
-- migración:
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'asiento_origen_check' and conrelid = 'public.asiento'::regclass;
--
-- → devengo_equipo, pago_equipo, gasto_devengo, gasto_pago, bar, arqueo,
--   sponsor, socio, usd, amortizacion, cheque, fondo, ajuste, apertura,
--   traslado
--
-- Si entre hoy y el día de aplicar esta migración se agregó algún `origen`
-- nuevo (otra migración tocó este constraint), VOLVER A CORRER esa consulta
-- antes de aplicar — no asumir que la lista de acá sigue siendo la real.
-- Es el mismo riesgo de drift entre migración y base hosted que ya pasó
-- antes en este proyecto.
alter table public.asiento drop constraint asiento_origen_check;

alter table public.asiento add constraint asiento_origen_check
  check (origen = any (array[
    'devengo_equipo', 'pago_equipo', 'gasto_devengo', 'gasto_pago',
    'bar', 'arqueo', 'sponsor', 'socio', 'usd', 'amortizacion',
    'cheque', 'fondo', 'ajuste', 'apertura', 'traslado',
    'ingreso_extraordinario'
  ]));

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

  return v_ingreso_id;
end
$function$;

comment on function public.registrar_ingreso_extraordinario(numeric, text, date, text, uuid, uuid, uuid, uuid, uuid) is
  'Un ingreso que no es cuota de equipo, de sponsor ni venta de bar. Sólo '
  'efectivo o transferencia. El id se genera antes del asiento para que la '
  'fila nazca completa en un solo insert, sin UPDATE posterior —esta tabla '
  'no tiene policy de UPDATE—. Rechaza si no es admin/finanzas, o si '
  'p_cuenta_ingreso es una de las cuatro cuentas con circuito propio.';

create or replace function public.anular_ingreso_extraordinario(
  p_ingreso_id uuid,
  p_motivo     text,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_asiento_id       uuid;
  v_anulado_por      uuid;
  v_nuevo_asiento_id uuid;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Anular un ingreso extraordinario es de administrador o finanzas. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select ie.asiento_id, a.anulado_por into v_asiento_id, v_anulado_por
    from ingreso_extraordinario ie
    join asiento a on a.id = ie.asiento_id
   where ie.id = p_ingreso_id;

  if not found then
    raise exception 'El ingreso extraordinario % no existe', p_ingreso_id;
  end if;

  if v_anulado_por is not null then
    raise exception 'El ingreso % ya está anulado', p_ingreso_id;
  end if;

  v_nuevo_asiento_id := anular_asiento(v_asiento_id, p_motivo, null, coalesce(p_created_by, auth.uid()), true);

  return v_nuevo_asiento_id;
end;
$function$;

comment on function public.anular_ingreso_extraordinario(uuid, text, uuid) is
  'Contraasiento del ingreso, igual que cualquier anulación (regla 4): nunca '
  'edita ni borra. "Anulado" se lee de asiento.anulado_por — no hay una '
  'bandera propia en ingreso_extraordinario, ni la necesita.';
