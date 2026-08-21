-- ═══════════════════════════════════════════════════════════════════════════
-- Ajuste de diferencias de arqueo (torneo + bar) y arqueo del bar
-- PROPUESTA, NO APLICAR sin revisión (regla 11)
--
-- Dos cosas en una migración porque son la misma pieza: el arqueo del bar
-- necesita el ajuste, y el ajuste tapa un agujero que el torneo YA TIENE.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0 · Lo que encontró EJECUTAR el arqueo del torneo ──────────────────────
--
-- `arqueo` tiene 0 filas: el circuito nunca corrió. Corrido en rollback,
-- esconde CUATRO cosas, no una:
--
-- 1 · LA DIFERENCIA NUNCA SE ASIENTA. `crear_arqueo` la calcula (columna
--     generada) y genera CERO asientos. `asiento_ajuste_id` queda NULL y
--     ninguna función lo escribe — lo verifiqué buscando en todos los cuerpos:
--     solo dos VISTAS lo leen. Con faltante de 120.000, tras la entrega quedan
--     120.000 de residuo en la caja del predio, para siempre.
--
-- 2 · UN SOBRANTE DEJA LA CAJA NEGATIVA. `registrar_entrega_central` mueve el
--     CONTADO, no el sistema. Con sistema 1.120.000 y contado 1.300.000, la
--     entrega saca 1.300.000 de una caja que tenía 1.120.000: saldo −180.000.
--     El sistema registra tranquilamente una caja con efectivo negativo.
--
-- 3 · UN ARQUEO CON CONTADO 0 QUEDA TRABADO. `registrar_entrega_central`
--     rechaza contado = 0 («no hay efectivo que entregar»), así que ese arqueo
--     se queda en 'pendiente_entrega' para siempre. Es el caso real de un día
--     que se arquea y no hubo plata.
--
-- 4 · NO HAY FORMA DE ANULAR NI CORREGIR UN ARQUEO. Cero funciones. Y con
--     `unique (dia_cancha_id)` tampoco se puede rehacer. Un contado mal
--     tipeado es permanente.
--
-- Esta migración resuelve 1 y 2. **3 y 4 quedan abiertos y anotados** — no los
-- toco acá porque cambian el circuito del torneo más allá del ajuste, y eso es
-- decisión aparte.
--
-- Nota al margen, del mismo relevamiento: la caja de Tirolesa está en −508.000
-- HOY, porque un gasto `ZZ_TEST_` de 4.800.000 se pagó en efectivo cuando había
-- 3.192.000. `pagar_gasto` tampoco valida saldo. Es dato de prueba, pero la
-- puerta que lo permitió es real.


-- ── 1 · La cuenta ──────────────────────────────────────────────────────────
--
-- UNA cuenta para los dos signos: el faltante va al debe (pérdida) y el
-- sobrante al haber (ganancia). No dos cuentas.
--
-- Tipo `financiero`, y no `egreso`, por dos razones:
--
--   a) YA EXISTE EL PRECEDENTE. `FIN_DIF_CAMBIO` es exactamente esto —una
--      cuenta que absorbe ganancia y pérdida según el signo— y es `financiero`.
--      Las únicas dos cuentas de resultado que no son ING_/GAS_ son las dos
--      `financiero`. Esto es una tercera del mismo género.
--
--   b) `v_pl_mensual` incluye los tres tipos y para `financiero` calcula
--      `haber - debe`: un faltante (debe) da negativo = pérdida, un sobrante
--      (haber) da positivo = ganancia. Sale bien en los dos sentidos sin tocar
--      la vista.
--
-- Si fuera `egreso`, `v_pl_mensual_item` —el expandible del P&L— lo etiquetaría
-- «Sin categoría», porque deriva el nombre del ítem del `gasto` que hay detrás
-- del asiento, y un ajuste de arqueo no tiene gasto. Verificado en rollback.
--
-- El prefijo `FIN_` acompaña al tipo, como FIN_DIF_CAMBIO y FIN_RENDIMIENTOS.
-- Si preferís `DIF_ARQUEO` pelado, es cambiar este bloque y las 2 referencias
-- de la función — ahora es gratis, con movimientos ya no.

insert into cuenta (id, codigo, nombre, tipo, imputable, padre_id) values
  (gen_random_uuid(), 'FIN_DIF_ARQUEO', 'Diferencias de arqueo', 'financiero', true, null)
on conflict (codigo) do nothing;


-- ── 2 · `ambito` en `arqueo` ───────────────────────────────────────────────
--
-- DECISIÓN: una tabla con `ambito`, no una `arqueo_bar` aparte.
--
-- A favor de la tabla única:
--   · El ajuste de diferencias es UNA función para los dos. Con tablas
--     separadas serían dos, o una con dos ramas de lectura.
--   · Las cuatro vistas que ya existen —v_arqueo_detalle, v_arqueo_diferencia,
--     v_efectivo_sin_rendir, y la pantalla /arqueo— sirven a los dos ámbitos
--     agregando una columna, contra duplicarlas.
--   · `arqueo` tiene 0 FILAS. No hay backfill, no hay riesgo. Es hoy o nunca:
--     con datos, cambiar el unique es una operación con downtime.
--
-- En contra, y es real: el bar y el torneo NO comparten el segundo tramo. El
-- torneo entrega a central; el bar ya tiene su salida propia
-- (`retirar_efectivo_bar`). Así que `estado`, `entregado_at` y
-- `asiento_entrega_id` **no aplican al bar**. Una tabla única los deja en NULL
-- para la mitad de las filas.
--
-- Se acepta ese costo porque la alternativa —duplicar tabla, vistas y función
-- de ajuste para ahorrar tres columnas nullables— es peor. Y porque el
-- invariante que importa, «un arqueo por día, por ámbito», se expresa mejor en
-- un unique compuesto que en dos tablas que nadie obliga a mirar juntas.

alter table arqueo
  add column if not exists ambito text not null default 'torneo'
    check (ambito in ('torneo', 'bar'));

-- El unique pasa a ser compuesto: el mismo día puede tener el arqueo del torneo
-- y el del bar, que son dos cajones físicos distintos.
alter table arqueo drop constraint if exists arqueo_dia_cancha_id_key;
create unique index if not exists uq_arqueo_dia_ambito on arqueo (dia_cancha_id, ambito);

comment on column arqueo.ambito is
  'torneo (cajón del predio, cuenta CAJA_EFECTIVO) o bar (cajón del bar, '
  'BAR_EFECTIVO). Determina contra qué saldo se compara y qué cuenta ajusta. '
  'Las columnas estado/entregado_at/asiento_entrega_id son del torneo: el bar '
  'saca la plata con retirar_efectivo_bar, no con entrega a central.';


-- ── 3 · crear_arqueo, con ámbito ───────────────────────────────────────────
--
-- ⚠️ EL `drop function` NO ES OPCIONAL, y casi me lo como. Agregar un parámetro
-- —aunque tenga default— cambia la FIRMA, así que `create or replace` **no
-- reemplaza: sobrecarga**. Quedan las dos versiones vivas, y toda llamada de
-- tres argumentos pasa a ser ambigua:
--
--     ERROR 42725: function crear_arqueo(uuid, integer, uuid) is not unique
--     HINT: Could not choose a best candidate function.
--
-- O sea que la pantalla /arqueo/nuevo, que llama con tres, se habría roto al
-- aplicar. Lo encontró la prueba en rollback, no leer el código. Mismo patrón
-- que ya usa la migración de `pagar_gasto`.
--
-- Con el drop, `p_ambito` con default 'torneo' SÍ deja andar las llamadas
-- existentes sin tocarlas. Lo único que cambia por dentro es de dónde sale el
-- saldo congelado.

drop function if exists public.crear_arqueo(uuid, numeric, uuid);

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
  v_id          uuid;
begin
  if p_ambito not in ('torneo', 'bar') then
    raise exception 'Ámbito inválido: "%". Los válidos son torneo y bar.', p_ambito;
  end if;

  select dc.id, dc.fecha, dc.predio_id
    into v_dia
  from dia_cancha dc
  where dc.id = p_dia_cancha_id;

  if not found then
    raise exception 'El día de cancha % no existe', p_dia_cancha_id;
  end if;

  if p_saldo_contado is null or p_saldo_contado < 0 then
    raise exception 'El saldo contado debe ser un importe no negativo (recibido: %)',
      p_saldo_contado;
  end if;

  if exists (select 1 from arqueo
              where dia_cancha_id = p_dia_cancha_id and ambito = p_ambito) then
    raise exception
      'Ese día de cancha ya tiene un arqueo de %. Un arqueo por día, predio y ámbito.',
      p_ambito;
  end if;

  v_responsable := coalesce(p_responsable_id, auth.uid(), (select id from auth.users limit 1));
  if v_responsable is null then
    raise exception 'No hay usuario. Creá uno en Authentication o pasá p_responsable_id.';
  end if;

  -- Acá se CONGELA (decisión 59): se calcula una vez y se guarda. La única
  -- diferencia entre ámbitos es de qué cajón se lee el saldo.
  v_sistema := case p_ambito
                 when 'torneo' then saldo_efectivo_predio(v_dia.predio_id, v_dia.fecha)
                 when 'bar'    then saldo_bar_predio(v_dia.predio_id, v_dia.fecha)
               end;

  insert into arqueo (dia_cancha_id, saldo_sistema, saldo_contado,
                      estado, responsable_id, ambito)
  values (p_dia_cancha_id, v_sistema, p_saldo_contado,
          'pendiente_entrega', v_responsable, p_ambito)
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function crear_arqueo(uuid, numeric, uuid, text) is
  'Registra el conteo de un cajón y congela el saldo del sistema. Ámbito torneo '
  '(CAJA_EFECTIVO, vía saldo_efectivo_predio) o bar (BAR_EFECTIVO, vía '
  'saldo_bar_predio). NO genera asiento: el arqueo es control, no movimiento. '
  'La diferencia se asienta después con asentar_diferencia_arqueo.';


-- ── 4 · asentar_diferencia_arqueo · la puerta que faltaba ──────────────────
--
-- Sirve a los DOS ámbitos parametrizando la cuenta de efectivo. Es lo único que
-- cambia entre uno y otro; el resto del razonamiento es idéntico.
--
--   FALTANTE (contado < sistema, diferencia < 0):
--       FIN_DIF_ARQUEO   debe   |dif|      ← la pérdida
--         CAJA/BAR              haber |dif|  ← la caja baja a lo que hay
--
--   SOBRANTE (contado > sistema, diferencia > 0):
--       CAJA/BAR         debe   dif        ← la caja sube a lo que hay
--         FIN_DIF_ARQUEO        haber dif   ← la ganancia
--
-- Después de asentar, el saldo de la cuenta ES el contado. Eso es lo que
-- resuelve el agujero 2 del bloque 0: si el ajuste corre ANTES de la entrega,
-- `registrar_entrega_central` ya no saca plata que no está.
--
-- ⚠️ El orden importa para el resultado intermedio, no para el final: ajuste y
-- entrega en cualquier orden dejan la caja en 0. Pero con la entrega primero,
-- la caja pasa por un saldo negativo. La pantalla debe ofrecer ajustar primero.

create or replace function public.asentar_diferencia_arqueo(
  p_arqueo_id  uuid,
  p_fecha      date default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_arq     record;
  v_user_id uuid;
  v_fecha   date;
  v_cuenta  text;
  v_monto   numeric(16,2);
  v_lineas  jsonb;
  v_asiento uuid;
begin
  select a.id, a.diferencia, a.ambito, a.asiento_ajuste_id,
         dc.fecha as fecha_dia, dc.predio_id, p.nombre as predio
    into v_arq
  from arqueo a
  join dia_cancha dc on dc.id = a.dia_cancha_id
  join predio     p  on p.id  = dc.predio_id
  where a.id = p_arqueo_id;

  if not found then
    raise exception 'El arqueo % no existe', p_arqueo_id;
  end if;

  if v_arq.asiento_ajuste_id is not null then
    raise exception
      'La diferencia del arqueo % ya fue asentada. Si está mal, se corrige con '
      'un contraasiento, no asentando de nuevo.', p_arqueo_id;
  end if;

  if v_arq.diferencia = 0 then
    raise exception
      'El arqueo % cuadró exacto: no hay diferencia que asentar.', p_arqueo_id;
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable del ajuste: se requiere p_created_by o sesión autenticada.';
  end if;

  v_fecha := coalesce(p_fecha, v_arq.fecha_dia);

  if v_fecha < v_arq.fecha_dia then
    raise exception
      'El ajuste (%) no puede ser anterior al día arqueado (%)',
      v_fecha, v_arq.fecha_dia;
  end if;

  v_cuenta := case v_arq.ambito
                when 'torneo' then 'CAJA_EFECTIVO'
                when 'bar'    then 'BAR_EFECTIVO'
              end;

  v_monto := abs(v_arq.diferencia);

  if v_arq.diferencia < 0 then
    -- Faltante: la caja baja hasta lo contado, y la pérdida queda registrada.
    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta', 'FIN_DIF_ARQUEO', 'debe',  v_monto),
      jsonb_build_object('cuenta', v_cuenta,         'haber', v_monto)
    );
  else
    -- Sobrante: la caja sube hasta lo contado, y la ganancia queda registrada.
    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta', v_cuenta,         'debe',  v_monto),
      jsonb_build_object('cuenta', 'FIN_DIF_ARQUEO', 'haber', v_monto)
    );
  end if;

  -- predio_id SIEMPRE. Para CAJA_EFECTIVO lo exige crear_asiento; para
  -- BAR_EFECTIVO no lo exige —su guardia mira la cuenta literal— pero sin él
  -- v_saldo_caja no vería el ajuste y la caja del bar quedaría mintiendo.
  v_asiento := crear_asiento(
    p_fecha       => v_fecha,
    p_origen      => 'arqueo',
    p_descripcion => 'Ajuste de arqueo · ' || v_arq.ambito || ' · ' || v_arq.predio
                     || ' · ' || v_arq.fecha_dia
                     || ' · ' || case when v_arq.diferencia < 0 then 'faltante' else 'sobrante' end,
    p_lineas      => v_lineas,
    p_torneo_id   => null,
    p_jornada_id  => null,
    p_predio_id   => v_arq.predio_id,
    p_origen_id   => p_arqueo_id,
    p_created_by  => v_user_id
  );

  update arqueo set asiento_ajuste_id = v_asiento where id = p_arqueo_id;

  return v_asiento;
end;
$function$;

comment on function asentar_diferencia_arqueo(uuid, date, uuid) is
  'Escribe el asiento de ajuste de un arqueo con diferencia, y llena '
  'asiento_ajuste_id — que hasta el 21/08 NADIE escribía. Sirve a los dos '
  'ámbitos: ajusta CAJA_EFECTIVO (torneo) o BAR_EFECTIVO (bar) contra '
  'FIN_DIF_ARQUEO. Faltante = pérdida al debe, sobrante = ganancia al haber. '
  'Después de asentar, el saldo de la cuenta ES el contado. Conviene correrlo '
  'ANTES de la entrega a central: si no, la entrega del contado puede dejar la '
  'caja negativa (ver bloque 0 de la migración).';


-- ── 5 · La entrega a central es del torneo, no del bar ─────────────────────
-- El bar no entrega a central: saca la plata con `retirar_efectivo_bar`, que ya
-- existe y contempla los tres destinos. Sin esta guardia,
-- `registrar_entrega_central` movería BAR_EFECTIVO... no: movería
-- CAJA_EFECTIVO, que es la cuenta que tiene hardcodeada — o sea que un arqueo
-- de bar entregado sacaría plata del cajón del TORNEO. Falla silenciosa.

create or replace function public.registrar_entrega_central(
  p_arqueo_id      uuid,
  p_fecha          date default null,
  p_responsable_id uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_arq     record;
  v_fecha   date;
  v_asiento uuid;
begin
  select a.id, a.estado, a.saldo_contado, a.ambito,
         dc.fecha as fecha_dia, dc.predio_id, p.codigo as predio
    into v_arq
  from arqueo a
  join dia_cancha dc on dc.id = a.dia_cancha_id
  join predio p on p.id = dc.predio_id
  where a.id = p_arqueo_id;

  if not found then
    raise exception 'El arqueo % no existe', p_arqueo_id;
  end if;

  if v_arq.ambito <> 'torneo' then
    raise exception
      'La entrega a central es del arqueo del torneo. El efectivo del bar sale '
      'con retirar_efectivo_bar, que además admite banco como destino.';
  end if;

  if v_arq.estado <> 'pendiente_entrega' then
    raise exception 'El arqueo % ya fue entregado', p_arqueo_id;
  end if;

  if v_arq.saldo_contado = 0 then
    raise exception
      'El arqueo % contó cero: no hay efectivo que entregar', p_arqueo_id;
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  if v_fecha < v_arq.fecha_dia then
    raise exception
      'La entrega (%) no puede ser anterior al día arqueado (%)',
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


-- ── 6 · Las vistas, con ámbito ─────────────────────────────────────────────
-- `create or replace view` solo admite AGREGAR columnas al final: `ambito` va
-- último aunque conceptualmente iría primero.

create or replace view v_arqueo_detalle as
 SELECT a.id AS arqueo_id, dc.fecha, dc.predio_id, p.codigo AS predio,
    a.saldo_sistema, a.saldo_contado, a.diferencia, a.estado, a.responsable_id,
    a.entregado_at, a.asiento_entrega_id, a.asiento_ajuste_id, a.created_at,
    a.ambito
   FROM arqueo a
     JOIN dia_cancha dc ON dc.id = a.dia_cancha_id
     JOIN predio p ON p.id = dc.predio_id;

create or replace view v_arqueo_diferencia as
 SELECT a.id AS arqueo_id, dc.fecha, p.codigo AS predio,
    a.saldo_sistema, a.saldo_contado, a.diferencia,
        CASE WHEN a.diferencia < 0::numeric THEN 'faltante'::text
             ELSE 'sobrante'::text END AS clase,
    a.estado, a.responsable_id,
    a.ambito
   FROM arqueo a
     JOIN dia_cancha dc ON dc.id = a.dia_cancha_id
     JOIN predio p ON p.id = dc.predio_id
  WHERE a.diferencia <> 0::numeric AND a.asiento_ajuste_id IS NULL;

comment on view v_arqueo_diferencia is
  'Arqueos con diferencia TODAVÍA SIN ASENTAR — la cola de trabajo de '
  'asentar_diferencia_arqueo. Una fila acá es plata que el libro dice que está '
  'y no está (o al revés). Sirve a los dos ámbitos: filtrar por `ambito`.';


-- ── 7 · Lo que queda abierto (agujeros 3 y 4 del bloque 0) ─────────────────
--
-- · UN ARQUEO CON CONTADO 0 NO SE PUEDE CERRAR. Sigue igual: la entrega lo
--   rechaza y queda 'pendiente_entrega' para siempre. Con el ajuste ahora al
--   menos su diferencia se asienta, pero el estado no cierra. Falta decidir si
--   contado 0 debería poder pasar a 'entregado' sin asiento, o si necesita un
--   estado propio.
--
-- · NO SE PUEDE ANULAR NI CORREGIR UN ARQUEO. Cero funciones, y el unique
--   impide rehacerlo. Un contado mal tipeado es permanente. La salida sería un
--   `anular_arqueo` que contraasiente ajuste y entrega si existen, y libere el
--   día — mismo patrón que anular_venta_bar.
--
-- Los dos son del circuito del torneo y exceden el ajuste. Quedan anotados acá
-- y en arquitectura.md §3.6 para que nadie los redescubra.
