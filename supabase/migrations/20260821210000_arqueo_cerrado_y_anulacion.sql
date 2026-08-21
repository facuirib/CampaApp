-- ═══════════════════════════════════════════════════════════════════════════
-- Arqueo · estado terminal 'cerrado' (③) y anulación (④)
-- PROPUESTA, NO APLICAR sin revisión (regla 11)
--
-- Van juntas porque tocan la misma tabla y el mismo CHECK. Separarlas
-- significaría migrar `arqueo` dos veces, y la segunda encima de la primera.
--
-- `arqueo` tiene 0 filas: no hay backfill ni riesgo de datos. Es el momento.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ PIEZA ③ · el estado que faltaba                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- El CHECK sólo admitía ('pendiente_entrega','entregado'), y «entregado» es lo
-- ÚNICO terminal. Eso deja sin salida a dos casos, y el segundo no es un borde:
--
--   · Torneo con contado 0 — `registrar_entrega_central` lo rechaza («no hay
--     efectivo que entregar»), así que queda pendiente para siempre. Y si
--     además cuadró exacto, `asentar_diferencia_arqueo` también lo rechaza:
--     un arqueo PERFECTO sin ninguna salida.
--
--   · TODOS los arqueos del bar — el bar nunca entrega a central, saca por
--     `retirar_efectivo_bar`. Hoy el 100% nace 'pendiente_entrega' y se queda
--     ahí. La pantalla lo disimula mostrando «Registrado», pero el DATO está
--     mal, y `v_efectivo_sin_rendir` los listaba (verificado: un arqueo de $0
--     aparecía como «1 arqueo pendiente, $0»).
--
-- 'cerrado' significa: ARQUEADO Y SIN NADA QUE ENTREGAR.

alter table arqueo drop constraint if exists arqueo_estado_check;
alter table arqueo add constraint arqueo_estado_check
  check (estado in ('pendiente_entrega', 'entregado', 'cerrado'));

comment on column arqueo.estado is
  'pendiente_entrega → la plata la tiene el responsable, falta entregarla a '
  'central (solo torneo, contado > 0). entregado → se entregó. cerrado → '
  'arqueado y sin nada que entregar: todos los del bar, y los del torneo con '
  'contado 0.';


-- ── ③.b · Quién nace cerrado ───────────────────────────────────────────────
--
-- Se decide AL CREAR y no con una función aparte, porque en los dos casos se
-- sabe en ese momento y no cambia después:
--
--   · ambito = 'bar'      → siempre. El bar no tiene tramo de entrega.
--   · contado = 0         → no hay nada que entregar, nunca lo va a haber.
--
-- NO hace falta un `cerrar_arqueo_sin_entrega`: con contado > 0 el torneo
-- SIEMPRE tiene algo que entregar, así que 'pendiente_entrega' es correcto y
-- que se quede ahí hasta el lunes es el estado real (decisión 58: el arqueo
-- pendiente ES el estado de «la plata la tiene su responsable»).
--
-- Un arqueo 'cerrado' con diferencia TODAVÍA puede asentarla:
-- `asentar_diferencia_arqueo` mira `asiento_ajuste_id` y `diferencia`, no el
-- estado. Cerrar no es «terminado», es «no hay entrega».
--
-- ⚠️ Sin `drop function`: la firma NO cambia. Se agrega lógica, no parámetros.

create or replace function public.crear_arqueo(
  p_dia_cancha_id  uuid,
  p_saldo_contado  numeric,
  p_responsable_id uuid default null,
  p_ambito         text default 'torneo'
)
returns uuid
language plpgsql
as $function$
declare
  v_dia         record;
  v_responsable uuid;
  v_sistema     numeric(16,2);
  v_estado      text;
  v_id          uuid;
begin
  if p_ambito not in ('torneo', 'bar') then
    raise exception 'Ámbito inválido: "%". Los válidos son torneo y bar.', p_ambito;
  end if;

  select dc.id, dc.fecha, dc.predio_id into v_dia
    from dia_cancha dc where dc.id = p_dia_cancha_id;

  if not found then
    raise exception 'El día de cancha % no existe', p_dia_cancha_id;
  end if;

  if p_saldo_contado is null or p_saldo_contado < 0 then
    raise exception 'El saldo contado debe ser un importe no negativo (recibido: %)',
      p_saldo_contado;
  end if;

  -- El unique es parcial (ver pieza ④): un arqueo ANULADO no bloquea rehacer.
  if exists (select 1 from arqueo
              where dia_cancha_id = p_dia_cancha_id and ambito = p_ambito
                and anulado_at is null) then
    raise exception
      'Ese día de cancha ya tiene un arqueo de %. Un arqueo por día, predio y '
      'ámbito. Si está mal, anulalo con anular_arqueo y volvé a cargarlo.',
      p_ambito;
  end if;

  v_responsable := coalesce(p_responsable_id, auth.uid(), (select id from auth.users limit 1));
  if v_responsable is null then
    raise exception 'No hay usuario. Creá uno en Authentication o pasá p_responsable_id.';
  end if;

  v_sistema := case p_ambito
                 when 'torneo' then saldo_efectivo_predio(v_dia.predio_id, v_dia.fecha)
                 when 'bar'    then saldo_bar_predio(v_dia.predio_id, v_dia.fecha)
               end;

  v_estado := case
                when p_ambito = 'bar'      then 'cerrado'
                when p_saldo_contado = 0   then 'cerrado'
                else 'pendiente_entrega'
              end;

  insert into arqueo (dia_cancha_id, saldo_sistema, saldo_contado,
                      estado, responsable_id, ambito)
  values (p_dia_cancha_id, v_sistema, p_saldo_contado,
          v_estado, v_responsable, p_ambito)
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function crear_arqueo(uuid, numeric, uuid, text) is
  'Registra el conteo de un cajón y congela el saldo del sistema. NO genera '
  'asiento: el arqueo es control, no movimiento. Nace en cerrado si es del bar '
  '(nunca entrega) o si el contado es 0 (no hay nada que entregar); en '
  'pendiente_entrega si es del torneo con plata. La diferencia se asienta '
  'aparte con asentar_diferencia_arqueo, que funciona en cualquier estado.';


-- ── ③.c · La entrega sólo desde pendiente_entrega ──────────────────────────
-- Un arqueo 'cerrado' no se entrega. El mensaje distingue los dos motivos, que
-- para el que carga son cosas distintas.

create or replace function public.registrar_entrega_central(
  p_arqueo_id      uuid,
  p_fecha          date default null,
  p_responsable_id uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_arq record; v_fecha date; v_asiento uuid;
begin
  select a.id, a.estado, a.saldo_contado, a.ambito, a.anulado_at,
         dc.fecha as fecha_dia, dc.predio_id, p.codigo as predio
    into v_arq
  from arqueo a
  join dia_cancha dc on dc.id = a.dia_cancha_id
  join predio p on p.id = dc.predio_id
  where a.id = p_arqueo_id;

  if not found then
    raise exception 'El arqueo % no existe', p_arqueo_id;
  end if;

  if v_arq.anulado_at is not null then
    raise exception 'El arqueo % está anulado: no se entrega.', p_arqueo_id;
  end if;

  if v_arq.ambito <> 'torneo' then
    raise exception
      'La entrega a central es del arqueo del torneo. El efectivo del bar sale '
      'con retirar_efectivo_bar, que además admite banco como destino.';
  end if;

  if v_arq.estado = 'entregado' then
    raise exception 'El arqueo % ya fue entregado', p_arqueo_id;
  end if;

  if v_arq.estado = 'cerrado' then
    raise exception
      'El arqueo % está cerrado: contó cero, no hay efectivo que entregar.',
      p_arqueo_id;
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  if v_fecha < v_arq.fecha_dia then
    raise exception 'La entrega (%) no puede ser anterior al día arqueado (%)',
      v_fecha, v_arq.fecha_dia;
  end if;

  v_asiento := crear_asiento(
    v_fecha, 'arqueo',
    'Entrega a central · ' || v_arq.predio || ' · ' || v_arq.fecha_dia,
    jsonb_build_array(
      jsonb_build_object('cuenta', 'CAJA_CENTRAL',  'debe',  v_arq.saldo_contado),
      jsonb_build_object('cuenta', 'CAJA_EFECTIVO', 'haber', v_arq.saldo_contado)
    ),
    null, null, v_arq.predio_id, p_arqueo_id, p_responsable_id
  );

  update arqueo
     set estado = 'entregado', entregado_at = now(), asiento_entrega_id = v_asiento
   where id = p_arqueo_id;

  return v_asiento;
end;
$function$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ PIEZA ④ · anulación, y la puerta que hoy está abierta                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table arqueo add column if not exists anulado_at     timestamptz;
alter table arqueo add column if not exists anulado_motivo text;

alter table arqueo drop constraint if exists arqueo_anulacion_coherente;
alter table arqueo add constraint arqueo_anulacion_coherente
  check ((anulado_at is null) = (anulado_motivo is null));

-- El unique pasa a PARCIAL, como venta_bar y retiro_bar: un arqueo anulado no
-- puede bloquear el día para siempre. Sin esto, anular no serviría de nada —
-- se podría deshacer pero nunca rehacer.
drop index if exists uq_arqueo_dia_ambito;
create unique index uq_arqueo_dia_ambito
  on arqueo (dia_cancha_id, ambito) where anulado_at is null;


-- ── ④.b · anular_arqueo ────────────────────────────────────────────────────
--
-- Revierte lo que el arqueo TENGA, y en ORDEN INVERSO al que se escribió:
--
--   A · solo registrado        → nada en el diario. Solo marca la fila.
--   B · con ajuste             → 1 contraasiento (el ajuste).
--   C · con ajuste + entrega   → 2 contraasientos: PRIMERO la entrega,
--                                DESPUÉS el ajuste.
--
-- El orden importa aunque el saldo final sea el mismo: deshacer el ajuste antes
-- que la entrega deja la caja pasando por un estado que nunca existió. Se
-- revierte como se apila.

create or replace function public.anular_arqueo(
  p_arqueo_id  uuid,
  p_motivo     text,
  p_fecha      date default null,
  p_created_by uuid default null
)
returns int
language plpgsql
as $function$
declare
  v_arq       record;
  v_user_id   uuid;
  v_fecha     date;
  v_revertidos int := 0;
begin
  select a.id, a.estado, a.anulado_at, a.asiento_ajuste_id, a.asiento_entrega_id,
         dc.fecha as fecha_dia
    into v_arq
  from arqueo a join dia_cancha dc on dc.id = a.dia_cancha_id
  where a.id = p_arqueo_id;

  if not found then
    raise exception 'El arqueo % no existe', p_arqueo_id;
  end if;

  if v_arq.anulado_at is not null then
    raise exception 'El arqueo % ya está anulado (el %)',
      p_arqueo_id, v_arq.anulado_at::date;
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'La anulación necesita motivo: es lo único que explica los contraasientos.';
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable de la anulación: se requiere p_created_by o sesión autenticada.';
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  -- 1 · la entrega, si la hubo
  if v_arq.asiento_entrega_id is not null then
    perform anular_asiento(v_arq.asiento_entrega_id,
      'Anulación de arqueo (entrega): ' || p_motivo, v_fecha, v_user_id);
    v_revertidos := v_revertidos + 1;
  end if;

  -- 2 · el ajuste, si lo hubo
  if v_arq.asiento_ajuste_id is not null then
    perform anular_asiento(v_arq.asiento_ajuste_id,
      'Anulación de arqueo (ajuste): ' || p_motivo, v_fecha, v_user_id);
    v_revertidos := v_revertidos + 1;
  end if;

  update arqueo
     set anulado_at = now(), anulado_motivo = p_motivo
   where id = p_arqueo_id;

  return v_revertidos;
end;
$function$;

comment on function anular_arqueo(uuid, text, date, uuid) is
  'Anula un arqueo revirtiendo lo que tenga, en orden inverso: primero la '
  'entrega, después el ajuste, los dos vía anular_asiento (regla 4). Marca la '
  'fila, lo que libera el índice parcial para rehacer el día. Devuelve cuántos '
  'asientos revirtió (0, 1 o 2). No hay "editar un arqueo": se anula y se '
  'vuelve a contar.';


-- ── ④.c · 🔴 El trigger que cierra la puerta abierta HOY ───────────────────
--
-- Verificado en producción: `update arqueo set saldo_contado = X` PASA sin
-- ningún control. La `diferencia` es columna generada y se recalcula sola —
-- pero el ASIENTO DE AJUSTE ya escrito sigue por el monto viejo. Quedan
-- contradiciéndose, el diario cuadra igual, y ninguna validación lo ve. Es
-- incoherencia silenciosa, que es peor que un descuadre.
--
-- Y con la anon key en el bundle, ese UPDATE lo puede hacer cualquiera.
--
-- El trigger CONGELA lo que define al arqueo —qué se contó, contra qué, de qué
-- día y de qué cajón— y deja libre lo que las funciones sí tienen que mover:
-- estado, entregado_at, los dos asiento_*, y la marca de anulación.
--
-- No bloquea por rol ni por función (no hay forma confiable de saber quién
-- llama): bloquea por COLUMNA. Las puertas legítimas no tocan esas columnas.

create or replace function public.check_arqueo_inmutable()
returns trigger
language plpgsql
as $function$
begin
  if new.saldo_contado is distinct from old.saldo_contado then
    raise exception
      'El saldo contado de un arqueo no se edita. Si se contó mal, anulalo con '
      'anular_arqueo y volvé a cargarlo: editarlo dejaría el asiento de ajuste '
      'ya escrito contradiciendo a la diferencia, sin que nada lo detecte.';
  end if;

  if new.saldo_sistema is distinct from old.saldo_sistema then
    raise exception
      'El saldo del sistema se congela al arquear (decisión 59) y no se edita.';
  end if;

  if new.dia_cancha_id is distinct from old.dia_cancha_id
     or new.ambito is distinct from old.ambito then
    raise exception
      'Un arqueo no cambia de día ni de cajón. Anulalo y cargá el que corresponde.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_arqueo_inmutable on arqueo;
create trigger trg_arqueo_inmutable
  before update on arqueo
  for each row execute function check_arqueo_inmutable();

comment on function check_arqueo_inmutable() is
  'Congela saldo_contado, saldo_sistema, dia_cancha_id y ambito una vez creado '
  'el arqueo. Deja libres estado, entregado_at, los asiento_* y la marca de '
  'anulación, que son lo que mueven las puertas. Existe porque el UPDATE '
  'directo estaba abierto y desincronizaba el ajuste ya asentado.';


-- ── ④.d · Las vistas, con la anulación ─────────────────────────────────────
-- Las dos LISTAN arqueos, así que muestran los anulados y los marcan — salvo
-- v_arqueo_diferencia, que es una COLA DE TRABAJO: un arqueo anulado no tiene
-- nada pendiente, así que sale.

create or replace view v_arqueo_detalle as
 SELECT a.id AS arqueo_id, dc.fecha, dc.predio_id, p.codigo AS predio,
    a.saldo_sistema, a.saldo_contado, a.diferencia, a.estado, a.responsable_id,
    a.entregado_at, a.asiento_entrega_id, a.asiento_ajuste_id, a.created_at,
    a.ambito, a.anulado_at, a.anulado_motivo
   FROM arqueo a
     JOIN dia_cancha dc ON dc.id = a.dia_cancha_id
     JOIN predio p ON p.id = dc.predio_id;

create or replace view v_arqueo_diferencia as
 SELECT a.id AS arqueo_id, dc.fecha, p.codigo AS predio,
    a.saldo_sistema, a.saldo_contado, a.diferencia,
        CASE WHEN a.diferencia < 0::numeric THEN 'faltante'::text
             ELSE 'sobrante'::text END AS clase,
    a.estado, a.responsable_id, a.ambito
   FROM arqueo a
     JOIN dia_cancha dc ON dc.id = a.dia_cancha_id
     JOIN predio p ON p.id = dc.predio_id
  WHERE a.diferencia <> 0::numeric
    AND a.asiento_ajuste_id IS NULL
    AND a.anulado_at IS NULL;

-- v_efectivo_sin_rendir NO cambia: ya filtra estado='pendiente_entrega', y con
-- ③ los del bar y los de contado 0 nacen 'cerrado', así que salen solos. Un
-- arqueo anulado tampoco entra: al anularse queda en el estado que tenía, pero
-- se le agrega el filtro por prolijidad.
create or replace view v_efectivo_sin_rendir as
 SELECT a.responsable_id,
    count(*) AS arqueos_pendientes,
    sum(a.saldo_contado) AS monto_sin_rendir,
    min(dc.fecha) AS desde,
    max(dc.fecha) AS hasta
   FROM arqueo a
     JOIN dia_cancha dc ON dc.id = a.dia_cancha_id
  WHERE a.estado = 'pendiente_entrega'
    AND a.ambito = 'torneo'
    AND a.anulado_at IS NULL
  GROUP BY a.responsable_id;
