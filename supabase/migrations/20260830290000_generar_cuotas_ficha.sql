-- ═══════════════════════════════════════════════════════════════
-- generar_cuotas_ficha
-- APLICADA el 30/08/2026.
--
-- Hallazgo real (30/08, relevado por Facu/Claude Code): crear_equipo_
-- torneo genera ficha Y cuotas en el mismo insert, pero no hay forma
-- de pedirle "las cuotas nomás" para una ficha que ya existe -
-- exactamente el caso de las 28 fichas que clonar_torneo creó hoy, a
-- propósito sin cuotas (para poder editar antes de confirmar).
--
-- Extrae el bloque de cuotas de crear_equipo_torneo (validaciones +
-- WITH lineas/expandidas + insert into cuota), parametrizado por una
-- ficha existente en vez de crearla. Mismo comportamiento que el
-- original: falla si el calendario no está sembrado, si la cantidad
-- de jornadas no coincide, o si hay jornadas sin fecha.
--
-- Verificado con BEGIN...ROLLBACK contra la base real (30/08): una
-- ficha real del torneo clonado hoy (sin cuotas, líneas fecha_fija)
-- generó correctamente 6 cuotas con montos y vencimientos correctos.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.generar_cuotas_ficha(
  p_equipo_torneo_id uuid
)
returns int
language plpgsql
as $function$
declare
  v_serie_id             uuid;
  v_plan_inscripcion_id  uuid;
  v_plan_partidos_id     uuid;
  v_medio_previsto       medio_pago;
  v_linea                record;
  v_hallados             int;
  v_cuotas               int;
begin
  select serie_id, plan_inscripcion_id, plan_partidos_id, medio_previsto
    into v_serie_id, v_plan_inscripcion_id, v_plan_partidos_id, v_medio_previsto
    from equipo_torneo
   where id = p_equipo_torneo_id;

  if not found then
    raise exception 'La ficha % no existe', p_equipo_torneo_id;
  end if;

  if exists (select 1 from cuota where equipo_torneo_id = p_equipo_torneo_id) then
    raise exception
      'La ficha % ya tiene cuotas generadas. Esta función es para fichas '
      'sin cuotas todavía (ej. clonadas), no para regenerar.',
      p_equipo_torneo_id;
  end if;

  for v_linea in
    select l.*, p.concepto
      from plan_tarifa p
      join plan_tarifa_linea l on l.plan_tarifa_id = p.id
     where p.id in (v_plan_inscripcion_id, v_plan_partidos_id)
  loop
    if v_linea.regla in ('fecha_fija','bloque_adelantado')
       and v_linea.fecha_referencia is null then
      raise exception
        'La línea "%" (%) no tiene fecha_referencia y su regla la necesita '
        'para fijar el vencimiento',
        v_linea.concepto_label, v_linea.regla;
    end if;

    if v_linea.regla = 'por_partido' and not v_linea.es_playoff then
      select count(*) into v_hallados
        from jornada j
       where j.serie_id = v_serie_id
         and not j.es_playoff
         and j.estado <> 'suspendida'
         and j.numero between v_linea.fecha_desde and v_linea.fecha_hasta;

      if v_hallados = 0 then
        raise exception
          'La línea "%" cubre las fechas %–% pero la serie no tiene ninguna '
          'jornada en ese rango. Sembrá el calendario de la serie antes de '
          'generar cuotas.',
          v_linea.concepto_label, v_linea.fecha_desde, v_linea.fecha_hasta;
      end if;

      if v_linea.cantidad_esperada is not null
         and v_hallados <> v_linea.cantidad_esperada then
        raise exception
          'La línea "%" espera % fechas y la serie tiene % no suspendidas en '
          'el rango %–%. Se facturaría de menos (o de más): revisá el '
          'calendario de la serie o la cantidad esperada del tarifario.',
          v_linea.concepto_label, v_linea.cantidad_esperada,
          v_hallados, v_linea.fecha_desde, v_linea.fecha_hasta;
      end if;

      if exists (
        select 1 from jornada j
         where j.serie_id = v_serie_id
           and not j.es_playoff
           and j.estado <> 'suspendida'
           and j.numero between v_linea.fecha_desde and v_linea.fecha_hasta
           and j.fecha is null
      ) then
        raise exception
          'Hay jornadas sin fecha en el rango %–% de la serie. La cuota de '
          'cada fecha vence con su jornada: programá el calendario antes de '
          'generar cuotas.',
          v_linea.fecha_desde, v_linea.fecha_hasta;
      end if;
    end if;
  end loop;

  with lineas as (
    select l.id, l.regla, l.es_playoff, l.linea_orden,
           l.fecha_referencia, l.fecha_desde, l.fecha_hasta,
           p.concepto,
           case v_medio_previsto
             when 'efectivo' then l.precio_efectivo
             else                 l.precio_transferencia
           end as monto
      from plan_tarifa p
      join plan_tarifa_linea l on l.plan_tarifa_id = p.id
     where p.id in (v_plan_inscripcion_id, v_plan_partidos_id)
  ),
  expandidas as (
    select l.id as linea_id, null::uuid as jornada_id, null::int as jornada_numero,
           l.fecha_referencia as vence_at, l.monto, l.concepto, l.linea_orden
      from lineas l
     where l.regla in ('fecha_fija','bloque_adelantado')

    union all

    select l.id, j.id, j.numero, j.fecha, l.monto, l.concepto, l.linea_orden
      from lineas l
      join jornada j
        on  j.serie_id = v_serie_id
        and not j.es_playoff
        and j.estado <> 'suspendida'
        and j.numero between l.fecha_desde and l.fecha_hasta
     where l.regla = 'por_partido'
       and not l.es_playoff
  )
  insert into cuota (
    equipo_torneo_id, numero, vence_at, monto, plan_tarifa_linea_id, jornada_id)
  select
    p_equipo_torneo_id,
    row_number() over (
      order by e.vence_at, e.concepto, e.linea_orden,
               coalesce(e.jornada_numero, 0)),
    e.vence_at, e.monto, e.linea_id, e.jornada_id
  from expandidas e;

  get diagnostics v_cuotas = row_count;

  if v_cuotas = 0 then
    raise exception
      'La ficha no generó ninguna cuota. Los planes % y % no tienen líneas '
      'que produzcan cuotas: revisá el tarifario.',
      v_plan_inscripcion_id, v_plan_partidos_id;
  end if;

  return v_cuotas;
end;
$function$;

comment on function generar_cuotas_ficha(uuid) is
  'Genera las cuotas de una ficha (equipo_torneo) que ya existe pero no tiene cuotas todavía. Falla si la ficha ya tiene cuotas. Usado por clonar_torneo → editar → confirmar.';
