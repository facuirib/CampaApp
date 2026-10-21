-- ═══════════════════════════════════════════════════════════════════════════
-- PROPUESTA — NO APLICAR SIN OK DE FACU (regla 11) · avisado a Horacio
-- (coordinacion.md): función nueva que GENERA ASIENTOS — su dominio.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- APERTURA DE CAJA: poner la app en marcha con el torneo ya empezado — cargar
-- el saldo que cada caja tiene a la fecha de corte.
--
-- ── El principio contable ───────────────────────────────────────────────────
--
-- El saldo inicial NO es un ingreso: es plata que ya existía. El asiento
-- debita la caja y acredita PATRIMONIO (cuenta nueva SALDOS_INICIALES — el
-- plan no tenía ninguna de tipo patrimonio). El P&L no se entera POR
-- CONSTRUCCIÓN: las vistas de resultado suman cuentas tipo ingreso/egreso, y
-- patrimonio no es ninguna de las dos. `asiento.origen` ya contemplaba
-- 'apertura' en su check desde 001 — este es el circuito que lo estrena.
--
-- ── Reglas ──────────────────────────────────────────────────────────────────
--
-- · UNA apertura por caja: si la caja ya tiene un asiento origen='apertura'
--   VIGENTE (no anulado), se rechaza con aviso. Para corregir: regla 4 —
--   anular_asiento (contraasiento) y abrir de nuevo.
-- · Caja de efectivo → el asiento lleva su predio (trg_caja_predio).
-- · Caja USD → p_monto es la CANTIDAD DE DÓLARES y p_tc la cotización,
--   obligatoria: el asiento entra en pesos (cantidad × tc) y se registra la
--   fila en usd_operacion (tipo 'apertura', nuevo en su check) para que
--   v_tenencia_usd derive cantidad y promedio ponderado consistentes — el
--   mismo contrato que comprar_usd. Tocar CAJA_USD sin esa fila correría el
--   promedio en silencio (tabla de puertas).
-- · Guarda admin·finanzas (SENSIBLE: escribe patrimonio). Catálogo:
--   'caja.abrir' — entra con el commit que aplique esto.

-- 1 · La contrapartida: la primera cuenta de patrimonio del plan.
insert into cuenta (codigo, nombre, tipo, imputable)
values ('SALDOS_INICIALES', 'Saldos iniciales (apertura)', 'patrimonio', true)
on conflict (codigo) do nothing;

comment on column cuenta.tipo is
  'activo · pasivo · patrimonio · ingreso · egreso · financiero. Patrimonio '
  'estrenado el 22/10/26 con SALDOS_INICIALES: la contrapartida de la '
  'apertura de cajas — saldo que ya existía, nunca un ingreso del torneo.';

-- 2 · usd_operacion acepta el tipo 'apertura'.
alter table usd_operacion drop constraint usd_operacion_tipo_check;
alter table usd_operacion add constraint usd_operacion_tipo_check
  check (tipo in ('compra', 'venta', 'revaluacion', 'apertura'));

-- 3 · La puerta.
create or replace function public.abrir_saldo_caja(
  p_caja_id    uuid,
  p_monto      numeric,
  p_fecha      date,
  p_tc         numeric default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_caja        record;
  v_user_id     uuid;
  v_monto_pesos numeric(16,2);
  v_descripcion text;
  v_asiento_id  uuid;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Abrir el saldo de una caja es de administrador o finanzas. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select c.*, cu.codigo as cuenta_codigo
    into v_caja
    from caja c join cuenta cu on cu.id = c.cuenta_id
   where c.id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not v_caja.activo then
    raise exception 'La caja «%» está inactiva — no se le abre saldo.', v_caja.nombre;
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception
      'El saldo inicial debe ser positivo (se recibió %). Una caja que '
      'arranca en cero no necesita apertura.', p_monto;
  end if;

  -- UNA apertura vigente por caja. Si la que hay se anuló (contraasiento),
  -- se puede abrir de nuevo — por eso el filtro de anulado_por.
  if exists (
    select 1 from asiento a
     where a.origen = 'apertura' and a.origen_id = p_caja_id
       and a.anulado_por is null
  ) then
    raise exception
      'La caja «%» ya tiene su apertura cargada. Si el saldo estaba mal, '
      'anulá ese asiento (anular_asiento, queda el contraasiento) y abrila '
      'de nuevo — la apertura no se edita (regla 4).', v_caja.nombre;
  end if;

  -- USD: p_monto es CANTIDAD de dólares, y la cotización es obligatoria.
  -- El resto de las cajas: pesos directos, y p_tc no corresponde.
  if v_caja.tipo = 'usd' then
    if p_tc is null or p_tc <= 0 then
      raise exception
        'La apertura de la caja USD necesita la cotización (p_tc): el saldo '
        'entra en pesos (cantidad × tc) y fija el promedio ponderado inicial.';
    end if;
    v_monto_pesos := round(p_monto * p_tc, 2);
    v_descripcion := format('Apertura de caja · %s · USD %s a %s', v_caja.nombre, p_monto, p_tc);
  else
    if p_tc is not null then
      raise exception
        'La cotización (p_tc) es solo para la caja USD — «%» abre en pesos.',
        v_caja.nombre;
    end if;
    v_monto_pesos := p_monto;
    v_descripcion := 'Apertura de caja · ' || v_caja.nombre;
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception
      'Falta responsable de la apertura: se requiere p_created_by o sesión autenticada.';
  end if;

  -- El asiento: caja al debe, patrimonio al haber. torneo_id NULL —la
  -- apertura es estructura, anterior a cualquier torneo— y el predio de la
  -- caja si es física (trg_caja_predio). origen_id = la caja: es el ancla de
  -- la idempotencia de arriba.
  v_asiento_id := crear_asiento(
    p_fecha       => p_fecha,
    p_origen      => 'apertura',
    p_descripcion => v_descripcion,
    p_lineas      => jsonb_build_array(
      jsonb_build_object('cuenta', v_caja.cuenta_codigo, 'debe', v_monto_pesos),
      jsonb_build_object('cuenta', 'SALDOS_INICIALES', 'haber', v_monto_pesos)
    ),
    p_torneo_id   => null,
    p_predio_id   => v_caja.predio_id,
    p_origen_id   => p_caja_id,
    p_created_by  => v_user_id
  );

  -- La tenencia USD deriva de usd_operacion: sin esta fila, el asiento
  -- movería CAJA_USD y el promedio ponderado quedaría corrido (la tabla de
  -- puertas lo prohíbe). Con ella, v_tenencia_usd da cantidad = p_monto y
  -- promedio = p_tc, exactos.
  if v_caja.tipo = 'usd' then
    insert into usd_operacion (fecha, tipo, cantidad, tc, monto_pesos, motivo, asiento_id)
    values (p_fecha, 'apertura', p_monto, p_tc, v_monto_pesos,
            'Saldo inicial a la fecha de corte', v_asiento_id);
  end if;

  return v_asiento_id;
end;
$function$;

comment on function public.abrir_saldo_caja(uuid, numeric, date, numeric, uuid) is
  'Carga el saldo inicial de una caja a la fecha de corte: UN asiento '
  'origen=apertura que debita la caja y acredita SALDOS_INICIALES '
  '(patrimonio — el P&L no se entera: no es un ingreso). Una apertura '
  'vigente por caja; corregir = anular + abrir de nuevo (regla 4). Para la '
  'caja USD, p_monto es la cantidad de dólares y p_tc la cotización: asienta '
  'pesos y registra usd_operacion tipo apertura para que la tenencia y el '
  'promedio ponderado deriven bien. Solo admin y finanzas.';
