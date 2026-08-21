-- ═══════════════════════════════════════════════════════════════════════════
-- Retiro de efectivo del bar — PROPUESTA, NO APLICAR sin revisión (regla 11)
--
-- Hoy al bar SOLO le entra plata: `registrar_venta_bar` debita BAR_EFECTIVO y
-- ninguna función lo acredita. El saldo sube y no baja nunca. Sin salida, el
-- arqueo del bar mediría una deriva, no una diferencia — por eso el retiro va
-- antes que el arqueo.
--
-- Alcance A (decisión de Facu, 21/08): destinos caja central y banco. Socios
-- queda para cuando se conecte con el módulo — el destino es un parámetro con
-- CHECK, así que sumarlo después es una línea.
--
-- ⚠️ NO reusa `registrar_movimiento_fondo`. Ver el bloque 0.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0 · Por qué NO se reusa registrar_movimiento_fondo ─────────────────────
--
-- La idea era que fuera «el movimiento entre cajas genérico que ya existe».
-- No lo es, y lo verifiqué ejecutándolo con la caja del bar en rollback:
--
--   registrar_movimiento_fondo('colocacion', 50000, <caja bar Tirolesa>, …)
--
--   · asentó   FONDO_INVERSION debe 50.000 / BAR_EFECTIVO haber 50.000
--   · a CAJA_CENTRAL le llegó                                        $0
--   · origen del asiento                                        'fondo'
--   · predio_id del asiento                                       NULL
--     → v_saldo_caja mostró $500.000 con $450.000 reales
--   · insertó una fila en `movimiento_fondo`
--   · y aceptó un retiro de $999.999.999 sobre un saldo de $500.000
--
-- Su contraparte es SIEMPRE `FONDO_INVERSION`: lo único genérico que tiene es
-- que resuelve la cuenta de ORIGEN desde `caja_id`. Esa mecánica sí se reusa
-- acá —resolver la cuenta en vez de hardcodearla—; la función, no.
--
-- Usarla habría mandado la plata del bar al fondo de inversión, ensuciado el
-- módulo del fondo con retiros que no le pertenecen, y dejado el saldo de la
-- caja mintiendo. Las cuatro cosas en silencio.


-- ── 1 · saldo_bar_predio ───────────────────────────────────────────────────
-- Gemela de `saldo_efectivo_predio`, que hardcodea 'CAJA_EFECTIVO' y por eso no
-- sirve para el bar. Se crea acá porque el retiro la necesita para validar,
-- pero su segundo consumidor es el ARQUEO DEL BAR: es el «saldo del sistema»
-- que se va a comparar contra lo contado.
--
-- NO filtra anulados, y es deliberado (regla 4): el asiento original y su
-- contraasiento se compensan solos. Filtrar `anulado_por is null` excluiría el
-- original y dejaría el contraasiento huérfano, dando −X en vez de 0. Mismo
-- criterio, y misma nota, que saldo_efectivo_predio.

create or replace function public.saldo_bar_predio(p_predio_id uuid, p_hasta date)
returns numeric
language sql
stable
as $function$
  select coalesce(sum(l.debe - l.haber), 0)::numeric(16,2)
  from asiento_linea l
  join asiento a on a.id = l.asiento_id
  join cuenta  c on c.id = l.cuenta_id
  where c.codigo    = 'BAR_EFECTIVO'
    and a.predio_id = p_predio_id
    and a.fecha    <= p_hasta;
$function$;

comment on function saldo_bar_predio(uuid, date) is
  'El efectivo del bar de un predio a una fecha, derivado del diario. Gemela de '
  'saldo_efectivo_predio pero sobre BAR_EFECTIVO — el cajón del bar está fuera '
  'del arqueo del torneo. No filtra anulados: original y contraasiento se '
  'compensan (regla 4). La usa el retiro para validar saldo, y la va a usar el '
  'arqueo del bar como saldo esperado.';


-- ── 2 · La tabla ───────────────────────────────────────────────────────────
-- NO cuelga de `dia_cancha`, a diferencia del cierre y del arqueo. Un retiro
-- puede pasar cualquier día —un martes, sin bar abierto— y atarlo a dia_cancha
-- obligaría a inventar un día que no existió. Lleva fecha y predio propios.
--
-- El destino queda como CHECK y no como enum de Postgres: agregar 'socios'
-- después es un `drop constraint` + `add constraint`, contra un `alter type`
-- que no se puede revertir en la misma transacción.

create table retiro_bar (
  id              uuid primary key default gen_random_uuid(),
  predio_id       uuid not null references predio(id),
  fecha           date not null,
  monto           numeric(16,2) not null check (monto > 0),

  destino         text not null check (destino in ('central', 'banco')),
  motivo          text,

  asiento_id      uuid references asiento(id),

  anulado_at      timestamptz,
  anulado_motivo  text,

  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),

  constraint retiro_bar_anulacion_coherente
    check ((anulado_at is null) = (anulado_motivo is null))
);

create index retiro_bar_predio_fecha_idx on retiro_bar (predio_id, fecha);
create index retiro_bar_asiento_idx      on retiro_bar (asiento_id);

-- Sin unique: a diferencia del cierre —uno por día— puede haber varios retiros
-- el mismo día del mismo predio, y es normal (se lleva plata dos veces).

comment on table retiro_bar is
  'Salida de efectivo del cajón del bar. Transferencia interna: no toca ING ni '
  'GAS, no afecta el resultado. Destinos: central (lo habitual) y banco. '
  'Socios queda pendiente del módulo — el CHECK de destino se amplía cuando se '
  'conecte. No cuelga de dia_cancha: un retiro puede ser cualquier día. '
  'INTENCIÓN DE PERMISOS: registrar = encargado_bar (su predio) + admin. Hoy no '
  'se hace cumplir — RLS apagado y no existe tabla de roles.';


-- ── 3 · Registrar ──────────────────────────────────────────────────────────

create or replace function public.retirar_efectivo_bar(
  p_predio_id  uuid,
  p_monto      numeric,
  p_destino    text,
  p_fecha      date default null,
  p_motivo     text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id  uuid;
  v_fecha    date;
  v_predio   text;
  v_cuenta   text;
  v_saldo    numeric(16,2);
  v_retiro   uuid;
  v_asiento  uuid;
begin
  select nombre into v_predio from predio where id = p_predio_id;
  if not found then
    raise exception 'El predio % no existe', p_predio_id;
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable del retiro: se requiere p_created_by o sesión autenticada.';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del retiro debe ser positivo (recibido: %)', p_monto;
  end if;

  -- El destino se traduce a cuenta acá y no en la pantalla: si la pantalla
  -- eligiera el código de cuenta, cualquier cliente podría mandar cualquiera.
  --
  -- 'banco' → CAJA_TRANSFERENCIA porque NO EXISTE una cuenta BANCO en el plan.
  -- Lo bancario se modela como «transferencia» en todo el sistema. Si algún día
  -- el banco merece cuenta propia, se cambia acá y en ningún otro lado.
  v_cuenta := case p_destino
                when 'central' then 'CAJA_CENTRAL'
                when 'banco'   then 'CAJA_TRANSFERENCIA'
              end;

  if v_cuenta is null then
    -- 'socios' tiene rama propia y mensaje propio: es un destino DECIDIDO que
    -- todavía no se conectó, no un typo. Decirle "desconocido" mandaría a
    -- buscar el error donde no está.
    if p_destino = 'socios' then
      raise exception
        'El destino socios todavía no está disponible: falta conectarlo con el '
        'módulo de socios (SOCIOS_A_PAGAR). Por ahora, central o banco.';
    end if;

    raise exception
      'Destino "%" desconocido. Los válidos son central y banco.', p_destino;
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  -- No se puede retirar más de lo que hay. Se mide AL DÍA DEL RETIRO, que es lo
  -- que significa «no había tanta plata en el cajón ese día».
  --
  -- Límite conocido: un retiro cargado con fecha vieja puede pasar esta
  -- validación y aun así dejar corto un día posterior. No se blinda acá porque
  -- hacerlo obligaría a revalidar toda la línea de tiempo en cada alta; lo que
  -- lo detecta es el ARQUEO, que para eso existe.
  v_saldo := saldo_bar_predio(p_predio_id, v_fecha);

  if p_monto > v_saldo then
    raise exception
      'No se puede retirar % del bar de %: al % hay %. '
      'Si la plata está, falta cargar el cierre de ventas de ese día.',
      p_monto, v_predio, v_fecha, v_saldo;
  end if;

  -- El insert va primero, para que el asiento nazca con su origen_id y no quede
  -- un asiento suelto si la fila falla.
  insert into retiro_bar (predio_id, fecha, monto, destino, motivo, created_by)
  values (p_predio_id, v_fecha, p_monto, p_destino, p_motivo, v_user_id)
  returning id into v_retiro;

  -- Transferencia interna: dos cuentas de activo. No toca ING ni GAS, así que
  -- el resultado no se mueve — la plata cambia de lugar, no de dueño.
  --
  -- p_predio_id se pasa SIEMPRE y es lo que hace que el retiro se vea. La
  -- guardia de crear_asiento mira 'CAJA_EFECTIVO' literal y no conoce
  -- BAR_EFECTIVO: sin predio el asiento entra igual, el diario cuadra, y
  -- v_saldo_caja —que filtra por a.predio_id— no lo ve. Verificado: la caja
  -- quedaba mintiendo sin que nada avisara.
  v_asiento := crear_asiento(
    p_fecha       => v_fecha,
    p_origen      => 'bar',
    p_descripcion => 'Retiro de efectivo del bar · ' || v_predio || ' · ' || p_destino,
    p_lineas      => jsonb_build_array(
                       jsonb_build_object('cuenta', v_cuenta,       'debe',  p_monto),
                       jsonb_build_object('cuenta', 'BAR_EFECTIVO', 'haber', p_monto)
                     ),
    p_torneo_id   => null,
    p_jornada_id  => null,
    p_predio_id   => p_predio_id,
    p_origen_id   => v_retiro,
    p_created_by  => v_user_id
  );

  update retiro_bar set asiento_id = v_asiento where id = v_retiro;

  return v_retiro;
end;
$function$;

comment on function retirar_efectivo_bar(uuid, numeric, text, date, text, uuid) is
  'Única vía de salida del efectivo del bar. Acredita BAR_EFECTIVO del predio y '
  'debita el destino: CAJA_CENTRAL (central) o CAJA_TRANSFERENCIA (banco). '
  'Transferencia interna: no toca resultado. Valida que el monto no supere el '
  'saldo del bar a esa fecha. NO usa registrar_movimiento_fondo, que asienta '
  'contra FONDO_INVERSION y no valida saldo — ver el bloque 0 de la migración.';


-- ── 4 · Anular ─────────────────────────────────────────────────────────────

create or replace function public.anular_retiro_bar(
  p_retiro_id  uuid,
  p_motivo     text,
  p_fecha      date default null,
  p_created_by uuid default null
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
    v_user_id
  );

  update retiro_bar
     set anulado_at = now(), anulado_motivo = p_motivo
   where id = p_retiro_id;

  return v_asiento;
end;
$function$;

comment on function anular_retiro_bar(uuid, text, date, uuid) is
  'Anula un retiro delegando en anular_asiento (regla 4). La plata vuelve al '
  'cajón del bar por el contraasiento. No hay edición: se anula y se recarga.';
