-- ============================================================================
-- CAMPA · B0 · crear_equipo_torneo
--
-- Arma la ficha de un equipo en un torneo y genera todas sus cuotas, en una
-- sola transacción. Es la puerta de entrada de la cobranza: sin ficha no hay
-- cuotas, y sin cuotas no hay nada que cobrar.
--
-- NO GENERA ASIENTO. Con percibido puro (Draft 12) el único evento contable
-- de ingreso es el cobro. Armar la ficha y crear las cuotas no escriben en el
-- libro diario: las cuotas son términos de pago, no hechos contables.
--
-- ── El motor mira la REGLA de la línea, no el concepto (decisión 38) ────────
--
--   fecha_fija         1 cuota. vence_at = fecha_referencia.
--                      Vale igual para inscripción y para partidos: una línea
--                      fecha_fija de partidos (Opción "Cuotas") tiene fecha
--                      propia y NO se ata a ninguna jornada.
--
--   por_partido        1 cuota por jornada de liga del género en el rango
--   (no playoff)       fecha_desde..fecha_hasta. jornada_id = esa jornada y
--                      vence_at = su fecha, así reprogramarla corre el
--                      vencimiento (decisión 39). monto = arancel unitario.
--
--   bloque_adelantado  1 cuota con el TOTAL del bloque (el precio cargado ya
--                      es el total, no el unitario). vence_at = fecha_referencia.
--
--   por_partido        NO genera cuota. No se sabe si el equipo clasifica;
--   + es_playoff       cantidad_esperada es un máximo teórico. Se cobra aparte.
--
-- El concepto (inscripcion/partidos) no participa de la generación. Se usa
-- después, y para otra cosa: rutear el asiento del cobro (decisión 31).
--
-- ── Precio ─────────────────────────────────────────────────────────────────
-- Se copia el que corresponde al medio_previsto de la ficha y desde ahí la
-- cuota es autónoma (decisión 41): editar el tarifario no la recalcula.
--
-- ── Numeración ─────────────────────────────────────────────────────────────
-- Global sobre las cuotas de las dos opciones, en orden de vencimiento, por
-- el unique (equipo_torneo_id, numero). Los empates se desempatan por
-- concepto (inscripción antes que partidos) y después por linea_orden, para
-- que la numeración sea determinística: sin eso, dos corridas sobre los
-- mismos datos podrían numerar distinto.
-- ============================================================================

create or replace function crear_equipo_torneo(
  p_tercero_id          uuid,
  p_serie_id            uuid,
  p_plan_inscripcion_id uuid,
  p_plan_partidos_id    uuid,
  p_medio_previsto      medio_pago,
  p_responsable_id      uuid default null
) returns uuid as $$
declare
  v_torneo_id  uuid;
  v_genero     genero;
  v_ficha_id   uuid;
  v_tipo       text;
  v_linea      record;
  v_hallados   int;
  v_cuotas     int;
begin
  -- ── Estructura: el torneo y el género salen de la serie ──────────────────
  -- No se piden por parámetro a propósito. Derivarlos evita que el llamador
  -- pase un torneo que no sea el de la serie; el trigger lo rechazaría, pero
  -- es mejor que el dato no pueda contradecirse.

  select cat.torneo_id, cat.genero
    into v_torneo_id, v_genero
    from serie s
    join categoria cat on cat.id = s.categoria_id
   where s.id = p_serie_id;

  if not found then
    raise exception 'La serie % no existe', p_serie_id;
  end if;

  -- ── El tercero tiene que ser un equipo ───────────────────────────────────
  -- La FK solo garantiza que el tercero existe. Un sponsor o un proveedor no
  -- puede tener ficha, y sin esto entraría sin quejarse.

  select tipo into v_tipo from tercero where id = p_tercero_id;
  if not found then
    raise exception 'El tercero % no existe', p_tercero_id;
  end if;
  if v_tipo <> 'equipo' then
    raise exception
      'El tercero % es de tipo "%" y solo los equipos tienen ficha',
      p_tercero_id, v_tipo;
  end if;

  -- ── La ficha ─────────────────────────────────────────────────────────────
  -- total_facturado queda en su default 0: lo corrige sync_total_facturado a
  -- medida que entran las cuotas. El trigger check_ficha_coherente valida que
  -- la serie y los dos planes sean del mismo torneo, y que cada plan sea de su
  -- concepto y del género que sale de la categoría.

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

  -- ── Validaciones previas a generar ───────────────────────────────────────
  -- Se chequea todo antes de insertar una sola cuota. Una ficha a medio
  -- facturar es peor que una que no se creó: el equipo aparecería debiendo
  -- menos de lo que debe.

  for v_linea in
    select l.*, p.concepto
      from plan_tarifa p
      join plan_tarifa_linea l on l.plan_tarifa_id = p.id
     where p.id in (p_plan_inscripcion_id, p_plan_partidos_id)
  loop
    -- Las de fecha propia necesitan tenerla.
    if v_linea.regla in ('fecha_fija','bloque_adelantado')
       and v_linea.fecha_referencia is null then
      raise exception
        'La línea "%" (%) no tiene fecha_referencia y su regla la necesita '
        'para fijar el vencimiento',
        v_linea.concepto_label, v_linea.regla;
    end if;

    -- Las de liga necesitan jornadas con fecha cargada.
    if v_linea.regla = 'por_partido' and not v_linea.es_playoff then
      select count(*) into v_hallados
        from jornada j
       where j.torneo_id = v_torneo_id
         and j.genero    = v_genero
         and not j.es_playoff
         and j.estado <> 'suspendida'
         and j.numero between v_linea.fecha_desde and v_linea.fecha_hasta;

      if v_hallados = 0 then
        raise exception
          'La línea "%" cubre las fechas %–% pero el calendario % del torneo '
          'no tiene ninguna jornada en ese rango. Sembrá la grilla con '
          'generar_grilla_liga() antes de armar fichas.',
          v_linea.concepto_label, v_linea.fecha_desde, v_linea.fecha_hasta, v_genero;
      end if;

      if v_linea.cantidad_esperada is not null
         and v_hallados <> v_linea.cantidad_esperada then
        raise exception
          'La línea "%" espera % fechas y el calendario % tiene % en el rango '
          '%–%. Se facturaría de menos (o de más): revisá la grilla o la '
          'cantidad esperada del tarifario.',
          v_linea.concepto_label, v_linea.cantidad_esperada, v_genero,
          v_hallados, v_linea.fecha_desde, v_linea.fecha_hasta;
      end if;

      if exists (
        select 1 from jornada j
         where j.torneo_id = v_torneo_id
           and j.genero    = v_genero
           and not j.es_playoff
           and j.estado <> 'suspendida'
           and j.numero between v_linea.fecha_desde and v_linea.fecha_hasta
           and j.fecha is null
      ) then
        raise exception
          'Hay jornadas sin fecha en el rango %–% del calendario %. La cuota '
          'de cada fecha vence con su jornada: programá el calendario antes '
          'de armar fichas.',
          v_linea.fecha_desde, v_linea.fecha_hasta, v_genero;
      end if;
    end if;
  end loop;

  -- ── Generación ───────────────────────────────────────────────────────────

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
    -- fecha_fija y bloque_adelantado: una cuota, fecha propia.
    -- El bloque lleva el TOTAL, que es lo que ya guarda precio_*.
    select l.id as linea_id, null::uuid as jornada_id, null::int as jornada_numero,
           l.fecha_referencia as vence_at, l.monto, l.concepto, l.linea_orden
      from lineas l
     where l.regla in ('fecha_fija','bloque_adelantado')

    union all

    -- por_partido de liga: una cuota por jornada del rango, atada a ella.
    -- Se excluyen las suspendidas: esa fecha no se juega y no se cobra
    -- (§3.5 — suspender saca la jornada de la proyección y del presupuesto).
    -- Las 'reprogramada' SÍ entran: la fecha se juega igual, más tarde, y la
    -- cuota se mueve con ella (decisión 39). Filtrarlas sería no cobrarla.
    select l.id, j.id, j.numero, j.fecha, l.monto, l.concepto, l.linea_orden
      from lineas l
      join jornada j
        on  j.torneo_id = v_torneo_id
        and j.genero    = v_genero
        and not j.es_playoff
        and j.estado <> 'suspendida'
        and j.numero between l.fecha_desde and l.fecha_hasta
     where l.regla = 'por_partido'
       and not l.es_playoff

    -- Los playoffs no aparecen: no generan cuota al armar la ficha.
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
end $$ language plpgsql;

comment on function crear_equipo_torneo is
  'Arma la ficha de un equipo y genera sus cuotas en una transacción. El '
  'torneo y el género se derivan de la serie. Las cuotas salen de las líneas '
  'de los dos planes elegidos, según la regla de cada línea: fecha_fija y '
  'bloque_adelantado dan una cuota con fecha propia, por_partido de liga da '
  'una por jornada atada al calendario, y los playoffs no generan. No escribe '
  'en el libro diario: con percibido puro el asiento nace del cobro.';


-- ============================================================================
-- VERIFICACIÓN · correr después de aplicar. No crea datos.
-- ============================================================================

do $$
declare v_fallas text := '';
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'crear_equipo_torneo'
  ) then
    v_fallas := v_fallas || E'\n  · no se creó la función crear_equipo_torneo';
  end if;

  -- La firma se compara por NOMBRES DE TIPO. Dos caminos que no funcionan:
  -- pg_get_function_identity_arguments() incluye los nombres de parámetro y
  -- varía entre versiones; y proargtypes::oid[] devuelve un array indexado
  -- desde 0, así que nunca es igual a un array literal indexado desde 1.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'crear_equipo_torneo'
       and p.pronargs = 6
       and p.pronargdefaults = 1
       and pg_get_function_result(p.oid) = 'uuid'
       and (select array_agg(t.typname::text order by u.ord)
              from unnest(p.proargtypes::oid[]) with ordinality as u(t_oid, ord)
              join pg_type t on t.oid = u.t_oid)
           = array['uuid','uuid','uuid','uuid','medio_pago','uuid']
  ) then
    v_fallas := v_fallas || E'\n  · la firma no es la esperada';
  end if;

  -- B0 no puede tocar el diario: con percibido puro el asiento nace del cobro.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'crear_equipo_torneo'
       and pg_get_functiondef(p.oid) ilike '%crear_asiento%'
  ) then
    v_fallas := v_fallas || E'\n  · la función invoca crear_asiento y no debería';
  end if;

  if v_fallas <> '' then
    raise exception 'B0 incompleta:%', v_fallas;
  end if;

  raise notice 'B0 OK · crear_equipo_torneo disponible';
end $$;
