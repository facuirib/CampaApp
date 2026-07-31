-- ============================================================================
-- CAMPA · registrar_cobro
--
-- Registra un pago, lo imputa a cuotas y emite el asiento, en una transacción.
-- Con percibido puro (Draft 12) el cobro es el ÚNICO evento contable de
-- ingreso: acá es donde el dinero entra al libro diario.
--
-- Reusa imputar_pago() y crear_asiento() sin modificarlas.
--
-- ── FUERA DE ALCANCE ────────────────────────────────────────────────────────
-- Efectivo recibido por personal fuera de un predio. El modelo hoy ata todo
-- movimiento de CAJA_EFECTIVO a un predio (crear_asiento lo exige y
-- v_saldo_caja lo asume), y no existe dónde guardar "quién tiene la plata".
-- Esta función RECHAZA ese caso con un mensaje explícito en vez de forzarlo
-- contra un predio que no corresponde. crear_asiento NO se toca.
--
-- ── El asiento ──────────────────────────────────────────────────────────────
--
--   Caja (según medio)          debe    <total del pago>
--     ING_INSCRIPCIONES               haber  <imputado a inscripción>
--     ING_PARTIDOS                    haber  <imputado a partidos>
--
-- El débito es uno solo; los créditos se agrupan POR CONCEPTO, así que son
-- como máximo dos líneas. La cuenta de ingreso de cada grupo sale de
-- cuota → plan_tarifa_linea → plan_tarifa.concepto (decisión 31).
--
-- El efectivo usa siempre CAJA_EFECTIVO: no hay cuenta por predio. El predio
-- es dimensión de la cabecera del asiento, que es como v_saldo_caja separa
-- el saldo de cada uno.
-- ============================================================================

create or replace function registrar_cobro(
  p_tercero_id     uuid,
  p_monto          numeric,
  p_medio          text,               -- 'efectivo' | 'transferencia' | 'cheque'
  p_fecha          date,
  p_imputaciones   jsonb,              -- [{"cuota_id": "...", "monto": 123}, ...]
  p_predio_id      uuid default null,  -- obligatorio si efectivo, nulo si no
  p_responsable_id uuid default null
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
  -- registrado_por es NOT NULL. Mismo criterio que crear_asiento: el
  -- parámetro, la sesión, o el primer usuario (este último solo sirve para
  -- pruebas desde el SQL Editor).

  v_user_id := coalesce(p_responsable_id, auth.uid(), (select id from auth.users limit 1));
  if v_user_id is null then
    raise exception
      'No hay usuario para atribuir el cobro. Creá uno en Authentication o '
      'pasá p_responsable_id.';
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

  return v_pago_id;
end $$ language plpgsql;

comment on function registrar_cobro is
  'Registra un pago, lo imputa a cuotas y emite el asiento, en una '
  'transacción. Es el único evento que reconoce ingreso (percibido puro). '
  'Reusa imputar_pago() y crear_asiento() sin modificarlas. El crédito se '
  'agrupa por concepto de la cuota (inscripción/partidos) y el débito va a la '
  'caja del medio. El efectivo en poder de personal fuera de un predio no '
  'está soportado: se rechaza con un mensaje explícito.';


-- ============================================================================
-- VERIFICACIÓN · correr después de aplicar. No crea datos.
-- ============================================================================

do $$
declare v_fallas text := ''; v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_cobro';

  if v_def is null then
    raise exception 'No se creó la función registrar_cobro';
  end if;

  -- Firma: se compara por nombres de tipo. identity_arguments incluye los
  -- nombres de parámetro y proargtypes::oid[] viene indexado desde 0.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'registrar_cobro'
       and p.pronargs = 7
       and p.pronargdefaults = 2
       and pg_get_function_result(p.oid) = 'uuid'
       and (select array_agg(t.typname::text order by u.ord)
              from unnest(p.proargtypes::oid[]) with ordinality as u(t_oid, ord)
              join pg_type t on t.oid = u.t_oid)
           = array['uuid','numeric','text','date','jsonb','uuid','uuid']
  ) then
    v_fallas := v_fallas || E'\n  · la firma no es la esperada';
  end if;

  if v_def not like '%imputar_pago(%' then
    v_fallas := v_fallas || E'\n  · no reusa imputar_pago';
  end if;

  if v_def not like '%crear_asiento(%' then
    v_fallas := v_fallas || E'\n  · no reusa crear_asiento';
  end if;

  -- Las dos cuentas de ingreso del ruteo por concepto.
  if v_def not like '%ING_INSCRIPCIONES%' or v_def not like '%ING_PARTIDOS%' then
    v_fallas := v_fallas || E'\n  · falta el ruteo a alguna cuenta de ingreso';
  end if;

  -- Las tres cajas de destino según el medio.
  if v_def not like '%CAJA_EFECTIVO%'
     or v_def not like '%CAJA_TRANSFERENCIA%'
     or v_def not like '%VALORES_A_DEPOSITAR%' then
    v_fallas := v_fallas || E'\n  · falta alguna caja de destino';
  end if;

  -- crear_asiento no se tocó: su regla del predio sigue siendo la original.
  if (select pg_get_functiondef(p.oid) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='crear_asiento')
     not like '%requiere predio_id: el arqueo es por predio%' then
    v_fallas := v_fallas || E'\n  · crear_asiento fue modificada y no debía';
  end if;

  if v_fallas <> '' then
    raise exception 'registrar_cobro incompleta:%', v_fallas;
  end if;

  raise notice 'registrar_cobro OK';
end $$;
