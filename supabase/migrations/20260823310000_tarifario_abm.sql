-- ═══════════════════════════════════════════════════════════════════════════
-- Tarifario editable · paso 3 del módulo de estructura
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `plan_tarifa` y `plan_tarifa_linea` son las últimas dos tablas de la
-- estructura que solo se podían cargar por seed. Con esto, un torneo nuevo se
-- arma entero desde la app.
--
-- El tarifario **no se clona** entre torneos: sus 26 líneas tienen precios y
-- fechas que cambian todas las temporadas. Se carga a mano, y por eso la
-- pantalla importa más acá que en los pasos anteriores.
--
-- ── Editar un plan que ya generó cuotas: se AVISA, no se bloquea ───────────
--
-- `crear_equipo_torneo` lee el tarifario **al crear la ficha** y materializa
-- las cuotas ahí. Editar el plan después **no toca las cuotas ya emitidas**:
-- solo cambia lo que se emita de ahí en más.
--
-- Verificado: con 10 fichas colgando del plan masculino/inscripción/Pago único,
-- cambiar el precio de la Seña de 1.000.000 a 9.999.999 dejó las 130 cuotas
-- emitidas en los mismos $100.800.000. El `total_plan` de las fichas tampoco se
-- movió — deriva de `cuota`, no del plan.
--
-- O sea que el aviso de la pantalla es literalmente cierto, y por eso alcanza
-- con avisar. `v_plan_tarifa_uso` le da el número.

-- ═══════════════════════════════════════════════════════════════════════════
-- La matriz regla ↔ campos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- No es una convención elegida acá: es **lo que `crear_equipo_torneo` exige**
-- al armar una ficha. Son cuatro formas, no dos:
--
--   fecha_fija            fecha_referencia          (el vencimiento de la cuota)
--   por_partido playoff   cantidad_esperada         (máximo de partidos, sin fechas
--                                                    numeradas: la eliminación
--                                                    directa no tiene jornada fija)
--   por_partido regular   desde/hasta + cantidad    (precio UNITARIO por partido;
--                                                    el vencimiento sale de la
--                                                    jornada)
--   bloque_adelantado     fecha_referencia          (cuándo vence el bloque)
--                         + desde/hasta + cantidad  (qué fechas cubre; el precio
--                                                    es el TOTAL del bloque)
--
-- La validación **rechaza también el campo que sobra**, no solo exige el que
-- falta. Una línea `fecha_fija` con `fecha_desde` cargado es un dato que nadie
-- lee y que le miente al que lo mira.
--
-- Y se valida acá y no solo en `crear_equipo_torneo` por una razón de lugar: si
-- el ABM aceptara una línea incoherente, el error aparecería meses después, al
-- armar la primera ficha del torneo — lejos de quien la cargó y sin forma de
-- saber qué fue lo que se escribió mal.

create or replace function public.validar_linea_tarifa(
  p_regla              regla_vencimiento,
  p_es_playoff         boolean,
  p_fecha_referencia   date,
  p_fecha_desde        smallint,
  p_fecha_hasta        smallint,
  p_cantidad_esperada  smallint,
  p_label              text
)
returns void
language plpgsql
immutable
as $function$
declare
  v_tiene_rango boolean := p_fecha_desde is not null or p_fecha_hasta is not null;
begin
  if p_regla = 'fecha_fija' then
    if p_fecha_referencia is null then
      raise exception
        'La línea «%» es de fecha fija: necesita la fecha de vencimiento.', p_label;
    end if;
    if v_tiene_rango then
      raise exception
        'La línea «%» es de fecha fija: no lleva rango de fechas. Ese rango es '
        'para las reglas que cobran por partido.', p_label;
    end if;
    if p_cantidad_esperada is not null then
      raise exception
        'La línea «%» es de fecha fija: no lleva cantidad de partidos.', p_label;
    end if;
    if p_es_playoff then
      raise exception
        'La línea «%» es de fecha fija: no puede ser de playoffs. Los playoffs '
        'se cobran por partido.', p_label;
    end if;

  elsif p_regla = 'por_partido' and p_es_playoff then
    -- La eliminación directa no tiene jornadas numeradas: no hay rango que
    -- poner. `cantidad_esperada` es el MÁXIMO de partidos (cuartos, semi,
    -- final), no una cantidad garantizada — el equipo puede quedar afuera antes.
    if p_cantidad_esperada is null or p_cantidad_esperada <= 0 then
      raise exception
        'La línea «%» es de playoffs: necesita el máximo de partidos '
        '(por ejemplo 3: cuartos, semi y final).', p_label;
    end if;
    if v_tiene_rango then
      raise exception
        'La línea «%» es de playoffs: no lleva rango de fechas, porque la '
        'eliminación directa no tiene jornadas numeradas.', p_label;
    end if;
    if p_fecha_referencia is not null then
      raise exception
        'La línea «%» es de playoffs: no lleva fecha de vencimiento fija — cada '
        'partido vence con su jornada.', p_label;
    end if;

  elsif p_regla = 'por_partido' then
    if p_fecha_desde is null or p_fecha_hasta is null then
      raise exception
        'La línea «%» cobra por partido: necesita desde qué fecha hasta cuál '
        '(por ejemplo, de la 1 a la 10).', p_label;
    end if;
    if p_fecha_referencia is not null then
      raise exception
        'La línea «%» cobra por partido: no lleva fecha de vencimiento fija. '
        'Cada partido vence con su jornada.', p_label;
    end if;
    if p_cantidad_esperada is null then
      raise exception
        'La línea «%» cobra por partido: necesita cuántos partidos se esperan '
        'en ese rango.', p_label;
    end if;

  elsif p_regla = 'bloque_adelantado' then
    -- El bloque necesita las DOS cosas: cuándo vence y qué cubre. Y su precio
    -- es el TOTAL del bloque, no el unitario — de ahí que la cantidad tenga que
    -- coincidir exacto con el rango.
    if p_fecha_referencia is null then
      raise exception
        'La línea «%» es un bloque adelantado: necesita la fecha en que se paga.', p_label;
    end if;
    if p_fecha_desde is null or p_fecha_hasta is null then
      raise exception
        'La línea «%» es un bloque adelantado: necesita qué fechas cubre '
        '(por ejemplo, de la 11 a la 15).', p_label;
    end if;
    if p_cantidad_esperada is null then
      raise exception
        'La línea «%» es un bloque adelantado: necesita cuántos partidos cubre.', p_label;
    end if;
    if p_es_playoff then
      raise exception
        'La línea «%» no puede ser un bloque adelantado de playoffs.', p_label;
    end if;
  end if;

  -- ── Chequeos comunes a las reglas con rango ────────────────────────────
  if p_fecha_desde is not null and p_fecha_hasta is not null then
    if p_fecha_desde > p_fecha_hasta then
      raise exception
        'La línea «%» va de la fecha % a la %: el desde no puede ser posterior '
        'al hasta.', p_label, p_fecha_desde, p_fecha_hasta;
    end if;

    -- Solo para el bloque: ahí el precio es el total, así que si la cantidad no
    -- coincide con el rango se factura de más o de menos y nadie lo nota. En
    -- `por_partido` la cantidad es una expectativa que `crear_equipo_torneo`
    -- cruza contra las jornadas reales de la serie, y puede diferir
    -- legítimamente si hay fechas suspendidas.
    if p_regla = 'bloque_adelantado'
       and p_cantidad_esperada is not null
       and p_cantidad_esperada <> (p_fecha_hasta - p_fecha_desde + 1) then
      raise exception
        'La línea «%» cubre las fechas %–% (% partidos) pero dice cubrir %. '
        'Como el precio del bloque es el total, la diferencia se factura de más '
        'o de menos sin que nadie lo note.',
        p_label, p_fecha_desde, p_fecha_hasta,
        (p_fecha_hasta - p_fecha_desde + 1), p_cantidad_esperada;
    end if;
  end if;
end;
$function$;


-- ═══ Planes ════════════════════════════════════════════════════════════════

create or replace function public.crear_plan_tarifa(
  p_torneo_id     uuid,
  p_genero        genero,
  p_concepto      concepto_pago,
  p_opcion_nombre text,
  p_opcion_orden  smallint default null
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

  if p_opcion_nombre is null or trim(p_opcion_nombre) = '' then
    raise exception 'La opción de pago necesita un nombre (por ejemplo «Pago único» o «Cuotas»)';
  end if;

  begin
    insert into plan_tarifa (torneo_id, genero, concepto, opcion_nombre, opcion_orden)
    values (p_torneo_id, p_genero, p_concepto, trim(p_opcion_nombre),
            coalesce(p_opcion_orden,
                     (select coalesce(max(opcion_orden), 0) + 1 from plan_tarifa
                       where torneo_id = p_torneo_id and genero = p_genero and concepto = p_concepto)))
    returning id into v_id;
  exception when unique_violation then
    raise exception
      'Ya existe una opción en esa posición para % / %. Cambiá el orden o editá '
      'la que existe.', p_genero, p_concepto;
  end;

  return v_id;
end;
$function$;


create or replace function public.editar_plan_tarifa(
  p_plan_id        uuid,
  p_opcion_nombre  text default null,
  p_opcion_orden   smallint default null,
  p_activo         boolean default null
)
returns void
language plpgsql
as $function$
begin
  if not exists (select 1 from plan_tarifa where id = p_plan_id) then
    raise exception 'El plan de tarifa % no existe', p_plan_id;
  end if;

  if p_opcion_nombre is not null and trim(p_opcion_nombre) = '' then
    raise exception 'La opción de pago necesita un nombre';
  end if;

  -- Desactivar no borra: un plan con fichas no se puede borrar (FK desde
  -- `equipo_torneo`) y no debería, porque es la referencia de lo que esas
  -- fichas pactaron. `activo = false` lo saca de la lista de opciones nuevas
  -- sin tocar el pasado. Por eso no hay `borrar_plan_tarifa`.
  begin
    update plan_tarifa
       set opcion_nombre = coalesce(nullif(trim(coalesce(p_opcion_nombre, '')), ''), opcion_nombre),
           opcion_orden  = coalesce(p_opcion_orden, opcion_orden),
           activo        = coalesce(p_activo, activo)
     where id = p_plan_id;
  exception when unique_violation then
    raise exception 'Ya existe otra opción en esa posición para este género y concepto.';
  end;
end;
$function$;


-- ═══ Líneas ════════════════════════════════════════════════════════════════

create or replace function public.crear_linea_tarifa(
  p_plan_id             uuid,
  p_concepto_label      text,
  p_precio_efectivo     numeric,
  p_precio_transferencia numeric,
  p_regla               regla_vencimiento,
  p_fecha_referencia    date default null,
  p_fecha_desde         smallint default null,
  p_fecha_hasta         smallint default null,
  p_cantidad_esperada   smallint default null,
  p_es_playoff          boolean default false,
  p_observacion         text default null,
  p_linea_orden         smallint default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id    uuid;
  v_label text := trim(coalesce(p_concepto_label, ''));
begin
  if not exists (select 1 from plan_tarifa where id = p_plan_id) then
    raise exception 'El plan de tarifa % no existe', p_plan_id;
  end if;

  if v_label = '' then
    raise exception 'La línea necesita un nombre (por ejemplo «Seña» o «Cuota 1»)';
  end if;

  if p_precio_efectivo is null or p_precio_efectivo < 0
     or p_precio_transferencia is null or p_precio_transferencia < 0 then
    raise exception
      'La línea «%» necesita los dos precios, efectivo y transferencia, y no '
      'pueden ser negativos.', v_label;
  end if;

  perform validar_linea_tarifa(p_regla, coalesce(p_es_playoff, false), p_fecha_referencia,
                               p_fecha_desde, p_fecha_hasta, p_cantidad_esperada, v_label);

  begin
    insert into plan_tarifa_linea (
      plan_tarifa_id, linea_orden, concepto_label,
      precio_efectivo, precio_transferencia, regla,
      fecha_referencia, fecha_desde, fecha_hasta,
      cantidad_esperada, es_playoff, observacion)
    values (
      p_plan_id,
      coalesce(p_linea_orden,
               (select coalesce(max(linea_orden), 0) + 1 from plan_tarifa_linea where plan_tarifa_id = p_plan_id)),
      v_label,
      p_precio_efectivo, p_precio_transferencia, p_regla,
      p_fecha_referencia, p_fecha_desde, p_fecha_hasta,
      p_cantidad_esperada, coalesce(p_es_playoff, false), nullif(trim(coalesce(p_observacion, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya existe una línea en esa posición dentro del plan. Cambiá el orden.';
  end;

  return v_id;
end;
$function$;


create or replace function public.editar_linea_tarifa(
  p_linea_id             uuid,
  p_concepto_label       text default null,
  p_precio_efectivo      numeric default null,
  p_precio_transferencia numeric default null,
  p_fecha_referencia     date default null,
  p_fecha_desde          smallint default null,
  p_fecha_hasta          smallint default null,
  p_cantidad_esperada    smallint default null,
  p_observacion          text default null,
  p_linea_orden          smallint default null
)
returns void
language plpgsql
as $function$
declare
  v_l      record;
  v_label  text;
  v_ref    date;
  v_desde  smallint;
  v_hasta  smallint;
  v_cant   smallint;
begin
  select * into v_l from plan_tarifa_linea where id = p_linea_id;

  if not found then
    raise exception 'La línea de tarifa % no existe', p_linea_id;
  end if;

  -- ── La regla NO se edita ────────────────────────────────────────────────
  --
  -- Cambiar la regla cambia qué campos son obligatorios y cuáles sobran: pasar
  -- de `fecha_fija` a `bloque_adelantado` obliga a completar tres campos y a
  -- vaciar otro, en una sola operación que puede quedar a mitad de camino.
  --
  -- Para cambiarla se borra la línea y se crea de nuevo. Es una operación más,
  -- pero deja el estado siempre coherente y hace explícito que se está
  -- reemplazando la línea, no ajustándola.
  v_label := coalesce(nullif(trim(coalesce(p_concepto_label, '')), ''), v_l.concepto_label);
  v_ref   := coalesce(p_fecha_referencia,   v_l.fecha_referencia);
  v_desde := coalesce(p_fecha_desde,        v_l.fecha_desde);
  v_hasta := coalesce(p_fecha_hasta,        v_l.fecha_hasta);
  v_cant  := coalesce(p_cantidad_esperada,  v_l.cantidad_esperada);

  if (p_precio_efectivo is not null and p_precio_efectivo < 0)
     or (p_precio_transferencia is not null and p_precio_transferencia < 0) then
    raise exception 'Los precios no pueden ser negativos.';
  end if;

  -- La matriz se revalida con los valores RESULTANTES, no con los recibidos:
  -- una edición parcial puede romper la coherencia aunque cada campo suelto
  -- parezca válido.
  perform validar_linea_tarifa(v_l.regla, v_l.es_playoff, v_ref, v_desde, v_hasta, v_cant, v_label);

  begin
    update plan_tarifa_linea
       set concepto_label       = v_label,
           precio_efectivo      = coalesce(p_precio_efectivo, precio_efectivo),
           precio_transferencia = coalesce(p_precio_transferencia, precio_transferencia),
           fecha_referencia     = v_ref,
           fecha_desde          = v_desde,
           fecha_hasta          = v_hasta,
           cantidad_esperada    = v_cant,
           observacion          = coalesce(nullif(trim(coalesce(p_observacion, '')), ''), observacion),
           linea_orden          = coalesce(p_linea_orden, linea_orden)
     where id = p_linea_id;
  exception when unique_violation then
    raise exception 'Ya existe una línea en esa posición dentro del plan.';
  end;
end;
$function$;


create or replace function public.borrar_linea_tarifa(
  p_linea_id uuid
)
returns void
language plpgsql
as $function$
declare
  v_label text;
begin
  select concepto_label into v_label from plan_tarifa_linea where id = p_linea_id;

  if not found then
    raise exception 'La línea de tarifa % no existe', p_linea_id;
  end if;

  -- Sin guarda, y a propósito: `cuota` no referencia la línea —las cuotas se
  -- materializan con su monto al crear la ficha— así que borrarla no deja nada
  -- huérfano ni cambia lo ya emitido. Solo deja de aparecer en las fichas
  -- nuevas. El aviso de que eso es así lo da la pantalla, con el conteo de
  -- `v_plan_tarifa_uso`; ponerlo también acá sería bloquear algo que no hace
  -- daño.
  delete from plan_tarifa_linea where id = p_linea_id;
end;
$function$;


comment on function validar_linea_tarifa(regla_vencimiento, boolean, date, smallint, smallint, smallint, text) is
  'La matriz regla↔campos del tarifario, calcada de lo que crear_equipo_torneo exige al armar una ficha. Cuatro formas: fecha_fija, por_partido playoff, por_partido regular y bloque_adelantado. Rechaza también el campo que SOBRA, no solo el que falta.';
comment on function crear_plan_tarifa(uuid, genero, concepto_pago, text, smallint) is
  'Alta de opción de pago para un género y concepto. El orden se autonumera.';
comment on function editar_plan_tarifa(uuid, text, smallint, boolean) is
  'Edición del plan, incluido activo=false para desactivarlo. No hay borrar_plan: un plan con fichas no se puede borrar por FK, y no debería — es la referencia de lo que esas fichas pactaron.';
comment on function crear_linea_tarifa(uuid, text, numeric, numeric, regla_vencimiento, date, smallint, smallint, smallint, boolean, text, smallint) is
  'Alta de línea. La regla se elige acá y no se cambia después: para cambiarla se borra la línea y se crea de nuevo.';
comment on function editar_linea_tarifa(uuid, text, numeric, numeric, date, smallint, smallint, smallint, text, smallint) is
  'Edición parcial de precios, fechas y cantidad. NO toca la regla. Revalida la matriz con los valores resultantes, no con los recibidos: una edición parcial puede romper la coherencia aunque cada campo suelto parezca válido.';
comment on function borrar_linea_tarifa(uuid) is
  'Baja de línea. No bloquea: las cuotas ya emitidas conservan su monto porque se materializan al crear la ficha.';


-- ═══ La vista del aviso ════════════════════════════════════════════════════

create or replace view v_plan_tarifa_uso as
select
  p.id                as plan_id,
  p.torneo_id,
  p.genero::text      as genero,
  p.concepto::text    as concepto,
  p.opcion_orden,
  p.opcion_nombre,
  p.activo,
  (select count(*) from plan_tarifa_linea l where l.plan_tarifa_id = p.id) as lineas,
  (select count(*) from equipo_torneo e
    where e.plan_inscripcion_id = p.id or e.plan_partidos_id = p.id)       as fichas,
  (select count(*) from cuota q
     join equipo_torneo e on e.id = q.equipo_torneo_id
    where e.plan_inscripcion_id = p.id or e.plan_partidos_id = p.id)       as cuotas_emitidas,
  (select coalesce(sum(q.monto), 0) from cuota q
     join equipo_torneo e on e.id = q.equipo_torneo_id
    where e.plan_inscripcion_id = p.id or e.plan_partidos_id = p.id)       as monto_emitido
from plan_tarifa p;

comment on view v_plan_tarifa_uso is
  'Cuántas fichas y cuotas ya se emitieron con cada plan. La pantalla lo necesita ANTES de guardar, para avisar que editar el plan no cambia lo ya emitido — por eso es vista y no un dato que devuelva la función de edición.';


-- ═══ RLS ═══════════════════════════════════════════════════════════════════
--
-- Tercer caso `activo`, y otra vez anticipado: las dos están encendidas desde
-- la Fase 1/2 con policy de solo SELECT, porque en ese momento nadie las
-- escribía. `plan_tarifa_linea` necesita **DELETE** además de INSERT/UPDATE:
-- sacar una cuota del cronograma es parte de editar un tarifario, y sin la
-- policy el borrado mediría 0 filas sin decir nada.
--
-- No se activa RLS en ninguna tabla nueva: **sigue en 38/51**.

create policy plan_tarifa_insert_autenticado
  on plan_tarifa for insert to authenticated with check (true);
create policy plan_tarifa_update_autenticado
  on plan_tarifa for update to authenticated using (true) with check (true);

create policy plan_tarifa_linea_insert_autenticado
  on plan_tarifa_linea for insert to authenticated with check (true);
create policy plan_tarifa_linea_update_autenticado
  on plan_tarifa_linea for update to authenticated using (true) with check (true);
create policy plan_tarifa_linea_delete_autenticado
  on plan_tarifa_linea for delete to authenticated using (true);
