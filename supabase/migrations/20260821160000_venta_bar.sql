-- ═══════════════════════════════════════════════════════════════════════════
-- Ventas de bar · el ingreso del bar — PROPUESTA, NO APLICAR sin revisión (regla 11)
--
-- Grano: un cierre por día y predio, colgado de `dia_cancha`, UN asiento por
-- cierre. Percibido puro: la plata ya entró, no hay deudor ni cuota.
--
-- Decisión de Facu (21/08): el efectivo del bar está en un CAJÓN FÍSICO aparte
-- del torneo, así que su caja queda FUERA del arqueo del predio. El arqueo del
-- predio sigue siendo solo torneo.
--
-- No toca `crear_asiento` ni `anular_asiento`: las usa como puertas (reglas 8 y 4).
-- Del núcleo compartido toca solo el bloque 2: el check y los índices de
-- `caja`, y una rama nueva en `check_caja_predio`.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · Las cuentas ────────────────────────────────────────────────────────
--
-- ⚠️ DOS PREMISAS QUE NO SE SOSTUVIERON — leer antes de aplicar:
--
-- (a) `MERCADO_PAGO` **no existe**. El plan tiene 29 cuentas y ninguna es esa:
--     AMORT_ACUM · ANTICIPOS · BIENES_USO · CAJA_CENTRAL · CAJA_EFECTIVO ·
--     CAJA_TRANSFERENCIA · CAJA_USD · CHEQUES_A_PAGAR · DEUDORES_SPONSORS ·
--     EFECTIVO_EN_TRANSITO · FIN_DIF_CAMBIO · FIN_RENDIMIENTOS ·
--     FONDO_INVERSION · GAS_AMORT · GAS_BAR · GAS_FECHA · GAS_IMPUESTOS ·
--     GAS_PREDIO · GAS_SOCIOS · GAS_SUELDOS · ING_BAR · ING_INSCRIPCIONES ·
--     ING_PARTIDOS · ING_SPONSORS · INGRESO_DIFERIDO · PLANES_PAGO ·
--     PROVEEDORES · SOCIOS_A_PAGAR · VALORES_A_DEPOSITAR
--     Tampoco hay caja de Mercado Pago. Así que esta migración la CREA.
--
-- (b) No existe `v_arqueo`, y **nada matchea `CAJA_EFECTIVO%` con LIKE**. Ver
--     el bloque 1.b más abajo: cambia por qué el nombre funciona, no si funciona.
--
-- Nombres: se respetan los que eligió Facu —BAR_EFECTIVO, TARJETA,
-- MERCADO_PAGO— aunque rompan con el prefijo `CAJA_` de CAJA_TRANSFERENCIA y
-- CAJA_USD. En BAR_EFECTIVO el prefijo distinto es DELIBERADO (bloque 1.b); en
-- TARJETA y MERCADO_PAGO es solo estética del plan. Si preferís CAJA_TARJETA y
-- CAJA_MERCADO_PAGO, es renombrar acá y en las 3 referencias de la función —
-- ahora es gratis, con movimientos ya no.

insert into cuenta (id, codigo, nombre, tipo, imputable, padre_id) values
  (gen_random_uuid(), 'BAR_EFECTIVO', 'Bar Efectivo', 'activo', true, null),
  (gen_random_uuid(), 'TARJETA',      'Tarjeta',      'activo', true, null),
  (gen_random_uuid(), 'MERCADO_PAGO', 'Mercado Pago', 'activo', true, null)
on conflict (codigo) do nothing;

-- ING_BAR ya existe (ingreso, imputable, 0 movimientos). No se crea.


-- ── 1.b · Por qué el arqueo del predio NO ve el efectivo del bar ────────────
--
-- La premisa era «v_arqueo agarra CAJA_EFECTIVO%». Verificado: **no existe
-- ninguna vista `v_arqueo`**, y las dos que hay —v_arqueo_detalle y
-- v_arqueo_diferencia— ni siquiera tocan `cuenta`: leen `arqueo.saldo_sistema`,
-- que es un número ya CONGELADO al arquear (decisión 59).
--
-- El único punto donde el arqueo toca el plan de cuentas es
-- `saldo_efectivo_predio`, que usa **igualdad exacta**, no LIKE:
--
--     where c.codigo    = 'CAJA_EFECTIVO'
--       and a.predio_id = p_predio_id
--
-- Consecuencia doble:
--
--   • BAR_EFECTIVO queda fuera del arqueo del predio — que es lo que se busca.
--   • Con `=` habría quedado fuera **con cualquier nombre**, incluso
--     CAJA_EFECTIVO_BAR. O sea que el requisito ya se cumplía solo.
--
-- Igual el nombre sin prefijo VALE LA PENA, por defensa: el día que alguien
-- escriba `like 'CAJA_EFECTIVO%'` —que hoy matchea exactamente 1 cuenta y
-- parece inofensivo— absorbería la plata del bar al arqueo del torneo sin que
-- nadie lo note. BAR_EFECTIVO hace ese error imposible en vez de improbable.


-- ── 2 · `caja.tipo`, sus checks y sus índices ──────────────────────────────
--
-- ⚠️ ESTE BLOQUE CRECIÓ POR LO QUE ENCONTRÓ LA PRUEBA EN ROLLBACK. La versión
-- anterior daba a la caja del bar `tipo = 'efectivo'` y reventaba:
--
--     ERROR 23505: duplicate key value violates unique constraint
--     "uq_caja_efectivo_predio"
--     DETAIL: Key (tipo, predio_id)=(efectivo, <Tirolesa>) already exists.
--
-- `caja` tiene DOS índices parciales que no estaban a la vista:
--     uq_caja_efectivo_predio  unique (tipo, predio_id) where tipo = 'efectivo'
--     uq_caja_global           unique (tipo)            where tipo in ('transferencia','usd')
--
-- El primero dice «un predio, UNA caja de efectivo» — cierto mientras efectivo
-- significaba el cajón del torneo. Con el cajón del bar aparte, la premisa
-- cambió: ahora hay dos cajones físicos por predio.
--
-- Se resuelve con un TIPO PROPIO, `bar_efectivo`, no aflojando el índice. Mismo
-- criterio que el nombre de la cuenta (bloque 1.b): que un `where tipo =
-- 'efectivo'` escrito mañana no absorba la plata del bar. Aflojar el índice a
-- (tipo, predio_id, cuenta_id) también compilaba, pero dejaba las dos cajas
-- indistinguibles para cualquier query que filtre por tipo — que es justo el
-- error del que nos estamos cuidando.
--
-- Que el bar sea un tipo aparte y no `efectivo` NO contradice que adentro haya
-- billetes: el tipo acá dice de qué cajón se trata, y son dos cajones.

alter table caja drop constraint if exists caja_tipo_check;
alter table caja add constraint caja_tipo_check
  check (tipo = any (array['efectivo', 'bar_efectivo', 'transferencia', 'usd',
                           'tarjeta', 'mercado_pago']));

-- Un predio, una caja de bar. Espejo de uq_caja_efectivo_predio, que queda
-- intacto y sigue garantizando lo mismo para el cajón del torneo.
create unique index if not exists uq_caja_bar_efectivo_predio
  on caja (tipo, predio_id) where tipo = 'bar_efectivo';

-- uq_caja_global cubría transferencia y usd, y nada más. Sin extenderlo, nada
-- impediría dos cajas de Tarjeta o dos de Mercado Pago — y el saldo quedaría
-- duplicado en v_saldo_caja, que lista una fila por caja.
drop index if exists uq_caja_global;
create unique index uq_caja_global
  on caja (tipo) where tipo = any (array['transferencia', 'usd', 'tarjeta', 'mercado_pago']);

-- `check_caja_predio` SÍ necesita cambio, y es la única función del núcleo que
-- esta migración toca. Es una rama nueva para un tipo nuevo: las existentes
-- quedan literalmente iguales. Sin esto, la caja del bar caería en el `elsif`
-- final y sería rechazada con «Solo las cajas de efectivo se asignan a un
-- predio» — que con bar_efectivo dejó de ser cierto.
create or replace function public.check_caja_predio()
 returns trigger
 language plpgsql
as $function$
declare
  v_codigo text;
begin
  select codigo into v_codigo from cuenta where id = new.cuenta_id;

  if v_codigo is null then
    raise exception 'La caja debe apuntar a una cuenta existente';
  end if;

  -- bar_efectivo se suma acá: también es un cajón físico en un predio, y el
  -- invariante de la regla 9 —efectivo sin predio no se arquea— vale igual.
  if new.tipo in ('efectivo', 'bar_efectivo') then
    if v_codigo = 'CAJA_CENTRAL' then
      -- La central es el destino del efectivo, no un punto de cobro.
      if new.predio_id is not null then
        raise exception 'La caja central no se asigna a un predio';
      end if;
    elsif new.predio_id is null then
      raise exception 'Una caja de efectivo de predio debe asignarse a un predio';
    end if;
  elsif new.predio_id is not null then
    raise exception 'Solo las cajas de efectivo se asignan a un predio';
  end if;

  return new;
end;
$function$;


-- ── 3 · Las cajas ──────────────────────────────────────────────────────────
--
-- ⚠️ DIVERGENCIA DELIBERADA de los nombres del pedido (BAR_EFECTIVO_TIR /
-- BAR_EFECTIVO_AEP): va **UNA cuenta BAR_EFECTIVO con una caja por predio**,
-- no una cuenta por predio. Tres razones:
--
--   1. Es exactamente «como el efectivo del torneo es por predio», que fue el
--      criterio del pedido: CAJA_EFECTIVO es UNA cuenta con DOS cajas. La
--      separación por predio la hace `asiento.predio_id`, que es por donde
--      v_saldo_caja ya filtra:
--        where l.cuenta_id = cj.cuenta_id
--          and (cj.predio_id is null or a.predio_id = cj.predio_id)
--      O sea que «el bar tiene su propio saldo de efectivo, por predio» se
--      cumple igual, sin cuentas nuevas.
--
--   2. Una cuenta por predio mete códigos de predio (TIR, AEP) en el PLAN DE
--      CUENTAS: abrir un predio pasaría a necesitar una migración del plan en
--      vez de una fila. Es el tipo de dato-en-el-schema que la regla 12 evita.
--
--   3. El arqueo del bar futuro necesitaría una `saldo_bar_predio(predio, hasta)`
--      calcada de saldo_efectivo_predio — que con una cuenta es la misma
--      función con otro código, y con N cuentas es un IN dinámico.
--
-- Si querías las cuentas separadas a propósito —para verlas partidas en el
-- libro mayor y no solo en v_saldo_caja— decímelo y es cambiar este bloque.
-- Las cajas se insertan con un select sobre `predio`, no con nombres literales.
--
-- ⚠️ Un predio nuevo necesita su caja de bar. No hay trigger que la cree —
-- igual que hoy pasa con la caja de efectivo del predio.

insert into caja (tipo, nombre, predio_id, cuenta_id, activo)
select 'bar_efectivo', 'Bar Efectivo ' || p.nombre, p.id, c.id, true
  from predio p
 cross join cuenta c
 where c.codigo = 'BAR_EFECTIVO'
   and not exists (select 1 from caja k where k.cuenta_id = c.id and k.predio_id = p.id);

-- Tarjeta y Mercado Pago son globales, sin predio: la plata no está en el
-- predio sino en la cuenta del comercio. Mismo criterio que Caja Transferencia.

insert into caja (tipo, nombre, predio_id, cuenta_id, activo)
select 'tarjeta', 'Tarjeta', null, c.id, true
  from cuenta c where c.codigo = 'TARJETA'
   and not exists (select 1 from caja k where k.cuenta_id = c.id);

insert into caja (tipo, nombre, predio_id, cuenta_id, activo)
select 'mercado_pago', 'Mercado Pago', null, c.id, true
  from cuenta c where c.codigo = 'MERCADO_PAGO'
   and not exists (select 1 from caja k where k.cuenta_id = c.id);


-- ── 4 · La tabla ───────────────────────────────────────────────────────────
-- Pensada para que el detalle de productos cuelgue después SIN tocar el
-- asiento: `venta_bar_detalle (venta_bar_id, producto, cantidad, precio)` será
-- hija de esta tabla y no generará asientos. El asiento seguirá saliendo de los
-- tres montos del cierre, que son lo que efectivamente entró.

create table venta_bar (
  id              uuid primary key default gen_random_uuid(),
  dia_cancha_id   uuid not null references dia_cancha(id),

  monto_efectivo  numeric(16,2) not null default 0 check (monto_efectivo >= 0),
  monto_tarjeta   numeric(16,2) not null default 0 check (monto_tarjeta  >= 0),
  monto_mp        numeric(16,2) not null default 0 check (monto_mp       >= 0),

  -- Generada, no un número que alguien pueda desincronizar. Mismo patrón que
  -- gasto.total.
  total           numeric(16,2)
                    generated always as (monto_efectivo + monto_tarjeta + monto_mp) stored,

  asiento_id      uuid references asiento(id),
  observaciones   text,

  -- La anulación no borra: marca. Ver bloque 6.
  anulado_at      timestamptz,
  anulado_motivo  text,

  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),

  -- Un cierre todo en cero no es un cierre. Un día sin venta no tiene fila.
  constraint venta_bar_algun_medio
    check (monto_efectivo + monto_tarjeta + monto_mp > 0),

  -- Coherencia de la marca de anulación: o están los dos campos o ninguno.
  constraint venta_bar_anulacion_coherente
    check ((anulado_at is null) = (anulado_motivo is null))
);

-- Único por día/predio — `dia_cancha` ya es único por (fecha, predio_id), así
-- que alcanza con el dia_cancha_id.
--
-- ⚠️ ÍNDICE PARCIAL, NO `unique (dia_cancha_id)` a secas. Con el unique pleno,
-- anular un cierre dejaría el día BLOQUEADO PARA SIEMPRE: la fila anulada sigue
-- ahí —nada se borra, regla 4— y el segundo insert chocaría contra ella. Se
-- podría anular, pero nunca volver a cargar el día bien. El parcial dice lo que
-- en realidad se quiere: un cierre VIGENTE por día.
create unique index venta_bar_dia_unico
  on venta_bar (dia_cancha_id)
  where anulado_at is null;

create index venta_bar_asiento_idx on venta_bar (asiento_id);

comment on table venta_bar is
  'Cierre de caja del bar: un cierre por día y predio, colgado de dia_cancha. '
  'Genera UN asiento (percibido puro, origen=bar). Se registra el NETO por medio: '
  'no modela comisión de tarjeta/MP ni liquidación diferida. '
  'El efectivo va a BAR_EFECTIVO, que queda FUERA del arqueo del predio: el bar '
  'tiene cajón físico propio (decisión de Facu, 21/08). El arqueo del predio '
  'sigue siendo solo torneo. El detalle de productos, cuando exista, cuelga de '
  'acá y NO genera asientos. '
  'INTENCIÓN DE PERMISOS: registrar y anular = rol bar + admin, y el rol bar '
  'restringido a SU predio (dia_cancha.predio_id). HOY NO SE HACE CUMPLIR: RLS '
  'está apagado en las 48 tablas y no existe tabla de roles, así que no hay '
  'contra qué escribir la policy. Queda modelado para que el día que se encare '
  'RLS la regla esté escrita y no haya que reconstruirla.';

comment on column venta_bar.total is
  'Generada: monto_efectivo + monto_tarjeta + monto_mp. No se escribe.';
comment on column venta_bar.anulado_at is
  'Marca de anulación. El asiento se contraasienta con anular_asiento (regla 4); '
  'esta marca es la que libera el índice parcial para poder recargar el día.';


-- ── 5 · Registrar ──────────────────────────────────────────────────────────

create or replace function public.registrar_venta_bar(
  p_dia_cancha_id  uuid,
  p_efectivo       numeric default 0,
  p_tarjeta        numeric default 0,
  p_mp             numeric default 0,
  p_observaciones  text default null,
  p_created_by     uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id   uuid;
  v_fecha     date;
  v_predio_id uuid;
  v_efectivo  numeric(16,2);
  v_tarjeta   numeric(16,2);
  v_mp        numeric(16,2);
  v_total     numeric(16,2);
  v_lineas    jsonb := '[]'::jsonb;
  v_venta_id  uuid;
  v_asiento   uuid;
begin
  select dc.fecha, dc.predio_id
    into v_fecha, v_predio_id
    from dia_cancha dc
   where dc.id = p_dia_cancha_id;

  if not found then
    raise exception 'El día de cancha % no existe. Crealo con crear_dia_cancha '
                    '(no requiere jornada: un día de solo bar es válido).',
                    p_dia_cancha_id;
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable del cierre: se requiere p_created_by o sesión autenticada.';
  end if;

  v_efectivo := coalesce(p_efectivo, 0);
  v_tarjeta  := coalesce(p_tarjeta,  0);
  v_mp       := coalesce(p_mp,       0);

  if v_efectivo < 0 or v_tarjeta < 0 or v_mp < 0 then
    raise exception 'Los montos del cierre no pueden ser negativos (efectivo %, tarjeta %, MP %). '
                    'Una corrección se hace anulando el cierre y recargándolo.',
                    v_efectivo, v_tarjeta, v_mp;
  end if;

  v_total := v_efectivo + v_tarjeta + v_mp;

  if v_total = 0 then
    raise exception 'Un cierre de bar necesita al menos un medio con monto. '
                    'Un día sin ventas no se cierra: no se carga.';
  end if;

  -- El insert va PRIMERO: si el día ya tiene cierre vigente, el índice parcial
  -- lo rechaza acá y no queda un asiento huérfano en el diario.
  begin
    insert into venta_bar (
      dia_cancha_id, monto_efectivo, monto_tarjeta, monto_mp,
      observaciones, created_by
    ) values (
      p_dia_cancha_id, v_efectivo, v_tarjeta, v_mp,
      p_observaciones, v_user_id
    )
    returning id into v_venta_id;
  exception when unique_violation then
    raise exception 'Ese día ya tiene un cierre de bar registrado. '
                    'Si está mal, anulalo con anular_venta_bar y volvé a cargarlo.';
  end;

  -- Solo las líneas con monto: un cierre sin tarjeta no ensucia el diario con
  -- una línea en cero.
  if v_efectivo > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta', 'BAR_EFECTIVO', 'debe', v_efectivo);
  end if;
  if v_tarjeta > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta', 'TARJETA', 'debe', v_tarjeta);
  end if;
  if v_mp > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta', 'MERCADO_PAGO', 'debe', v_mp);
  end if;

  v_lineas := v_lineas || jsonb_build_object('cuenta', 'ING_BAR', 'haber', v_total);

  -- p_fecha es la del día, NO current_date: un cierre del sábado cargado el
  -- lunes tiene que caer en el sábado o el saldo de caja de ese día miente.
  --
  -- p_predio_id se pasa siempre, aunque crear_asiento no lo exija: su guardia
  -- mira la cuenta 'CAJA_EFECTIVO' literal y no se entera de BAR_EFECTIVO. Sin
  -- predio, el efectivo del bar quedaría fuera de v_saldo_caja —que filtra por
  -- a.predio_id— o sea invisible. Lo garantiza esta función porque crear_asiento
  -- no puede, y no se toca (regla 8).
  v_asiento := crear_asiento(
    p_fecha       => v_fecha,
    p_origen      => 'bar',
    p_descripcion => 'Cierre de bar',
    p_lineas      => v_lineas,
    p_torneo_id   => null,
    p_jornada_id  => null,
    p_predio_id   => v_predio_id,
    p_origen_id   => v_venta_id,
    p_created_by  => v_user_id
  );

  update venta_bar set asiento_id = v_asiento where id = v_venta_id;

  return v_venta_id;
end;
$function$;

comment on function registrar_venta_bar(uuid, numeric, numeric, numeric, text, uuid) is
  'Única vía de alta de un cierre de bar. Percibido puro: debita BAR_EFECTIVO '
  '(del predio del día), TARJETA y MERCADO_PAGO, y acredita ING_BAR por el total, '
  'en un solo asiento con origen=bar. Registra el NETO — comisión y liquidación '
  'diferida quedan fuera a propósito. Exige al menos un medio > 0 y rechaza el '
  'segundo cierre vigente del mismo día. torneo_id va NULL: el bar es estructura '
  'permanente, corre haya torneo o no (concepto 3).';


-- ── 6 · Anular ─────────────────────────────────────────────────────────────
-- Delega en anular_asiento (regla 4): contraasiento, original marcado, nada se
-- borra. No existe "editar un cierre" — se anula y se registra de nuevo, igual
-- que gasto y cheque.

create or replace function public.anular_venta_bar(
  p_venta_id    uuid,
  p_motivo      text,
  p_fecha       date default null,
  p_created_by  uuid default null
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
    v_user_id
  );

  update venta_bar
     set anulado_at     = now(),
         anulado_motivo = p_motivo
   where id = p_venta_id;

  return v_asiento;
end;
$function$;

comment on function anular_venta_bar(uuid, text, date, uuid) is
  'Anula un cierre de bar delegando en anular_asiento (regla 4). Marca la fila, '
  'lo que además libera el índice parcial para poder recargar el día. No hay '
  'edición de cierres: se anula y se registra de nuevo.';


-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ QUEDA COMO EXTENSIÓN FUTURA
--
-- 1 · ARQUEO DEL BAR. Hoy el bar tiene SALDO de efectivo (v_saldo_caja, por
--     predio) pero no tiene ARQUEO: nadie cuenta los billetes del cajón del bar
--     contra el sistema. El arqueo del predio quedó deliberadamente solo torneo,
--     así que esa plata no la controla ningún circuito.
--     Cuando se encare, es el circuito de `arqueo` calcado con dos piezas:
--       · saldo_bar_predio(p_predio_id, p_hasta) — igual que
--         saldo_efectivo_predio pero con codigo='BAR_EFECTIVO';
--       · una tabla arqueo_bar, o un `ambito` en `arqueo` (que hoy es único por
--         dia_cancha_id, así que admitir dos arqueos del mismo día pide tocar
--         esa restricción).
--     Es otra cosa que el ingreso: esta migración modela que la plata ENTRA,
--     no que alguien la cuenta.
--
-- 2 · DETALLE DE PRODUCTOS. `venta_bar_detalle (venta_bar_id, producto,
--     cantidad, precio)`, hija de venta_bar. NO genera asientos: el asiento
--     sigue saliendo de los tres montos del cierre. Si el detalle cuadra o no
--     contra el total es una decisión de ese momento, no algo que el asiento
--     herede.
--
-- 3 · COMISIÓN Y LIQUIDACIÓN DIFERIDA. Hoy se registra el NETO que entra, y
--     TARJETA y MERCADO_PAGO ACUMULAN SIN QUE NADA LAS BAJE — son plata a
--     cobrar, no caja disponible. La pantalla tiene que decirlo o se lee mal.
--     Cuando llegue: la comisión es un gasto contra GAS_BAR, y la liquidación
--     una función que mueve TARJETA/MERCADO_PAGO → CAJA_TRANSFERENCIA contra el
--     resumen del proveedor. Ninguna de las dos cambia esta tabla.
--
-- 4 · COSTO DE LA MERCADERÍA. `GAS_BAR` existe con 8 categorías y CERO gastos
--     cargados. Hasta que se carguen, el bar tiene ingreso pero no margen.
--
-- 5 · CAJA DE BAR DE UN PREDIO NUEVO. No hay trigger que la cree. Abrir un
--     predio hoy ya pide crear su caja de efectivo a mano; ahora son dos.
-- ═══════════════════════════════════════════════════════════════════════════
