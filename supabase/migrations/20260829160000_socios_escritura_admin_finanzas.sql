-- ═══════════════════════════════════════════════════════════════════════════
-- La escritura del circuito societario, a admin y finanzas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Medido antes de tocar nada, cada rol en su savepoint: `operador` podía
-- cambiarle y crearle el sueldo a un dueño, y **`bar` y `operador` podían
-- retirar $100.000 de la cuenta de un socio**. El sidebar ya escondía
-- Societario del operador, así que la intención estaba; faltaba que la base
-- coincidiera.
--
-- Allowlist positiva —quién SÍ— para que un rol nuevo quede afuera hasta que
-- alguien lo agregue a propósito.
--
-- ── El SELECT no se toca, y ahora hay una razón nueva ────────────────────
--
-- Además de la nota #1: los sueldos de socios entraron ayer a
-- `v_cashflow_comprometido`, y `/proyeccion` la ve OFICINA —operador incluido—.
-- Restringir el SELECT haría que el operador viera una proyección inflada en
-- $15,5M, distinta de la del admin y sin ningún aviso. Sería reintroducir para
-- un rol el error que se acababa de corregir. Medido: los cinco roles ven las
-- mismas filas y el mismo saldo, antes y después.
-- ═══════════════════════════════════════════════════════════════════════════

alter policy sueldo_socio_insert_autenticado on sueldo_socio
  with check (auth_rol() = any (array['admin', 'finanzas']));

alter policy sueldo_socio_update_autenticado on sueldo_socio
  using (auth_rol() = any (array['admin', 'finanzas']));

alter policy devengo_socio_insert_autenticado on devengo_socio
  with check (auth_rol() = any (array['admin', 'finanzas']));

-- ── La guarda de crear_retiro_socio ────────────────────────────────────────
--
-- **Es lo que cierra el agujero de `bar`, y no es simetría.** La función no
-- escribe ninguna tabla del circuito societario: arma el movimiento con
-- `crear_asiento`, cuya policy incluye a bar y operador. Las tres policies de
-- arriba no la alcanzan.
--
-- El cuerpo es el de 20260821220000 —con `validar_saldo_caja`— más la guarda
-- adelante. La firma no cambia, así que ningún llamador se entera.
--
-- `devengar_sueldos_socios` no necesita guarda: lo único que escribe además del
-- asiento es `devengo_socio`, verificado sobre su código.

create or replace function public.crear_retiro_socio(
  p_socio_id uuid, p_monto numeric, p_medio text,
  p_fecha date default null, p_predio_id uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_tipo text; v_nombre text; v_cuenta text; v_fecha date;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Los retiros de socios son de administración o finanzas. Tu rol es %.',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select tipo, nombre into v_tipo, v_nombre from tercero where id = p_socio_id;

  if not found then
    raise exception 'El tercero % no existe', p_socio_id;
  end if;
  if v_tipo <> 'socio' then
    raise exception 'El tercero % es de tipo "%": el retiro de sueldo es de un socio',
      p_socio_id, v_tipo;
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del retiro debe ser positivo (recibido: %)', p_monto;
  end if;

  v_cuenta := case p_medio
                when 'transferencia' then 'CAJA_TRANSFERENCIA'
                when 'central'       then 'CAJA_CENTRAL'
                when 'efectivo'      then 'CAJA_EFECTIVO'
              end;

  if v_cuenta is null then
    raise exception 'Medio "%" desconocido. Usá transferencia, central o efectivo.', p_medio;
  end if;

  if p_medio = 'efectivo' and p_predio_id is null then
    raise exception
      'Un retiro en efectivo tiene que decir de qué predio salió la plata, o el '
      'arqueo de ese día no cierra. Para transferencia o caja central no hace falta.';
  end if;
  if p_medio <> 'efectivo' and p_predio_id is not null then
    raise exception 'Solo el retiro en efectivo de predio lleva predio_id.';
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  perform validar_saldo_caja(v_cuenta, p_predio_id, v_fecha, p_monto,
                             'retiro de ' || v_nombre);

  return crear_asiento(
    v_fecha, 'socio', 'Retiro ' || v_nombre || ' · ' || p_medio,
    jsonb_build_array(
      jsonb_build_object('cuenta','SOCIOS_A_PAGAR','debe', p_monto, 'tercero_id', p_socio_id),
      jsonb_build_object('cuenta', v_cuenta, 'haber', p_monto)
    ),
    null, null, p_predio_id, null
  );
end;
$function$;

comment on function crear_retiro_socio(uuid, numeric, text, date, uuid) is
  'Retiro de un socio contra su cuenta. Valida que haya saldo en la caja de origen y que quien lo pide sea admin o finanzas: la función no escribe tablas del circuito societario —usa crear_asiento— así que la guarda de rol tiene que vivir adentro.';
