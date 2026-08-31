-- ─────────────────────────────────────────────────────────────────────────────
-- El cierre de período avisa si falta amortizar
--
-- D2, commit 4.
--
-- ── El problema no era construirla: era acordarse ──────────────────────────
--
-- `proponer_amortizaciones` y `asentar_amortizacion` existen desde hace rato,
-- funcionan, son idempotentes, y hasta tienen pantalla (`/activos/amortizar`).
-- Y sin embargo la tabla `amortizacion` está vacía y GAS_AMORT tiene CERO usos:
-- nunca se corrió una sola vez.
--
-- No es raro. Es una acción suelta, mensual, que no le hace falta a nadie hoy y
-- que se nota recién en el balance de fin de año. Exactamente el tipo de tarea
-- que se posterga para siempre.
--
-- La consecuencia es que el P&L subestima el gasto: reconoce lo que se compra y
-- se consume, y no reconoce lo que se desgasta. Con los activos de hoy son
-- $833.333,33 por mes que el resultado no está contando.
--
-- ── Aviso bloqueante BLANDO, y por qué no de las otras dos formas ──────────
--
-- No se amortiza sola: cuánto y cuándo amortizar es una decisión contable, y
-- una función que asienta sin que nadie mire es una fábrica de asientos que
-- después hay que anular.
--
-- Tampoco queda como aviso al pasar: eso es lo que hay hoy, y llevó cero
-- corridas en todo el año.
--
-- Entonces frena el cierre, y se puede seguir de largo diciéndolo:
-- `p_amortizacion_vista => true`. El período se cierra igual, pero **alguien
-- tuvo que verlo**. Es el mismo espíritu que «cerrar un torneo avisa y deja».
--
-- Los otros dos frenos —arqueos sin entregar, asientos descuadrados— siguen
-- siendo duros y no admiten seguir de largo: ésos no son una decisión, son un
-- error.
--
-- ── Por qué drop y no replace ──────────────────────────────────────────────
--
-- Se le agrega un parámetro. `create or replace` con distinta cantidad de
-- parámetros no reemplaza: crea una SOBRECARGA, y quedarían dos cerrar_periodo
-- conviviendo. El default deja compatibles a los que llaman con dos argumentos.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists cerrar_periodo(uuid, uuid);

create function public.cerrar_periodo(
  p_periodo_id           uuid,
  p_responsable_id       uuid default null,
  p_amortizacion_vista   boolean default false
) returns void
language plpgsql
as $$
declare
  v_periodo     record;
  v_pendiente   int;
  v_descuadrado int;
  v_amort       int;
  v_amort_monto numeric(16,2);
begin
  select id, estado, anio, mes into v_periodo
  from periodo where id = p_periodo_id;

  if not found then
    raise exception 'El período % no existe', p_periodo_id;
  end if;

  if v_periodo.estado = 'cerrado' then
    raise exception 'El período %-% ya está cerrado',
      v_periodo.anio, lpad(v_periodo.mes::text, 2, '0');
  end if;

  select count(*)
    into v_pendiente
  from arqueo a
  join dia_cancha dc on dc.id = a.dia_cancha_id
  where a.estado = 'pendiente_entrega'
    and extract(year  from dc.fecha)::int = v_periodo.anio
    and extract(month from dc.fecha)::int = v_periodo.mes;

  if v_pendiente > 0 then
    raise exception
      'No se puede cerrar %-%: hay % arqueo(s) sin entregar a central. '
      'Resolvelos antes de cerrar el período.',
      v_periodo.anio, lpad(v_periodo.mes::text, 2, '0'), v_pendiente;
  end if;

  select count(*)
    into v_descuadrado
  from (
    select l.asiento_id
      from asiento_linea l
      join asiento a on a.id = l.asiento_id
     where a.periodo_id = p_periodo_id
     group by l.asiento_id
    having sum(l.debe) <> sum(l.haber)
  ) x;

  if v_descuadrado > 0 then
    raise exception
      'No se puede cerrar %-%: hay % asiento(s) descuadrado(s) en el período. '
      'Esto no debería pasar (trg_asiento_balanceado lo previene) — revisar '
      'antes de cerrar.',
      v_periodo.anio, lpad(v_periodo.mes::text, 2, '0'), v_descuadrado;
  end if;

  -- ── El aviso nuevo ────────────────────────────────────────────────────────
  --
  -- Va DESPUÉS de los dos frenos duros a propósito: si hay un arqueo sin
  -- entregar, ése es el problema, y no conviene tapárselo al operador con un
  -- aviso de amortización que puede resolver después.
  if not p_amortizacion_vista then
    select count(*), coalesce(sum(monto), 0)
      into v_amort, v_amort_monto
      from proponer_amortizaciones(p_periodo_id);

    if v_amort > 0 then
      raise exception
        'El período %-% tiene % amortización(es) sin asentar, por $%. '
        'La amortización es el gasto del mes por el desgaste de los bienes: sin '
        'ella el resultado queda incompleto. Asentalas en Activos → Amortizar, o '
        'cerrá igual si ya lo decidiste.',
        v_periodo.anio, lpad(v_periodo.mes::text, 2, '0'), v_amort, v_amort_monto;
    end if;
  end if;

  update periodo
     set estado = 'cerrado',
         cerrado_por = coalesce(p_responsable_id, auth.uid())
   where id = p_periodo_id;
end;
$$;

comment on function cerrar_periodo(uuid, uuid, boolean) is
  'Cierra un período. Frenos duros: arqueos sin entregar y asientos descuadrados. Freno blando: amortizaciones sin asentar, que se puede saltear con p_amortizacion_vista.';
