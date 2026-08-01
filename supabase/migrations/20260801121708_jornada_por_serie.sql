-- ============================================================================
-- CAMPA · Pieza 1/6 del rediseño de calendario · jornada por serie
--
-- Implementa el Draft 14 · decisiones 42, 43 y 48.
--
-- La jornada pasa a colgar de la SERIE. Identidad natural `(serie_id, numero)`.
-- El género y el torneo se derivan subiendo serie → categoria, igual que la
-- ficha (decisión 36).
--
-- SOLO ESTRUCTURA. Agnóstica del torneo (regla 12 de CLAUDE.md): no aparece
-- ningún número de fechas, ningún nombre de serie, ninguna fecha concreta.
-- Cargar las 284 jornadas del Clausura es la pieza 2, y sale del seed.
--
-- PRECONDICIÓN VERIFICADA: jornada tiene 0 filas y las siete FKs que la
-- apuntan tienen 0 valores. No hay backfill.
--
-- ── Qué NO cambia ───────────────────────────────────────────────────────────
-- La PK sigue siendo `id`, así que las siete FKs que apuntan a jornada.id
-- —asiento, pago, gasto, arqueo, cuota, plan_tarifa_linea.hito_jornada_id y el
-- reprograma_a propio— no se tocan. Cambia la identidad natural, no la
-- primaria.
--
-- `fecha` ya existe (date, nullable) y se mantiene tal cual: es la que leen las
-- cuotas de liga para su vencimiento (decisión 39). Sigue nullable porque la
-- grilla puede sembrarse antes de que se programen los días.
-- ============================================================================

-- ── 0. Precondición ─────────────────────────────────────────────────────────

do $$
declare v_j int;
begin
  select count(*) into v_j from jornada;
  if v_j > 0 then
    raise exception
      'Esta migración reestructura jornada sin backfill y hay % filas. Con '
      'datos habría que decidir a qué serie corresponde cada jornada de '
      'género, y esa estrategia no existe acá.', v_j;
  end if;
end $$;


-- ── 1. Se baja la vista que depende de jornada.torneo_id ────────────────────
-- v_presupuesto_total filtra por j.torneo_id. Se recrea en el paso 4 usando el
-- join a la estructura. Se verificó que ninguna otra vista lee jornada.

drop view if exists v_presupuesto_total;


-- ── 2. jornada ──────────────────────────────────────────────────────────────

-- Sale `genero`: pasa a derivarse de serie → categoria. Ninguna vista lo lee;
-- la única función que lo usaba es crear_equipo_torneo, que se alinea en el
-- paso 5 de esta misma migración para no dejarla rota entre piezas.
alter table jornada drop column genero;

-- Sale `torneo_id`: es derivable por serie → categoria → torneo_id, y
-- mantenerlo permitiría que una jornada de Libre A dijera pertenecer a otro
-- torneo. Se elimina en lugar de agregar un trigger de coherencia para
-- sostener un dato que no hace falta. Al caer la columna cae también su FK y
-- el unique viejo (torneo_id, genero, numero).
alter table jornada drop column torneo_id;

alter table jornada
  add column serie_id uuid not null references serie(id);

-- Identidad natural nueva. Vale solo para liga: los playoffs llevan `numero`
-- nulo y el unique los ignora, que es el comportamiento correcto —una serie
-- puede tener varias instancias de playoff.
alter table jornada
  add constraint uq_jornada_liga unique (serie_id, numero);

create index idx_jornada_serie on jornada(serie_id);

comment on column jornada.serie_id is
  'La jornada pertenece a una serie. El género y el torneo se derivan subiendo '
  'serie → categoria (decisión 42). No se duplican acá: duplicarlos permitiría '
  'que contradigan a la serie.';

comment on column jornada.fecha is
  'Día en que se juega. Nullable hasta que se programe. Es la fecha que leen '
  'las cuotas de liga para su vencimiento (decisión 39): reprogramar la '
  'jornada corre el vencimiento.';

comment on table jornada is
  'La fecha N de UNA serie. No confundir con "fecha de calendario", que es un '
  'día concreto en el que juegan muchas series (decisión 43). Una fecha de '
  'calendario agrupa muchas jornadas.';


-- ── 3. torneo.cant_fechas ───────────────────────────────────────────────────
-- Columna muerta con default engañoso: decía 10, que no corresponde a ningún
-- torneo real. Se verificó que ninguna vista ni función la lee. Con jornadas
-- por serie el concepto deja de existir como número único del torneo: cada
-- serie tiene su cantidad, derivable de sus jornadas.

alter table torneo drop column cant_fechas;


-- ── 4. v_presupuesto_total, recreada ────────────────────────────────────────
-- Misma semántica que antes; lo único que cambia es cómo llega al torneo:
-- antes j.torneo_id directo, ahora subiendo serie → categoria.
--
-- ⚠ ESTA VISTA TIENE UN PROBLEMA CONOCIDO, y esta migración NO lo resuelve.
-- Cuenta jornadas del torneo sin distinguir la unidad del costo. Hoy da 0
-- —jornada está vacía—, pero cuando la pieza 2 cargue las 284, un presupuesto
-- `por_jornada` se multiplicaría por 284 donde antes se multiplicaba por 28.
-- La corrección es la pieza 5 (las tres unidades: partido / día-cancha / fijo,
-- decisión 44). Las tablas de presupuesto están vacías, así que todavía no hay
-- ningún número mal — pero la pieza 5 tiene que llegar antes que el primer
-- presupuesto cargado.

create view v_presupuesto_total as
select
  pl.*,
  p.torneo_id,
  p.ejercicio_id,
  case pl.unidad
    when 'por_jornada' then pl.base * pl.cantidad * coalesce((
      select count(*)
        from jornada j
        join serie s     on s.id  = j.serie_id
        join categoria c on c.id  = s.categoria_id
       where c.torneo_id = p.torneo_id
         and j.estado <> 'suspendida'), 0)
    when 'por_mes' then pl.base * pl.cantidad * 12
    else pl.base
  end as total_presupuestado
from presupuesto_linea pl
join presupuesto p on p.id = pl.presupuesto_id;

comment on view v_presupuesto_total is
  'Presupuesto por línea. La rama por_jornada cuenta jornadas del torneo '
  'subiendo desde la serie. PENDIENTE (decisión 44): distinguir la unidad del '
  'costo —por partido, por día de cancha, fijo— en lugar de multiplicar por la '
  'cantidad de jornadas.';


-- ── 5. crear_equipo_torneo (B0), alineada al modelo nuevo ───────────────────
-- Es la ÚNICA función que leía jornada.genero y jornada.torneo_id — verificado
-- sobre las 26 del schema. Sus tres filtros de la rama por_partido pasan a
-- resolver por serie.
--
-- El cambio no es cosmético: antes ataba la cuota a "la jornada N del género",
-- la misma para todas las series masculinas; ahora la ata a la jornada N de LA
-- SERIE DEL EQUIPO, que es la que ese equipo realmente juega. Recién con esto
-- la decisión 39 se cumple con la fecha correcta.
--
-- Sale la variable v_genero: solo servía para esos filtros y para mensajes que
-- hablaban del "calendario del género", que con jornadas por serie ya no
-- describe nada. v_torneo_id se mantiene: lo necesita el insert de la ficha.
--
-- La rama por_partido sigue sin poder ejercitarse hasta la pieza 2 (no hay
-- grilla), pero queda estructuralmente correcta.

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
  v_ficha_id   uuid;
  v_tipo       text;
  v_linea      record;
  v_hallados   int;
  v_cuotas     int;
begin
  select cat.torneo_id
    into v_torneo_id
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

    -- Una cuota por jornada de LA SERIE del equipo, no del género.
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
end $$ language plpgsql;

comment on function crear_equipo_torneo is
  'Arma la ficha de un equipo y genera sus cuotas en una transacción. El '
  'torneo se deriva de la serie. Las cuotas salen de las líneas de los dos '
  'planes elegidos, según la regla de cada línea: fecha_fija y '
  'bloque_adelantado dan una cuota con fecha propia, por_partido de liga da '
  'una por jornada NO SUSPENDIDA DE LA SERIE, y los playoffs no generan. No '
  'escribe en el libro diario: con percibido puro el asiento nace del cobro.';


-- ============================================================================
-- VERIFICACIÓN · correr después de aplicar. Debe devolver todo OK.
-- ============================================================================

do $$
declare v_fallas text := '';
begin
  -- jornada: columnas
  if exists (select 1 from information_schema.columns
              where table_name='jornada' and column_name in ('genero','torneo_id')) then
    v_fallas := v_fallas || E'\n  · jornada conserva genero o torneo_id';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_name='jornada' and column_name='serie_id'
                    and is_nullable='NO') then
    v_fallas := v_fallas || E'\n  · falta jornada.serie_id NOT NULL';
  end if;

  -- fecha sigue estando y sigue siendo nullable
  if not exists (select 1 from information_schema.columns
                  where table_name='jornada' and column_name='fecha'
                    and data_type='date' and is_nullable='YES') then
    v_fallas := v_fallas || E'\n  · jornada.fecha no es date nullable';
  end if;

  -- FK a serie
  if not exists (
    select 1 from pg_constraint
     where conrelid='jornada'::regclass and contype='f'
       and confrelid='serie'::regclass) then
    v_fallas := v_fallas || E'\n  · falta la FK jornada.serie_id → serie';
  end if;

  -- identidad natural nueva
  if not exists (
    select 1 from pg_constraint
     where conrelid='jornada'::regclass and conname='uq_jornada_liga'
       and pg_get_constraintdef(oid) = 'UNIQUE (serie_id, numero)') then
    v_fallas := v_fallas || E'\n  · el unique no es (serie_id, numero)';
  end if;

  -- la PK no cambió
  if not exists (
    select 1 from pg_constraint
     where conrelid='jornada'::regclass and contype='p'
       and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)') then
    v_fallas := v_fallas || E'\n  · la PK de jornada dejó de ser (id)';
  end if;

  -- las siete FKs entrantes siguen intactas
  if (select count(*) from pg_constraint
       where confrelid='jornada'::regclass and contype='f') <> 7 then
    v_fallas := v_fallas || E'\n  · no quedan las 7 FKs que apuntan a jornada';
  end if;

  -- cant_fechas eliminada
  if exists (select 1 from information_schema.columns
              where table_name='torneo' and column_name='cant_fechas') then
    v_fallas := v_fallas || E'\n  · torneo.cant_fechas sigue existiendo';
  end if;

  -- la vista volvió
  if not exists (select 1 from pg_views where viewname='v_presupuesto_total') then
    v_fallas := v_fallas || E'\n  · no se recreó v_presupuesto_total';
  end if;

  -- B0 alineada: ninguna función puede seguir leyendo jornada.genero
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.prokind='f'
       and pg_get_functiondef(p.oid) ~ 'j\.genero') then
    v_fallas := v_fallas || E'\n  · alguna función sigue leyendo jornada.genero';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='crear_equipo_torneo'
       and pg_get_functiondef(p.oid) ~ 'j\.serie_id = p_serie_id') then
    v_fallas := v_fallas || E'\n  · B0 no resuelve las jornadas por serie';
  end if;

  if v_fallas <> '' then
    raise exception 'Pieza 1 incompleta:%', v_fallas;
  end if;

  raise notice 'Pieza 1 OK · jornada cuelga de serie';
end $$;
