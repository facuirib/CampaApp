-- ═══════════════════════════════════════════════════════════════════════════
-- Estructura de torneo · paso 2 — clonar categorías/series + ABM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hasta acá la estructura de un torneo —categorías y series— **solo se podía
-- cargar editando un seed**. Ninguna función la escribía y el front solo la
-- leía. Este paso la pone en manos del operador.
--
-- Son dos caminos para el mismo lugar:
--
--   · `clonar_estructura_torneo` — el normal. El torneo nuevo es 90%
--     continuidad del anterior y los nombres de categoría y serie se mantienen
--     entre torneos, así que copiarlas es el atajo correcto.
--   · el ABM — para el primer torneo (no hay de dónde clonar), para las series
--     que se agregan, y para corregir.
--
-- **No se clona el tarifario**: sus 26 líneas tienen precios y fechas de 2026,
-- y las dos cosas cambian todos los torneos. Va a mano, en el paso 3.
-- **Tampoco las fichas**: eso es el paso 4, y necesita que estas series existan
-- primero para emparejar por nombre.
--
-- ── El mapeo de categorías, sin tabla auxiliar ─────────────────────────────
--
-- `categoria` tiene `UNIQUE (torneo_id, nombre)` — por **nombre solo**, no
-- nombre+género. Así que el emparejamiento origen→destino es directo: se busca
-- por nombre y se obtiene o se crea. El `id` de la categoría destino vive en la
-- variable del loop, que es todo el "mapeo" que hace falta para colgarle las
-- series.
--
-- ── Completa, no rechaza ───────────────────────────────────────────────────
--
-- Un destino que ya tiene categorías **no es un error**. Es el caso real: el
-- Apertura 2027 tiene «Libre» con su serie A, y si la función rechazara todo
-- destino no vacío, el único torneo al que hoy querríamos clonarle sería
-- justamente el que no se puede.
--
-- Completar es además idempotente —correrla dos veces no hace nada— y no pisa
-- lo que el operador haya cargado a mano antes.

-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.clonar_estructura_torneo(
  p_origen_id   uuid,
  p_destino_id  uuid
)
returns jsonb
language plpgsql
as $function$
declare
  v_cat            record;
  v_cat_destino    uuid;
  v_existia        boolean;
  v_cat_creadas    int := 0;
  v_cat_reusadas   int := 0;
  v_ser_creadas    int := 0;
  v_ser_existentes int := 0;
  v_n              int;
begin
  if not exists (select 1 from torneo where id = p_origen_id) then
    raise exception 'El torneo origen % no existe', p_origen_id;
  end if;

  if not exists (select 1 from torneo where id = p_destino_id) then
    raise exception 'El torneo destino % no existe', p_destino_id;
  end if;

  if p_origen_id = p_destino_id then
    raise exception
      'El origen y el destino son el mismo torneo. Elegí de qué torneo copiar '
      'la estructura.';
  end if;

  if not exists (select 1 from categoria where torneo_id = p_origen_id) then
    raise exception
      'El torneo origen no tiene categorías: no hay estructura para copiar.';
  end if;

  for v_cat in
    select id, nombre, genero, orden
      from categoria
     where torneo_id = p_origen_id
     order by orden nulls last, nombre
  loop
    select id into v_cat_destino
      from categoria
     where torneo_id = p_destino_id and nombre = v_cat.nombre;

    v_existia := found;

    if v_existia then
      v_cat_reusadas := v_cat_reusadas + 1;
    else
      insert into categoria (torneo_id, nombre, genero, orden)
      values (p_destino_id, v_cat.nombre, v_cat.genero, v_cat.orden)
      returning id into v_cat_destino;
      v_cat_creadas := v_cat_creadas + 1;
    end if;

    -- Las series que faltan, no todas: el `not exists` es lo que hace que
    -- correr esto dos veces no duplique.
    insert into serie (categoria_id, nombre, orden)
    select v_cat_destino, s.nombre, s.orden
      from serie s
     where s.categoria_id = v_cat.id
       and not exists (
         select 1 from serie d
          where d.categoria_id = v_cat_destino and d.nombre = s.nombre
       );

    -- `row_count` mide ESTE insert, así que hay que acumularlo acá adentro:
    -- leerlo después del loop daría solo lo de la última categoría.
    get diagnostics v_n = row_count;
    v_ser_creadas := v_ser_creadas + v_n;

    v_ser_existentes := v_ser_existentes
      + (select count(*) from serie s where s.categoria_id = v_cat.id) - v_n;
  end loop;

  -- ── El retorno cuenta INSERCIONES, no el estado del destino ──────────────
  --
  -- Un prototipo de esta función devolvía en `series_creadas` el total de
  -- series del destino. Al correrla por segunda vez informaba «20 series
  -- creadas» habiendo creado cero — la pantalla habría dicho que copió todo
  -- cuando no copió nada.
  --
  -- Es el mismo retorno mentiroso de `cargar_cuotas_sponsor`, que devuelve el
  -- `row_count` del INSERT y por eso no delataba que el DELETE previo se había
  -- bloqueado. Un contador que mide el estado final en vez del efecto de la
  -- operación no sirve para saber qué hizo la operación.
  return jsonb_build_object(
    'categorias_creadas',  v_cat_creadas,
    'categorias_reusadas', v_cat_reusadas,
    'series_creadas',      v_ser_creadas,
    'series_existentes',   v_ser_existentes
  );
end;
$function$;

comment on function clonar_estructura_torneo(uuid, uuid) is
  'Copia categorías y series de un torneo a otro. COMPLETA en vez de rechazar: si el destino ya tiene una categoría con ese nombre la reusa, y de sus series copia solo las que faltan — correrla dos veces no duplica nada. No copia tarifario (precios y fechas cambian cada torneo, paso 3) ni fichas (paso 4). El retorno cuenta inserciones reales, no el estado del destino.';


-- ═══ ABM de categoría ══════════════════════════════════════════════════════

create or replace function public.crear_categoria(
  p_torneo_id  uuid,
  p_nombre     text,
  p_genero     genero,
  p_orden      smallint default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  if not exists (select 1 from torneo where id = p_torneo_id) then
    raise exception 'El torneo % no existe', p_torneo_id;
  end if;

  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'La categoría necesita un nombre';
  end if;

  begin
    insert into categoria (torneo_id, nombre, genero, orden)
    values (p_torneo_id, trim(p_nombre), p_genero,
            coalesce(p_orden,
                     (select coalesce(max(orden), 0) + 1 from categoria where torneo_id = p_torneo_id)))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya existe una categoría «%» en este torneo.', trim(p_nombre);
  end;

  return v_id;
end;
$function$;


create or replace function public.editar_categoria(
  p_categoria_id  uuid,
  p_nombre        text default null,
  p_genero        genero default null,
  p_orden         smallint default null
)
returns void
language plpgsql
as $function$
declare
  v_cat     record;
  v_fichas  int;
begin
  select id, torneo_id, nombre, genero into v_cat from categoria where id = p_categoria_id;

  if not found then
    raise exception 'La categoría % no existe', p_categoria_id;
  end if;

  -- ── El género no se cambia si ya hay fichas ─────────────────────────────
  --
  -- `trg_ficha_coherente` valida que el género del plan coincida con el de la
  -- categoría de la ficha. Ese trigger corre al escribir `equipo_torneo`, no al
  -- escribir `categoria`: cambiar el género acá dejaría todas las fichas
  -- existentes apuntando a planes del género viejo, y **nadie se enteraría**
  -- hasta que alguien tocara una de esas fichas, quizá meses después.
  --
  -- Es la misma clase de daño que un UPDATE bloqueado por RLS —silencioso y
  -- diferido—, solo que del lado de los datos. Por eso se frena acá, con el
  -- número de fichas en el mensaje.
  if p_genero is not null and p_genero <> v_cat.genero then
    select count(*) into v_fichas
      from equipo_torneo e
      join serie s on s.id = e.serie_id
     where s.categoria_id = p_categoria_id;

    if v_fichas > 0 then
      raise exception
        'No se puede cambiar el género de «%»: tiene % equipo(s) inscripto(s), '
        'y sus planes de tarifa son del género actual. Cambiar el género '
        'dejaría esas fichas incoherentes.',
        v_cat.nombre, v_fichas;
    end if;
  end if;

  if p_nombre is not null and trim(p_nombre) = '' then
    raise exception 'La categoría necesita un nombre';
  end if;

  begin
    update categoria
       set nombre = coalesce(nullif(trim(coalesce(p_nombre, '')), ''), nombre),
           genero = coalesce(p_genero, genero),
           orden  = coalesce(p_orden, orden)
     where id = p_categoria_id;
  exception when unique_violation then
    raise exception 'Ya existe una categoría «%» en este torneo.', trim(p_nombre);
  end;
end;
$function$;


create or replace function public.borrar_categoria(
  p_categoria_id uuid
)
returns void
language plpgsql
as $function$
declare
  v_nombre  text;
  v_series  int;
  v_fichas  int;
begin
  select nombre into v_nombre from categoria where id = p_categoria_id;

  if not found then
    raise exception 'La categoría % no existe', p_categoria_id;
  end if;

  -- ── La guarda existe para hablar, no para impedir ───────────────────────
  --
  -- La FK ya impide el borrado: sin esto, Postgres tira un 23503 con el nombre
  -- del constraint y el operador no tiene idea de qué hacer. Lo que agrega la
  -- guarda es el POR QUÉ y el paso siguiente.
  select count(*) into v_series from serie where categoria_id = p_categoria_id;

  select count(*) into v_fichas
    from equipo_torneo e
    join serie s on s.id = e.serie_id
   where s.categoria_id = p_categoria_id;

  if v_fichas > 0 then
    raise exception
      'No se puede borrar «%»: tiene % equipo(s) inscripto(s). Movelos a otra '
      'categoría antes de borrarla.',
      v_nombre, v_fichas;
  end if;

  if v_series > 0 then
    raise exception
      'No se puede borrar «%»: tiene % serie(s). Borrá primero las series.',
      v_nombre, v_series;
  end if;

  delete from categoria where id = p_categoria_id;
end;
$function$;


-- ═══ ABM de serie ══════════════════════════════════════════════════════════

create or replace function public.crear_serie(
  p_categoria_id  uuid,
  p_nombre        text,
  p_orden         smallint default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  if not exists (select 1 from categoria where id = p_categoria_id) then
    raise exception 'La categoría % no existe', p_categoria_id;
  end if;

  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'La serie necesita un nombre';
  end if;

  begin
    insert into serie (categoria_id, nombre, orden)
    values (p_categoria_id, trim(p_nombre),
            coalesce(p_orden,
                     (select coalesce(max(orden), 0) + 1 from serie where categoria_id = p_categoria_id)))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya existe una serie «%» en esta categoría.', trim(p_nombre);
  end;

  return v_id;
end;
$function$;


create or replace function public.editar_serie(
  p_serie_id  uuid,
  p_nombre    text default null,
  p_orden     smallint default null
)
returns void
language plpgsql
as $function$
begin
  if not exists (select 1 from serie where id = p_serie_id) then
    raise exception 'La serie % no existe', p_serie_id;
  end if;

  if p_nombre is not null and trim(p_nombre) = '' then
    raise exception 'La serie necesita un nombre';
  end if;

  -- El nombre de la serie es lo que el paso 4 va a usar para emparejar las
  -- fichas del torneo anterior con las series del nuevo. Renombrar una serie de
  -- un torneo ya armado no rompe nada hoy —las fichas apuntan por id— pero
  -- desalinea ese emparejamiento para el torneo siguiente.
  begin
    update serie
       set nombre = coalesce(nullif(trim(coalesce(p_nombre, '')), ''), nombre),
           orden  = coalesce(p_orden, orden)
     where id = p_serie_id;
  exception when unique_violation then
    raise exception 'Ya existe una serie «%» en esta categoría.', trim(p_nombre);
  end;
end;
$function$;


create or replace function public.borrar_serie(
  p_serie_id uuid
)
returns void
language plpgsql
as $function$
declare
  v_nombre  text;
  v_fichas  int;
begin
  select nombre into v_nombre from serie where id = p_serie_id;

  if not found then
    raise exception 'La serie % no existe', p_serie_id;
  end if;

  select count(*) into v_fichas from equipo_torneo where serie_id = p_serie_id;

  if v_fichas > 0 then
    raise exception
      'No se puede borrar la serie «%»: tiene % equipo(s) inscripto(s). '
      'Movelos a otra serie antes de borrarla.',
      v_nombre, v_fichas;
  end if;

  delete from serie where id = p_serie_id;
end;
$function$;


comment on function crear_categoria(uuid, text, genero, smallint) is
  'Alta de categoría. El orden se autonumera si no se pasa. Traduce el unique (torneo_id, nombre) a un mensaje con el nombre.';
comment on function editar_categoria(uuid, text, genero, smallint) is
  'Edición parcial. RECHAZA cambiar el género si la categoría ya tiene fichas: trg_ficha_coherente valida género plan-vs-categoría al escribir equipo_torneo, así que el cambio dejaría las fichas existentes incoherentes y nadie se enteraría hasta tocarlas.';
comment on function borrar_categoria(uuid) is
  'Baja de categoría. La FK ya la impide si tiene series; esta guarda existe para decir POR QUÉ y cuál es el paso siguiente, en vez del 23503 crudo.';
comment on function crear_serie(uuid, text, smallint) is
  'Alta de serie dentro de una categoría. El orden se autonumera si no se pasa.';
comment on function editar_serie(uuid, text, smallint) is
  'Edición parcial. Ojo con renombrar en un torneo ya armado: el arrastre de fichas del paso 4 empareja por nombre de serie.';
comment on function borrar_serie(uuid) is
  'Baja de serie. Rechaza con el conteo de equipos inscriptos si los tiene.';


-- ═══ RLS · categoria y serie ganan escritura ══════════════════════════════
--
-- Las dos están **encendidas desde la Fase 1/2 con policy de solo SELECT**: se
-- clasificaron como catálogos de lectura porque en ese momento ninguna función
-- las escribía y el front solo las mostraba.
--
-- Ahora las escriben las siete funciones de arriba, así que necesitan
-- INSERT/UPDATE/DELETE. Sin esto, el primer `insert into categoria` moriría con
-- «new row violates row-level security policy», y el UPDATE y el DELETE
-- **medirían 0 filas sin decir nada** — que es como `activo` estuvo roto desde
-- la Fase 2 sin que nadie lo notara.
--
-- No se activa RLS en ninguna tabla nueva: las dos ya lo tenían. **RLS sigue en
-- 38/51**; lo que cambia es la cantidad de policies.

create policy categoria_insert_autenticado
  on categoria for insert to authenticated with check (true);
create policy categoria_update_autenticado
  on categoria for update to authenticated using (true) with check (true);
create policy categoria_delete_autenticado
  on categoria for delete to authenticated using (true);

create policy serie_insert_autenticado
  on serie for insert to authenticated with check (true);
create policy serie_update_autenticado
  on serie for update to authenticated using (true) with check (true);
create policy serie_delete_autenticado
  on serie for delete to authenticated using (true);
