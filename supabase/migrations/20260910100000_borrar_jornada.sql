-- ─────────────────────────────────────────────────────────────────────────────
-- Borrar una jornada creada por error
--
-- Encontrado por Facu: agregó una «fecha 16» de prueba en una serie y no había
-- forma de sacarla. Suspender no es lo mismo — suspendida sigue en el
-- calendario, contando como historia de una fecha que nunca debió existir.
--
-- ── Borrar vs suspender: la línea es qué tocó el mundo ─────────────────────
--
-- SUSPENDER es para la jornada real que no se jugó: es historia del torneo y
-- de sus cuotas. BORRAR es para el error de carga — la jornada que nada
-- referencia todavía. Los frenos son esa línea: si algo la tocó (cuotas,
-- asientos, pagos, gastos, arqueos, o es destino de una reprogramación), no es
-- un error de carga, es historia — y la historia se suspende, no se borra.
-- Mismo criterio que eliminar_dia_cancha y que el freno 3 de borrar_torneo.
--
-- La policy de DELETE no existía (el mismo agujero silencioso del borrado de
-- torneos): se crea con el rol nombrado, y la función lleva el cinturón de
-- row_count por si una regresión de policies vuelve a dejar el DELETE mudo.
-- ─────────────────────────────────────────────────────────────────────────────

create policy jornada_delete_rol on jornada
  for delete to authenticated
  using (auth_rol() = any (array['admin', 'operador']));

create or replace function public.borrar_jornada(p_jornada_id uuid)
returns void
language plpgsql
as $$
declare
  v_j record;
  v_n int;
begin
  select j.numero, j.instancia, j.es_playoff, s.nombre as serie
    into v_j
    from jornada j join serie s on s.id = j.serie_id
   where j.id = p_jornada_id;

  if not found then
    raise exception 'La jornada % no existe', p_jornada_id;
  end if;

  if exists (select 1 from cuota where jornada_id = p_jornada_id) then
    raise exception
      'La jornada tiene cuotas atadas: no es un error de carga, es parte del '
      'compromiso de pago de los equipos. Si no se juega, suspendela — la cuota '
      'se mueve con la reprogramación.';
  end if;

  if exists (select 1 from asiento where jornada_id = p_jornada_id)
     or exists (select 1 from pago where jornada_id = p_jornada_id)
     or exists (select 1 from gasto where jornada_id = p_jornada_id) then
    raise exception
      'La jornada tiene movimientos registrados (asientos, pagos o gastos): es '
      'historia contable y no se borra. Si no se juega, suspendela.';
  end if;

  if exists (select 1 from jornada where reprograma_a = p_jornada_id) then
    raise exception
      'Otra jornada apunta a ésta como su reprogramación: borrarla dejaría esa '
      'referencia colgada.';
  end if;

  delete from jornada where id = p_jornada_id;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception
      'La jornada no se pudo borrar: el DELETE no afectó ninguna fila (lo más '
      'probable es una policy de RLS denegando en silencio). No se hizo ningún cambio.';
  end if;
end;
$$;

comment on function public.borrar_jornada(uuid) is
  'Borra una jornada SIN nada atado (cuotas, asientos, pagos, gastos, reprogramaciones). Para la jornada real que no se juega está suspender. admin · operador.';
