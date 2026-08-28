-- ═══════════════════════════════════════════════════════════════════════════
-- El recibo interno nace en registrar_cobro · sobre la versión del repo
--
-- ⚠️ PROPUESTA · NO APLICADA. El archivo se renombra al aplicar, con la
-- versión que registre la herramienta.
--
-- ── Qué cierra ─────────────────────────────────────────────────────────────
--
-- El pendiente E que dejó Facu (28/08): "el recibo interno todavía no se crea
-- en la transacción del cobro". Hasta acá, registrar_cobro devengaba el pago
-- y el asiento pero no dejaba ningún comprobante — existía el estado
-- "cobro sin recibo", sin nada que lo cerrara.
--
-- ── El cambio ────────────────────────────────────────────────────────────
--
-- Un solo insert a `comprobante`, agregado después del alta de cheque y antes
-- del `return` final: tipo_comprobante = 0 (recibo interno, no ARCA),
-- punto_venta = 0, numero de comprobante_recibo_numero_seq, estado
-- 'generado' — la combinación que exige el constraint comprobante_coherente
-- para tipo 0 (20260826120000_comprobante_seguro.sql). condicion_iva_receptor_id
-- sale del default del tercero, con Consumidor Final (id 5) como fallback si
-- no se cargó.
--
-- ── Firma ────────────────────────────────────────────────────────────────
--
-- No cambia: los mismos 10 parámetros que la versión del 16/08
-- (20260816200000_eslabon_cheque_pago_sobre_repo.sql), así que alcanza con
-- create or replace — no hace falta drop function.
--
-- ── Verificado ───────────────────────────────────────────────────────────
--
-- BEGIN...ROLLBACK contra la base real (28/08): cobro de prueba de $1000
-- sobre una cuota real. El recibo se creó correctamente —tipo_comprobante=0,
-- punto_venta=0, cae=null, estado='generado', numero de la sequence, pago_id
-- vinculado—. Todo deshecho con rollback: nada quedó aplicado.
-- ═══════════════════════════════════════════════════════════════════════════


create or replace function registrar_cobro(
  p_tercero_id     uuid,
  p_monto          numeric,
  p_medio          text,               -- 'efectivo' | 'transferencia' | 'cheque'
  p_fecha          date,
  p_imputaciones   jsonb,              -- [{"cuota_id": "...", "monto": 123}, ...]
  p_predio_id      uuid default null,  -- obligatorio si efectivo, nulo si no
  p_responsable_id uuid default null,
  -- ── El eslabón cheque ↔ pago ─────────────────────────────────────────────
  -- Tres parámetros AL FINAL y con default null: la firma es aditiva, así que
  -- los llamadores que ya existen —el front llama por nombre— no cambian.
  p_cheque_numero      text default null,
  p_cheque_banco       text default null,
  p_cheque_fecha_cobro date default null
) returns uuid as $$
declare
  v_pago_id      uuid;
  v_asiento_id   uuid;
  v_user_id      uuid;
  v_saldo_total  numeric(16,2);
  v_suma_imp     numeric(16,2);
  v_cuenta_caja  text;
  v_torneos      uuid[];
  v_torneo_id    uuid;
  v_lineas       jsonb;
  v_imputado     numeric(16,2);
  v_agrupado     numeric(16,2);
  v_sobrante     numeric(16,2);
begin
  -- ── Validaciones de forma ────────────────────────────────────────────────

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del cobro debe ser positivo (se recibió %)', p_monto;
  end if;

  if p_medio not in ('efectivo','transferencia','cheque') then
    raise exception
      'Medio de pago inválido: "%". Los válidos son efectivo, transferencia '
      'y cheque.', p_medio;
  end if;

  -- Un cheque sin número, banco y fecha de cobro es un cheque que después no se
  -- puede seguir: cuando venza no se sabe cuál acreditar, y si rebota no hay con
  -- qué identificarlo ante el banco. Se exige al cobrar, que es el único momento
  -- en que alguien tiene el papel en la mano.
  if p_medio = 'cheque' then
    if p_cheque_numero is null or p_cheque_banco is null or p_cheque_fecha_cobro is null then
      raise exception
        'Un cobro con cheque necesita número, banco y fecha de cobro: sin '
        'esos datos no se puede hacer seguimiento del cheque después.';
    end if;
  end if;

  -- ── Caja de destino y regla del predio ───────────────────────────────────

  if p_medio = 'efectivo' then
    if p_predio_id is null then
      raise exception
        'El efectivo requiere predio: el arqueo es por jornada + predio, y sin '
        'predio no se puede cuadrar caja.';
    end if;

    -- Se valida contra los datos, no contra una lista de nombres: tiene que
    -- existir una caja de efectivo activa en ese predio. Si el predio no
    -- tiene caja, lo más probable es que se esté intentando registrar
    -- efectivo en poder de personal, que hoy no está soportado.
    if not exists (
      select 1 from caja k
       where k.tipo = 'efectivo' and k.activo and k.predio_id = p_predio_id
    ) then
      raise exception
        'El predio % no tiene una caja de efectivo activa. Si se trata de '
        'efectivo en poder de personal fuera de un predio, ese caso todavía '
        'no está soportado: registralo cuando la plata llegue a una caja.',
        p_predio_id;
    end if;

    v_cuenta_caja := 'CAJA_EFECTIVO';

  else
    if p_predio_id is not null then
      raise exception
        'Solo el efectivo lleva predio. % es una caja global.', p_medio;
    end if;

    v_cuenta_caja := case p_medio
                       when 'transferencia' then 'CAJA_TRANSFERENCIA'
                       when 'cheque'        then 'VALORES_A_DEPOSITAR'
                     end;
  end if;

  -- ── La imputación tiene que cubrir el pago completo ──────────────────────
  -- El asiento debita la caja por el total y acredita por lo imputado. Si la
  -- imputación fuera menor, no balancearía; y el sobrante quedaría como
  -- anticipo sin concepto, que es justo lo que la decisión 32 evita
  -- (el excedente se imputa a la cuota siguiente, no queda flotando).

  if p_imputaciones is null or jsonb_array_length(p_imputaciones) = 0 then
    raise exception
      'El cobro necesita al menos una imputación. Usá sugerir_imputacion() '
      'para proponerla y que el operador la confirme.';
  end if;

  select coalesce(sum((x->>'monto')::numeric), 0) into v_suma_imp
    from jsonb_array_elements(p_imputaciones) x;

  if v_suma_imp <> p_monto then
    raise exception
      'La imputación suma % y el pago es de %. Tienen que coincidir: el '
      'excedente sobre una cuota se imputa a la siguiente, no queda suelto.',
      v_suma_imp, p_monto;
  end if;

  -- ── El pago no puede exceder la deuda total del equipo ───────────────────
  -- El excedente sobre UNA cuota está bien (se reparte a la siguiente); lo que
  -- se bloquea es cobrar más de lo que el equipo debe en total.

  select coalesce(sum(
           c.monto
           - coalesce((select sum(pi.monto) from pago_imputacion pi
                        where pi.cuota_id = c.id), 0)
           - coalesce((select sum(au.monto) from anticipo_uso au
                        where au.cuota_id = c.id), 0)
         ), 0)
    into v_saldo_total
    from cuota c
    join equipo_torneo et on et.id = c.equipo_torneo_id
   where et.tercero_id = p_tercero_id;

  if p_monto > v_saldo_total then
    raise exception
      'El pago (%) excede el saldo total del equipo (%). Revisá el monto: '
      'un cobro no puede superar lo que el equipo debe.',
      p_monto, v_saldo_total;
  end if;

  -- ── El asiento va a un torneo, así que la imputación no puede cruzarlos ──
  -- asiento.torneo_id es uno solo, y dejarlo nulo marcaría el ingreso como
  -- estructura permanente, que contaminaría el resultado.

  select array_agg(distinct et.torneo_id) into v_torneos
    from jsonb_array_elements(p_imputaciones) x
    join cuota c          on c.id  = (x->>'cuota_id')::uuid
    join equipo_torneo et on et.id = c.equipo_torneo_id;

  if v_torneos is null then
    raise exception 'Ninguna de las cuotas indicadas existe';
  end if;

  if array_length(v_torneos, 1) > 1 then
    raise exception
      'La imputación cruza % torneos. Registrá un cobro por torneo: el '
      'asiento se imputa a un torneo y mezclarlos falsearía su resultado.',
      array_length(v_torneos, 1);
  end if;

  v_torneo_id := v_torneos[1];

  -- ── El pago ──────────────────────────────────────────────────────────────
  -- registrado_por es NOT NULL: el parámetro o la sesión, y nada más.
  --
  -- SE SACÓ el fallback `(select id from auth.users limit 1)`. Hacía dos daños:
  --
  --   · Desde el front sin sesión, `auth.uid()` es null y la subconsulta se
  --     evalúa: el rol no puede leer auth.users y el error que llega es
  --     "permission denied for table users", que no dice nada de lo que pasó.
  --     (Con sesión válida nunca se evaluaba: coalesce corta en el primer
  --     argumento no nulo.)
  --
  --   · Peor: desde un rol que SÍ puede leer auth.users —el servidor— un cobro
  --     sin p_responsable_id quedaba atribuido AL PRIMER USUARIO DE LA TABLA,
  --     en silencio. Eso no falla: miente sobre quién cobró.
  --
  -- Sin fallback, el camino feliz es idéntico y el error dice qué hacer.

  v_user_id := coalesce(p_responsable_id, auth.uid());
  if v_user_id is null then
    raise exception
      'Falta responsable del cobro: se requiere p_responsable_id o sesión '
      'autenticada.';
  end if;

  insert into pago (tercero_id, fecha, monto, medio_pago, predio_id, registrado_por)
  values (p_tercero_id, p_fecha, p_monto, p_medio, p_predio_id, v_user_id)
  returning id into v_pago_id;

  -- ── Imputación · imputar_pago() sin tocar ────────────────────────────────
  -- Valida que las cuotas sean del mismo tercero, que no se exceda el saldo
  -- de cada una, y escribe pago_imputacion.

  v_sobrante := imputar_pago(v_pago_id, p_imputaciones);

  -- ── El pago se imputa completo o no se registra ──────────────────────────
  -- Se lee lo que REALMENTE quedó escrito en pago_imputacion, no el valor que
  -- devolvió imputar_pago ni la suma del parámetro: es el único dato que no
  -- depende de que la cadena de validaciones previas sea correcta.
  --
  -- Un remanente sin imputar es una anomalía, no un caso de negocio: haría un
  -- asiento que no cuadra, o plata registrada que ninguna cuota reconoce. Se
  -- frena la operación entera.

  select coalesce(sum(pi.monto), 0) into v_imputado
    from pago_imputacion pi
   where pi.pago_id = v_pago_id;

  if v_imputado <> p_monto then
    raise exception
      'El pago no pudo imputarse completo: quedó un remanente de % sin '
      'asignar a cuotas (pago %, imputado %). No se registra un cobro a '
      'medias: o se imputa todo y el asiento cuadra, o no se registra nada.',
      p_monto - v_imputado, p_monto, v_imputado;
  end if;

  -- ── Las líneas del asiento ───────────────────────────────────────────────
  -- LOS DOS LADOS SALEN DE LA MISMA FUENTE: pago_imputacion, ya escrita.
  --
  -- El débito NO usa p_monto. Si lo usara, el débito vendría del parámetro y
  -- el crédito de lo realmente imputado: dos orígenes para dos lados que
  -- tienen que dar igual, y el balance dependería de que la cadena de
  -- validaciones no tenga ningún borde (redondeo a numeric(16,2), una cuota
  -- con saldo parcial, el on-conflict acumulador de imputar_pago).
  --
  -- Derivando el débito de la suma de los mismos grupos que forman los
  -- créditos, el descuadre es imposible por construcción, no por validación.

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
      jsonb_build_object('cuenta', v_cuenta_caja, 'debe', coalesce(sum(g.monto), 0))
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

  if jsonb_array_length(v_lineas) < 2 then
    raise exception
      'No se pudo resolver la cuenta de ingreso de las cuotas imputadas';
  end if;

  -- Falla distinta de la anterior: acá el total imputado ya se validó contra
  -- el pago, pero el agrupamiento por concepto atraviesa tres joins
  -- (cuota → plan_tarifa_linea → plan_tarifa). Si alguno perdiera filas, el
  -- asiento cuadraría igual —débito y crédito salen del mismo grupo— pero
  -- asentaría menos plata de la cobrada, en silencio.
  if v_agrupado <> v_imputado then
    raise exception
      'El asiento cubriría % de los % imputados: alguna cuota no resolvió su '
      'concepto.', v_agrupado, v_imputado;
  end if;

  -- ── El asiento · crear_asiento() sin tocar ───────────────────────────────
  -- Valida cuentas, importes y que debe = haber. Para efectivo exige predio,
  -- que ya viene validado arriba.

  v_asiento_id := crear_asiento(
    p_fecha       => p_fecha,
    p_origen      => 'pago_equipo',
    p_descripcion => 'Cobro a equipo',
    p_lineas      => v_lineas,
    p_torneo_id   => v_torneo_id,
    p_predio_id   => p_predio_id,
    p_origen_id   => v_pago_id,
    p_created_by  => v_user_id
  );

  update pago set asiento_id = v_asiento_id where id = v_pago_id;

  -- ── El alta del cheque ───────────────────────────────────────────────────
  -- Cierra el hueco del bloque 8: hasta acá, cobrar con cheque cambiaba la
  -- cuenta del debe a VALORES_A_DEPOSITAR y no dejaba NINGÚN registro de qué
  -- cheque era. Por eso cambiar_estado_cheque() recibía un p_cheque_id de una
  -- fila que nadie creaba.
  --
  -- `pago_id` es el eslabón que faltaba: cuando un cheque rebota, se llega por
  -- ahí al pago, y del pago a pago_imputacion, que dice qué cuotas reabrir.
  --
  -- `asiento_alta_id` es el MISMO asiento del cobro, no uno nuevo: el cheque no
  -- genera un asiento propio al recibirse — ya quedó registrado como
  -- VALORES_A_DEPOSITAR en el asiento de arriba. El asiento_cierre_id se llena
  -- después, cuando se acredite o se rechace.
  if p_medio = 'cheque' then
    insert into cheque (
      sentido, numero, banco, tercero_id, fecha_emision, fecha_cobro,
      monto, estado, pago_id, asiento_alta_id
    ) values (
      'recibido', p_cheque_numero, p_cheque_banco, p_tercero_id, p_fecha,
      p_cheque_fecha_cobro, p_monto, 'pendiente', v_pago_id, v_asiento_id
    );
  end if;

  -- ── El recibo interno nace acá, en la misma transacción ──────────────────
  -- Pedido de Facu (punto E, 28/08): sin esto existe el estado "cobro sin
  -- recibo" — el pago y el asiento quedaban, pero ningún comprobante lo
  -- atestiguaba.
  --
  -- tipo_comprobante = 0 y punto_venta = 0 identifican el recibo interno,
  -- distinto de una factura ARCA (que arranca en punto_venta > 0). El
  -- constraint comprobante_coherente exige, para tipo 0, estado = 'generado'
  -- y cae/cae_vencimiento nulos — es exactamente lo que se inserta: no hay
  -- circuito externo del que depender, así que no hay pendiente ni error
  -- posibles para este comprobante.
  --
  -- condicion_iva_receptor_id sale del default del tercero; si no se cargó,
  -- cae a Consumidor Final (id 5) — el mismo fallback que usa el resto del
  -- circuito de facturación.
  insert into comprobante (
    pago_id, tipo_comprobante, punto_venta, numero,
    condicion_iva_receptor_id, monto, estado, emitida_por,
    fecha_emision
  )
  select
    v_pago_id, 0, 0, nextval('comprobante_recibo_numero_seq'),
    coalesce(t.condicion_iva_receptor_default, 5),
    p_monto, 'generado', v_user_id, p_fecha
  from tercero t
  where t.id = p_tercero_id;

  return v_pago_id;
end $$ language plpgsql;

comment on function registrar_cobro(uuid, numeric, text, date, jsonb, uuid, uuid, text, text, date) is
  'Única vía de cobro: pago + imputación + asiento en una transacción. Si el '
  'medio es cheque, exige número, banco y fecha de cobro y da de alta la fila '
  'en `cheque` vinculada por pago_id — el eslabón del bloque 8. Además deja '
  'nacer el recibo interno (comprobante tipo 0) en la misma transacción, así '
  'no existe el estado "cobro sin recibo".';
