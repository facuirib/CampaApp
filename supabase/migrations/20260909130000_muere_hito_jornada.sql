-- ─────────────────────────────────────────────────────────────────────────────
-- Muere `hito_jornada_id` — la columna que prometía y nadie cumplía
--
-- Nació en julio con una buena intención, escrita en su propio comentario: que
-- una línea `fecha_fija` del tarifario venciera «el día de la jornada hito», y
-- que reprogramar la jornada recalculara el vencimiento. Nunca se implementó:
-- `crear_equipo_torneo` y `generar_cuotas_ficha` sólo leen `fecha_referencia`,
-- el calendario se rediseñó a jornada-por-serie un mes después, y
-- `clonar_torneo` la dejaba en NULL con un comentario pidiendo disculpas.
--
-- Decisión de Facu (09/09): matarla. Las dos razones salen de sus propias
-- definiciones del modelo:
--
-- 1. La necesidad real —vencimientos que siguen al calendario— se resuelve a
--    nivel CUOTA: `mover_jornada` va a arrastrar los vencimientos de las
--    cuotas impagas de su jornada (la migración siguiente). Granularidad
--    exacta por serie y por equipo, que el hito a nivel tarifario no daba.
--
-- 2. Para inscripción, Facu definió que NO se ata al calendario. Una jornada
--    hito en una línea de inscripción contradice esa definición.
--
-- Dejarla viva era drift: el próximo que leyera el schema iba a creer que
-- funcionaba. Ninguna vista depende de ella (verificado en pg_depend);
-- `clonar_torneo` se recrea sin la referencia — si no, quedaba rota en
-- runtime, porque plpgsql liga tarde.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.clonar_torneo(p_torneo_origen_id uuid, p_nombre_nuevo text, p_anio smallint, p_temporada temporada, p_ejercicio_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_user_id           uuid;
  v_torneo_nuevo_id   uuid;
  v_map_categoria     jsonb := '{}'::jsonb;
  v_map_serie         jsonb := '{}'::jsonb;
  v_map_plan          jsonb := '{}'::jsonb;
  r_categoria         record;
  r_serie             record;
  r_plan              record;
  r_linea             record;
  r_equipo            record;
  r_jornada           record;
  v_nueva_categoria_id uuid;
  v_nueva_serie_id     uuid;
  v_nuevo_plan_id      uuid;
  v_jornadas           int := 0;
begin
  if not (coalesce(auth_rol(), '') = 'admin') then
    raise exception
      'Clonar un torneo es de administrador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable del clonado: se requiere p_created_by o sesión autenticada.';
  end if;

  if not exists (select 1 from torneo where id = p_torneo_origen_id) then
    raise exception 'El torneo de origen % no existe', p_torneo_origen_id;
  end if;

  if p_nombre_nuevo is null or btrim(p_nombre_nuevo) = '' then
    raise exception 'El torneo nuevo necesita un nombre';
  end if;

  insert into torneo (nombre, anio, temporada, ejercicio_id, estado, activo)
  values (btrim(p_nombre_nuevo), p_anio, p_temporada, p_ejercicio_id, 'planificado', true)
  returning id into v_torneo_nuevo_id;

  for r_categoria in
    select * from categoria where torneo_id = p_torneo_origen_id
  loop
    insert into categoria (torneo_id, nombre, genero, orden)
    values (v_torneo_nuevo_id, r_categoria.nombre, r_categoria.genero, r_categoria.orden)
    returning id into v_nueva_categoria_id;

    v_map_categoria := v_map_categoria || jsonb_build_object(r_categoria.id::text, v_nueva_categoria_id::text);
  end loop;

  for r_serie in
    select s.* from serie s
    join categoria c on c.id = s.categoria_id
    where c.torneo_id = p_torneo_origen_id
  loop
    insert into serie (categoria_id, nombre, orden)
    values (
      (v_map_categoria ->> r_serie.categoria_id::text)::uuid,
      r_serie.nombre,
      r_serie.orden
    )
    returning id into v_nueva_serie_id;

    v_map_serie := v_map_serie || jsonb_build_object(r_serie.id::text, v_nueva_serie_id::text);
  end loop;

  for r_plan in
    select * from plan_tarifa where torneo_id = p_torneo_origen_id
  loop
    insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre, activo)
    values (
      v_torneo_nuevo_id, r_plan.genero, r_plan.concepto,
      r_plan.opcion_orden, r_plan.opcion_nombre, r_plan.activo
    )
    returning id into v_nuevo_plan_id;

    v_map_plan := v_map_plan || jsonb_build_object(r_plan.id::text, v_nuevo_plan_id::text);
  end loop;

  for r_linea in
    select pl.* from plan_tarifa_linea pl
    join plan_tarifa pt on pt.id = pl.plan_tarifa_id
    where pt.torneo_id = p_torneo_origen_id
  loop
    insert into plan_tarifa_linea (
      plan_tarifa_id, linea_orden, concepto_label,
      precio_efectivo, precio_transferencia, regla,
      fecha_referencia, fecha_desde, fecha_hasta,
      cantidad_esperada, es_playoff, observacion
    ) values (
      (v_map_plan ->> r_linea.plan_tarifa_id::text)::uuid,
      r_linea.linea_orden, r_linea.concepto_label,
      r_linea.precio_efectivo, r_linea.precio_transferencia, r_linea.regla,
      r_linea.fecha_referencia, r_linea.fecha_desde, r_linea.fecha_hasta,
      r_linea.cantidad_esperada, r_linea.es_playoff, r_linea.observacion
    );
  end loop;

  for r_equipo in
    select * from equipo_torneo where torneo_id = p_torneo_origen_id
  loop
    insert into equipo_torneo (
      tercero_id, torneo_id, responsable_id, serie_id,
      plan_inscripcion_id, plan_partidos_id, medio_previsto
    ) values (
      r_equipo.tercero_id, v_torneo_nuevo_id, r_equipo.responsable_id,
      (v_map_serie ->> r_equipo.serie_id::text)::uuid,
      (v_map_plan ->> r_equipo.plan_inscripcion_id::text)::uuid,
      (v_map_plan ->> r_equipo.plan_partidos_id::text)::uuid,
      r_equipo.medio_previsto
    );
  end loop;

  -- ── 🔴 LO NUEVO · la estructura del calendario ──────────────────────────
  --
  -- Se usa `v_map_serie`, el mismo mapa construido con `returning` unas líneas
  -- más arriba, así que cada serie nueva recibe las jornadas de SU serie de
  -- origen aunque dos series se llamen igual.
  for r_jornada in
    select j.* from jornada j
    join serie s on s.id = j.serie_id
    join categoria c on c.id = s.categoria_id
    where c.torneo_id = p_torneo_origen_id
    order by j.serie_id, j.numero
  loop
    insert into jornada (
      serie_id, numero, es_playoff, instancia, cantidad_esperada,
      estado, fecha, reprograma_a, cantidad_partidos
    ) values (
      (v_map_serie ->> r_jornada.serie_id::text)::uuid,
      r_jornada.numero,
      r_jornada.es_playoff,
      r_jornada.instancia,
      r_jornada.cantidad_esperada,
      -- Vuelve a programada: las suspensiones son del torneo viejo.
      'programada',
      -- Sin fecha: son de otro año. Un calendario que parece completo y está
      -- mal es peor que uno vacío.
      null,
      null,
      null
    );
    v_jornadas := v_jornadas + 1;
  end loop;

  return v_torneo_nuevo_id;
end;
$function$
;

alter table plan_tarifa_linea drop column if exists hito_jornada_id;
