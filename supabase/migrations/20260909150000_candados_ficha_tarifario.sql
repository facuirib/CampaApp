-- ─────────────────────────────────────────────────────────────────────────────
-- El candado de la relación ficha ↔ tarifario
--
-- Al definir el modelo con Facu (09/09) apareció el hueco: «el equipo absorbe
-- el tarifario de su torneo y de su género» existía como columnas pero no como
-- invariante. `crear_equipo_torneo` no validaba que los planes elegidos fueran
-- del torneo de la serie, ni del género de su categoría, ni del concepto
-- correcto (inscripción vs partidos), ni que estuvieran activos. Se podía
-- crear una ficha con el tarifario de otro torneo y la base lo aceptaba.
--
-- Cuatro candados, con mensajes que dicen cuál falló y qué revisar. Vale para
-- fichas nuevas: las arrastradas por `arrastrar_fichas` mapean los planes al
-- torneo nuevo por construcción.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crear_equipo_torneo(p_tercero_id uuid, p_serie_id uuid, p_plan_inscripcion_id uuid, p_plan_partidos_id uuid, p_medio_previsto medio_pago, p_responsable_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_torneo_id  uuid;
  v_genero     genero;
  v_plan       record;
  v_ficha_id   uuid;
  v_tipo       text;
  v_linea      record;
  v_hallados   int;
  v_cuotas     int;
begin
  select cat.torneo_id, cat.genero
    into v_torneo_id, v_genero
    from serie s
    join categoria cat on cat.id = s.categoria_id
   where s.id = p_serie_id;

  if not found then
    raise exception 'La serie % no existe', p_serie_id;
  end if;

  select tipo into v_tipo from tercero where id = p_tercero_id;
  if not found then
    raise exception 'El tercero % no existe', p_tercero_id;
  end if;
  if v_tipo <> 'equipo' then
    raise exception
      'El tercero % es de tipo "%" y solo los equipos tienen ficha',
      p_tercero_id, v_tipo;
  end if;

  -- ── 🔴 El candado de la relación (09/09) ─────────────────────────────────
  --
  -- «El equipo absorbe el tarifario DE SU TORNEO y DE SU GÉNERO» era una
  -- relación que existía como columnas pero no como invariante: esta función
  -- aceptaba planes de otro torneo, del otro género, del concepto equivocado
  -- o desactivados, y la base lo tomaba. Encontrado al definir el modelo con
  -- Facu. Desde acá, la elección del operador se valida contra la serie.
  for v_plan in
    select p.id, p.torneo_id, p.genero, p.concepto, p.activo, p.opcion_nombre,
           case when p.id = p_plan_inscripcion_id then 'inscripcion' else 'partidos' end as esperado
      from plan_tarifa p
     where p.id in (p_plan_inscripcion_id, p_plan_partidos_id)
  loop
    if v_plan.torneo_id <> v_torneo_id then
      raise exception
        'El plan «%» es de OTRO torneo. La ficha absorbe el tarifario del torneo de su serie.',
        v_plan.opcion_nombre;
    end if;
    if v_plan.genero <> v_genero then
      raise exception
        'El plan «%» es del género %, y la serie es de la categoría %. Cada género tiene su tarifario.',
        v_plan.opcion_nombre, v_plan.genero, v_genero;
    end if;
    if v_plan.concepto::text <> v_plan.esperado then
      raise exception
        'El plan «%» es de % y se lo pasó como plan de %. Revisá el orden de los planes.',
        v_plan.opcion_nombre, v_plan.concepto, v_plan.esperado;
    end if;
    if not v_plan.activo then
      raise exception
        'El plan «%» está desactivado: una ficha nueva no puede elegirlo. Reactivalo en el tarifario si corresponde.',
        v_plan.opcion_nombre;
    end if;
  end loop;

  -- Y que los DOS existan: el loop de arriba recorre los que encontró.
  if (select count(*) from plan_tarifa where id in (p_plan_inscripcion_id, p_plan_partidos_id)) < 2
     or p_plan_inscripcion_id = p_plan_partidos_id then
    raise exception
      'La ficha necesita dos planes distintos y existentes: uno de inscripción y uno de partidos.';
  end if;

  begin
    insert into equipo_torneo (
      tercero_id, torneo_id, serie_id,
      plan_inscripcion_id, plan_partidos_id, medio_previsto, responsable_id)
    values (
      p_tercero_id, v_torneo_id, p_serie_id,
      p_plan_inscripcion_id, p_plan_partidos_id, p_medio_previsto, p_responsable_id)
    returning id into v_ficha_id;
  exception when unique_violation then
    raise exception
      'El equipo % ya tiene ficha en este torneo. Una ficha por equipo por '
      'torneo: para cambiarle la serie o el plan, editá la que existe.',
      p_tercero_id;
  end;

  for v_linea in
    select l.*, p.concepto
      from plan_tarifa p
      join plan_tarifa_linea l on l.plan_tarifa_id = p.id
     where p.id in (p_plan_inscripcion_id, p_plan_partidos_id)
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
       where j.serie_id = p_serie_id
         and not j.es_playoff
         and j.estado <> 'suspendida'
         and j.numero between v_linea.fecha_desde and v_linea.fecha_hasta;

      if v_hallados = 0 then
        raise exception
          'La línea "%" cubre las fechas %–% pero la serie no tiene ninguna '
          'jornada en ese rango. Sembrá el calendario de la serie antes de '
          'armar fichas.',
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
         where j.serie_id = p_serie_id
           and not j.es_playoff
           and j.estado <> 'suspendida'
           and j.numero between v_linea.fecha_desde and v_linea.fecha_hasta
           and j.fecha is null
      ) then
        raise exception
          'Hay jornadas sin fecha en el rango %–% de la serie. La cuota de '
          'cada fecha vence con su jornada: programá el calendario antes de '
          'armar fichas.',
          v_linea.fecha_desde, v_linea.fecha_hasta;
      end if;
    end if;
  end loop;

  with lineas as (
    select l.id, l.regla, l.es_playoff, l.linea_orden,
           l.fecha_referencia, l.fecha_desde, l.fecha_hasta,
           p.concepto,
           case p_medio_previsto
             when 'efectivo' then l.precio_efectivo
             else                 l.precio_transferencia
           end as monto
      from plan_tarifa p
      join plan_tarifa_linea l on l.plan_tarifa_id = p.id
     where p.id in (p_plan_inscripcion_id, p_plan_partidos_id)
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
        on  j.serie_id = p_serie_id
        and not j.es_playoff
        and j.estado <> 'suspendida'
        and j.numero between l.fecha_desde and l.fecha_hasta
     where l.regla = 'por_partido'
       and not l.es_playoff
  )
  insert into cuota (
    equipo_torneo_id, numero, vence_at, monto, plan_tarifa_linea_id, jornada_id)
  select
    v_ficha_id,
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
      p_plan_inscripcion_id, p_plan_partidos_id;
  end if;

  return v_ficha_id;
end $function$
;
