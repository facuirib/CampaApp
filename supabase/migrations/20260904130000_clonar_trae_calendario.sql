-- ─────────────────────────────────────────────────────────────────────────────
-- Clonar un torneo trae también la ESTRUCTURA de su calendario
--
-- Nivel A, parte 6. 🔴 Toca `clonar_torneo`, que es motor de Horacio.
--
-- ── El problema ────────────────────────────────────────────────────────────
--
-- `clonar_torneo` clonaba torneo, categorías, series, tarifario y fichas — todo
-- menos el calendario. Y `confirmar_torneo_clonado` llama a
-- `generar_cuotas_ficha`, que frena con:
--
--   «La línea "…" cubre las fechas N–M pero la serie no tiene ninguna jornada
--    en ese rango. Sembrá el calendario de la serie antes de generar cuotas.»
--
-- O sea que **confirmar un torneo clonado fallaba siempre**, y el operador se
-- enteraba al apretar el botón. Medido: los dos torneos clonados que hay tienen
-- 20 series y 0 jornadas.
--
-- ── Qué viaja y qué no ─────────────────────────────────────────────────────
--
--   viaja   `numero` — cuántas fechas tiene cada serie, que es la estructura
--           `es_playoff`, `instancia`
--           `cantidad_esperada` — el tarifario la valida contra las jornadas
--                                 reales para no facturar de menos
--
--   NO      `fecha` — son de otro año. Arrastrarlas daría un calendario que
--           parece completo y está mal, que es peor que uno vacío.
--           `estado` — vuelve a 'programada': las suspensiones son del año
--           pasado y no se heredan.
--           `reprograma_a` — apunta a jornadas del torneo viejo.
--           `cantidad_partidos` — es resultado de lo que se jugó.
--
-- Resultado: la lista de control pasa de «no hay jornadas» a «hay N jornadas
-- sin fecha». El operador completa fechas y confirma, en vez de descubrir que
-- le falta algo que nadie le dijo.
--
-- ── 🔴 El mapeo de series: se reusa el que YA existía ──────────────────────
--
-- La preocupación era aparear serie origen → serie nueva. Aparearlas por
-- (categoría, nombre) sería frágil: hoy no hay dos series homónimas en la misma
-- categoría —verificado— pero nada lo impide, y el día que pase el calendario
-- de una serie se clonaría sobre la otra sin que nadie lo note.
--
-- No hizo falta construir nada: **`clonar_torneo` ya arma `v_map_serie` con
-- `returning`** al insertar cada serie. Se reusa ese mapa tal cual. Es la forma
-- correcta y ya estaba.
--
-- ── Lo único que se agrega ─────────────────────────────────────────────────
--
-- Un bloque al final, antes del `return`. El resto de la función queda
-- palabra por palabra como estaba.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.clonar_torneo(
  p_torneo_origen_id uuid,
  p_nombre_nuevo     text,
  p_anio             smallint,
  p_temporada        temporada,
  p_ejercicio_id     uuid,
  p_created_by       uuid default null
) returns uuid
language plpgsql
as $$
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
$$;

comment on function clonar_torneo(uuid, text, smallint, temporada, uuid, uuid) is
  'Clona un torneo: estructura, tarifario, fichas y la ESTRUCTURA del calendario (jornadas sin fecha). Guarda de rol adentro (torneo.clonar).';
