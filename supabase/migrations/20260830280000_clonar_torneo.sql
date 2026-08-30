-- ═══════════════════════════════════════════════════════════════
-- clonar_torneo — B1 del plan de pulido
--
-- Decisión de Horacio (30/08): clonar TODO de una — torneo, estructura
-- (categoría/serie), tarifario completo (plan_tarifa + plan_tarifa_
-- linea) y fichas de equipo — en un solo llamado.
--
-- NOTA IMPORTANTE: ya existe clonar_estructura_torneo (20260823290000),
-- con un diseño deliberadamente distinto: paso a paso, tarifario a
-- mano porque los precios cambian cada torneo. Avisado a Facu
-- (coordinacion.md, "Solapamiento real"), decisión de Horacio de
-- seguir con esta pieza igual, coexistiendo con la existente.
--
-- hito_jornada_id de plan_tarifa_linea queda NULL en las líneas
-- clonadas — se resuelve DESPUÉS de generar el calendario del torneo
-- nuevo (generar_grilla_liga), no es parte de esta función.
--
-- TODOS los equipos se copian automáticamente, con sus planes de
-- tarifa ya mapeados a los nuevos ids. Las bajas se hacen después,
-- editando el torneo nuevo.
--
-- NO genera cuotas ni copia deuda — eso es un paso posterior explícito
-- (generar_cuotas_plan por cada plan), después de editar y confirmar.
--
-- Verificado con BEGIN...ROLLBACK contra la base real (30/08): la
-- función compila y se frena correctamente en la validación de rol
-- (sin sesión, en el SQL Editor).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.clonar_torneo(
  p_torneo_origen_id uuid,
  p_nombre_nuevo      text,
  p_anio              smallint,
  p_temporada         temporada,
  p_ejercicio_id      uuid,
  p_created_by        uuid default null
)
returns uuid
language plpgsql
as $function$
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
  v_nueva_categoria_id uuid;
  v_nueva_serie_id     uuid;
  v_nuevo_plan_id      uuid;
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
      cantidad_esperada, es_playoff, observacion,
      hito_jornada_id
    ) values (
      (v_map_plan ->> r_linea.plan_tarifa_id::text)::uuid,
      r_linea.linea_orden, r_linea.concepto_label,
      r_linea.precio_efectivo, r_linea.precio_transferencia, r_linea.regla,
      r_linea.fecha_referencia, r_linea.fecha_desde, r_linea.fecha_hasta,
      r_linea.cantidad_esperada, r_linea.es_playoff, r_linea.observacion,
      null
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

  return v_torneo_nuevo_id;
end;
$function$;

comment on function clonar_torneo(uuid, text, smallint, temporada, uuid, uuid) is
  'Clona categorias, series, planes de tarifa (con sus lineas) y equipos de un torneo a uno nuevo (planificado). hito_jornada_id queda NULL. NO genera cuotas ni copia deuda. Coexiste con clonar_estructura_torneo (diseño distinto, ver header).';
