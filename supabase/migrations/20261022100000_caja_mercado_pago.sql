-- ═══════════════════════════════════════════════════════════════════════════
-- MEDIO MERCADO PAGO EN COBROS E INGRESOS · APLICADA EL 22/10/2026, OK DE FACU
-- Coordinado con Horacio por coordinacion.md.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El RELEVAMIENTO al aplicar achicó esta migración a la mitad: la caja
-- «Mercado Pago» YA EXISTÍA — global, activa, cuenta MERCADO_PAGO — creada
-- por el circuito del bar (que cobra con tarjeta y MP). v_saldo_caja ya la
-- lista (liga por caja.cuenta_id). Lo ÚNICO que faltaba: que cobros e
-- ingresos extraordinarios la acepten como MEDIO. Nada de cuenta nueva,
-- caja nueva ni check de caja.tipo.
--
-- MP se reconcilia como Transferencia: contra el saldo del diario, sin
-- arqueo físico (decisión de Facu). Los gastos no cambian.
--
-- Las dos funciones son el cuerpo VIGENTE (pg_get_functiondef, 22/10) con
-- ediciones quirúrgicas: el eslabón cheque-pago de Horacio (16-17/08) queda
-- intacto — parámetros de cheque, alta `recibido`, VALORES_A_DEPOSITAR.

-- 1 · Los checks de medio_pago.
alter table pago drop constraint pago_medio_pago_check;
alter table pago add constraint pago_medio_pago_check
  check (medio_pago in ('efectivo', 'transferencia', 'cheque', 'mercado_pago'));

alter table ingreso_extraordinario drop constraint ingreso_extraordinario_medio_pago_check;
alter table ingreso_extraordinario add constraint ingreso_extraordinario_medio_pago_check
  check (medio_pago in ('efectivo', 'transferencia', 'mercado_pago'));

-- 2 · registrar_cobro — VIGENTE + tres líneas: el check de medios, su
--     mensaje, y el case de la caja gana `when 'mercado_pago' → MERCADO_PAGO`.
CREATE OR REPLACE FUNCTION public.registrar_cobro(p_tercero_id uuid, p_monto numeric, p_medio text, p_fecha date, p_imputaciones jsonb, p_predio_id uuid DEFAULT NULL::uuid, p_responsable_id uuid DEFAULT NULL::uuid, p_cheque_numero text DEFAULT NULL::text, p_cheque_banco text DEFAULT NULL::text, p_cheque_fecha_cobro date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  -- Congelados del tercero al emitir el recibo: el papel tiene que decir a quién
  -- se le cobró, y seguir diciéndolo aunque el tercero cambie después.
  v_recibo_nombre     text;
  v_recibo_doc_tipo   smallint;
  v_recibo_doc_nro    text;
  v_recibo_domicilio  text;
  v_recibo_cond_iva   smallint;
  v_recibo_detalle    text;
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

  if p_medio not in ('efectivo','transferencia','cheque','mercado_pago') then
    raise exception
      'Medio de pago inválido: "%". Los válidos son efectivo, transferencia, '
      'cheque y mercado_pago.', p_medio;
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
                       when 'mercado_pago'  then 'MERCADO_PAGO'
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
  -- ── El receptor se CONGELA, no se referencia ────────────────────────────
  --
  -- `into strict` es deliberado: si el tercero no aparece, levanta
  -- NO_DATA_FOUND en vez de no hacer nada. La versión con `insert ... select`
  -- simplemente no insertaba fila cuando el `where` no encontraba al tercero
  -- —sin error y sin recibo— y éste es el corazón del circuito de cobros: acá
  -- un fallo mudo es peor que uno ruidoso.
  select
    coalesce(t.razon_social, t.nombre),
    t.doc_tipo_default,
    t.doc_nro_default,
    t.domicilio_fiscal,
    coalesce(t.condicion_iva_receptor_default, 5)
    into strict
      v_recibo_nombre, v_recibo_doc_tipo, v_recibo_doc_nro,
      v_recibo_domicilio, v_recibo_cond_iva
    from tercero t
   where t.id = p_tercero_id;

  -- El concepto sale de lo que se acaba de imputar: es lo que el equipo busca en
  -- el papel —«por qué me cobraron esto»— y ya está escrito en esta misma
  -- transacción, unas líneas más arriba.
  select string_agg('Cuota ' || c.numero, ', ' order by c.numero)
    into v_recibo_detalle
    from pago_imputacion pi
    join cuota c on c.id = pi.cuota_id
   where pi.pago_id = v_pago_id;

  insert into comprobante (
    pago_id, tipo_comprobante, punto_venta, numero,
    condicion_iva_receptor_id, monto, estado, emitida_por, fecha_emision,
    receptor_nombre, receptor_doc_tipo, receptor_doc_nro, receptor_domicilio,
    detalle
  ) values (
    v_pago_id, 0, 0, nextval('comprobante_recibo_numero_seq'),
    v_recibo_cond_iva, p_monto, 'generado', v_user_id, p_fecha,
    v_recibo_nombre, v_recibo_doc_tipo, v_recibo_doc_nro, v_recibo_domicilio,
    v_recibo_detalle
  );

  return v_pago_id;
end $function$
;

-- 3 · registrar_ingreso_extraordinario — VIGENTE + dos ediciones análogas.
CREATE OR REPLACE FUNCTION public.registrar_ingreso_extraordinario(p_monto numeric, p_medio text, p_fecha date, p_concepto text, p_cuenta_ingreso uuid, p_tercero_id uuid DEFAULT NULL::uuid, p_torneo_id uuid DEFAULT NULL::uuid, p_predio_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  if p_medio not in ('efectivo', 'transferencia', 'mercado_pago') then
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
    -- porque CAJA_TRANSFERENCIA (y CAJA_MP) son globales y trg_caja_predio
    -- lo exige así.
    v_cuenta_caja := case p_medio when 'mercado_pago' then 'MERCADO_PAGO'
                                  else 'CAJA_TRANSFERENCIA' end;
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

  -- ── El recibo interno nace acá, como en registrar_cobro ────────────────
  -- Fase C del Grupo A (20/10): todo cobro deja comprobante, y el ingreso
  -- extraordinario es un cobro. El receptor se CONGELA desde el tercero si
  -- lo hay; sin tercero, el recibo sale sin receptor (tipo 0 lo permite) con
  -- condición Consumidor Final (5), el fallback de todo el circuito.
  declare
    v_rec_nombre    text;
    v_rec_doc_tipo  smallint;
    v_rec_doc_nro   text;
    v_rec_domicilio text;
    v_rec_cond_iva  smallint := 5;
  begin
    if p_tercero_id is not null then
      select coalesce(t.razon_social, t.nombre), t.doc_tipo_default,
             t.doc_nro_default, t.domicilio_fiscal,
             coalesce(t.condicion_iva_receptor_default, 5)
        into v_rec_nombre, v_rec_doc_tipo, v_rec_doc_nro, v_rec_domicilio, v_rec_cond_iva
        from tercero t where t.id = p_tercero_id;
    end if;

    insert into comprobante (
      ingreso_extraordinario_id, tipo_comprobante, punto_venta, numero,
      condicion_iva_receptor_id, monto, estado, emitida_por, fecha_emision,
      receptor_nombre, receptor_doc_tipo, receptor_doc_nro, receptor_domicilio,
      detalle
    ) values (
      v_ingreso_id, 0, 0, nextval('comprobante_recibo_numero_seq'),
      v_rec_cond_iva, p_monto, 'generado', v_user_id, p_fecha,
      v_rec_nombre, v_rec_doc_tipo, v_rec_doc_nro, v_rec_domicilio,
      trim(p_concepto)
    );
  end;

  return v_ingreso_id;
end
$function$
;
