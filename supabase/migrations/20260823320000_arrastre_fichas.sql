-- ═══════════════════════════════════════════════════════════════════════════
-- Arrastre de fichas · paso 4 del módulo de estructura
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El paso que vuelve usable a los tres anteriores. Sin esto, armar el torneo
-- siguiente es inscribir ~304 equipos de a uno, eligiéndole a cada uno serie,
-- plan de inscripción, plan de partidos y medio — una asignación que en el 90%
-- de los casos es idéntica a la del torneo anterior.
--
-- El torneo nuevo es continuidad: los mismos clubes, las mismas categorías, y
-- 4–6 equipos por categoría que ascienden o descienden. Lo que se recrea no es
-- el equipo —ese es un `tercero` que persiste— sino su **inscripción**, porque
-- `equipo_torneo.serie_id` apunta a una `serie` que cuelga de una `categoria`
-- que cuelga del torneo. La serie «Libre A» del Clausura y la del Apertura son
-- dos filas distintas, y `trg_ficha_coherente` exige que la ficha use la de su
-- propio torneo.
--
-- ── Usa `crear_equipo_torneo`, no inserta a mano ───────────────────────────
--
-- Es la puerta (regla 10 y el catálogo de `arquitectura.md`): valida la
-- coherencia de la ficha, cruza el calendario de la serie, y **materializa las
-- cuotas con el tarifario del torneo destino**. Insertar directo en
-- `equipo_torneo` crearía fichas sin cuotas, y salteando la validación de
-- calendario dejaría cuotas `por_partido` sin jornada a la cual vencer.
--
-- ── Saltea con detalle, no aborta ──────────────────────────────────────────
--
-- Si un equipo estaba en una serie que no se clonó, abortar el arrastre en la
-- ficha 200 de 300 dejaría el trabajo a medias y sin decir cuál falló. Se
-- saltea, se sigue, y se devuelve el equipo y el motivo.

create or replace function public.arrastrar_fichas(
  p_origen_id       uuid,
  p_destino_id      uuid,
  p_responsable_id  uuid default null,
  p_simular         boolean default false
)
returns jsonb
language plpgsql
as $function$
declare
  v_f              record;
  v_serie_destino  uuid;
  v_pi             uuid;
  v_pp             uuid;
  v_creadas        int := 0;
  v_ya             int := 0;
  v_sin_serie      int := 0;
  v_sin_plan       int := 0;
  v_salteadas      jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from torneo where id = p_origen_id) then
    raise exception 'El torneo origen % no existe', p_origen_id;
  end if;

  if not exists (select 1 from torneo where id = p_destino_id) then
    raise exception 'El torneo destino % no existe', p_destino_id;
  end if;

  if p_origen_id = p_destino_id then
    raise exception
      'El origen y el destino son el mismo torneo. Elegí de qué torneo traer '
      'las fichas.';
  end if;

  if not exists (select 1 from equipo_torneo where torneo_id = p_origen_id) then
    raise exception
      'El torneo origen no tiene fichas: no hay nada que arrastrar.';
  end if;

  -- ── Las precondiciones del destino, con mensaje propio ─────────────────
  --
  -- Las tres frenan antes de escribir nada. Sin ellas el error saldría de
  -- adentro de `crear_equipo_torneo` en la primera ficha, hablando de una
  -- serie o un plan que el operador no eligió — nombrando el síntoma y no la
  -- causa.
  if not exists (
    select 1 from serie s join categoria c on c.id = s.categoria_id
     where c.torneo_id = p_destino_id
  ) then
    raise exception
      'El torneo destino no tiene series. Cloná la estructura del torneo '
      'anterior antes de arrastrar las fichas.';
  end if;

  if not exists (select 1 from plan_tarifa where torneo_id = p_destino_id and activo) then
    raise exception
      'El torneo destino no tiene tarifario cargado. Cargalo antes de '
      'arrastrar: cada ficha genera sus cuotas con los precios del torneo '
      'nuevo, no con los del anterior.';
  end if;

  -- El calendario. El chequeo fino —que cada serie tenga las jornadas del
  -- rango, con fecha y en la cantidad esperada— lo hace `crear_equipo_torneo`
  -- ficha por ficha. Acá va el grueso: si el tarifario cobra por partido y el
  -- torneo no tiene NINGUNA jornada, no hace falta entrar al loop para saber
  -- que va a fallar entero.
  if exists (
    select 1 from plan_tarifa_linea l
      join plan_tarifa p on p.id = l.plan_tarifa_id
     where p.torneo_id = p_destino_id and p.activo
       and l.regla = 'por_partido' and not l.es_playoff
  ) and not exists (
    select 1 from jornada j
      join serie s on s.id = j.serie_id
      join categoria c on c.id = s.categoria_id
     where c.torneo_id = p_destino_id
  ) then
    raise exception
      'El torneo destino no tiene calendario. Su tarifario cobra por partido, '
      'así que cada cuota vence con su jornada: sembrá las fechas antes de '
      'arrastrar las fichas.';
  end if;

  for v_f in
    select e.tercero_id, e.medio_previsto,
           t.nombre       as equipo,
           cs.nombre      as cat_nombre,
           ss.nombre      as serie_nombre,
           pi.genero      as pi_gen, pi.concepto as pi_con, pi.opcion_orden as pi_ord,
           pp.genero      as pp_gen, pp.concepto as pp_con, pp.opcion_orden as pp_ord
      from equipo_torneo e
      join tercero t   on t.id  = e.tercero_id
      join serie ss    on ss.id = e.serie_id
      join categoria cs on cs.id = ss.categoria_id
      join plan_tarifa pi on pi.id = e.plan_inscripcion_id
      join plan_tarifa pp on pp.id = e.plan_partidos_id
     where e.torneo_id = p_origen_id
     order by cs.orden nulls last, ss.orden nulls last, t.nombre
  loop
    -- Ya inscripto: se saltea antes de llegar al unique. La red existe
    -- —`UNIQUE (tercero_id, torneo_id)`— pero llegar hasta ella abortaría el
    -- arrastre entero en la primera ficha repetida.
    if exists (
      select 1 from equipo_torneo
       where tercero_id = v_f.tercero_id and torneo_id = p_destino_id
    ) then
      v_ya := v_ya + 1;
      continue;
    end if;

    -- El emparejamiento de serie es por NOMBRE de categoría + nombre de serie.
    -- Los nombres se mantienen entre torneos; el clonado del paso 2 los copia
    -- tal cual, que es lo que hace posible este emparejamiento.
    select ss.id into v_serie_destino
      from serie ss
      join categoria cc on cc.id = ss.categoria_id
     where cc.torneo_id = p_destino_id
       and cc.nombre = v_f.cat_nombre
       and ss.nombre = v_f.serie_nombre;

    if not found then
      v_sin_serie := v_sin_serie + 1;
      v_salteadas := v_salteadas || jsonb_build_object(
        'equipo', v_f.equipo,
        'motivo', 'la serie «' || v_f.cat_nombre || ' ' || v_f.serie_nombre ||
                  '» no existe en el torneo destino');
      continue;
    end if;

    -- El plan, por (género, concepto, posición de la opción). El nombre de la
    -- opción puede cambiar de un torneo a otro —«Cuotas» pasar a «En 3 pagos»—
    -- pero su posición es lo que la identifica: es la misma opción.
    select id into v_pi from plan_tarifa
     where torneo_id = p_destino_id and genero = v_f.pi_gen
       and concepto = v_f.pi_con and opcion_orden = v_f.pi_ord and activo;

    if not found then
      v_sin_plan := v_sin_plan + 1;
      v_salteadas := v_salteadas || jsonb_build_object(
        'equipo', v_f.equipo,
        'motivo', 'el torneo destino no tiene la opción de inscripción equivalente');
      continue;
    end if;

    select id into v_pp from plan_tarifa
     where torneo_id = p_destino_id and genero = v_f.pp_gen
       and concepto = v_f.pp_con and opcion_orden = v_f.pp_ord and activo;

    if not found then
      v_sin_plan := v_sin_plan + 1;
      v_salteadas := v_salteadas || jsonb_build_object(
        'equipo', v_f.equipo,
        'motivo', 'el torneo destino no tiene la opción de partidos equivalente');
      continue;
    end if;

    -- ── El preview no escribe ────────────────────────────────────────────
    --
    -- `p_simular` corre exactamente el mismo emparejamiento y cuenta lo mismo,
    -- pero no llama a la puerta. Es la única forma de que el número que la
    -- pantalla promete —«se van a crear 298 fichas»— sea el que después ocurre:
    -- calcularlo con otra consulta sería calcularlo con otra lógica.
    if not p_simular then
      perform crear_equipo_torneo(
        v_f.tercero_id, v_serie_destino, v_pi, v_pp, v_f.medio_previsto, p_responsable_id);
    end if;

    v_creadas := v_creadas + 1;
  end loop;

  return jsonb_build_object(
    'simulacion',            p_simular,
    'fichas_creadas',        v_creadas,
    'ya_existian',           v_ya,
    'sin_serie_equivalente', v_sin_serie,
    'sin_plan_equivalente',  v_sin_plan,
    'salteadas',             v_salteadas
  );
end;
$function$;

comment on function arrastrar_fichas(uuid, uuid, uuid, boolean) is
  'Recrea las fichas de un torneo en otro: mismo tercero, la serie equivalente por nombre y el plan equivalente por (género, concepto, posición). Usa crear_equipo_torneo —la puerta— así que las cuotas se generan con el tarifario del DESTINO. Saltea con detalle en vez de abortar, y es idempotente: los que ya tienen ficha se cuentan aparte. Con p_simular = true corre el mismo emparejamiento sin escribir, para el preview.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Mover una ficha de serie · el ascenso y el descenso
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Es el 10% que el arrastre deja para editar: 4–6 equipos por categoría que
-- cambian de serie entre torneos.
--
-- **No regenera cuotas, y es correcto**: el precio depende de género, opción y
-- medio de pago, no de la serie. Y el género es invariante — un equipo no pasa
-- de masculino a femenino. Un ascenso de «Libre B» a «Libre A» no cambia un
-- peso de lo que el equipo debe.

create or replace function public.mover_ficha_de_serie(
  p_ficha_id       uuid,
  p_nueva_serie_id uuid
)
returns void
language plpgsql
as $function$
declare
  v_ficha        record;
  v_serie        record;
  v_genero_act   genero;
  v_con_jornada  int;
begin
  select e.id, e.torneo_id, e.serie_id, t.nombre as equipo
    into v_ficha
    from equipo_torneo e
    join tercero t on t.id = e.tercero_id
   where e.id = p_ficha_id;

  if not found then
    raise exception 'La ficha % no existe', p_ficha_id;
  end if;

  if v_ficha.serie_id = p_nueva_serie_id then
    raise exception 'La ficha ya está en esa serie.';
  end if;

  select ss.id, ss.nombre, cc.nombre as categoria, cc.genero, cc.torneo_id
    into v_serie
    from serie ss
    join categoria cc on cc.id = ss.categoria_id
   where ss.id = p_nueva_serie_id;

  if not found then
    raise exception 'La serie % no existe', p_nueva_serie_id;
  end if;

  if v_serie.torneo_id <> v_ficha.torneo_id then
    raise exception
      'La serie «% %» es de otro torneo. Una ficha solo se mueve entre series '
      'de su propio torneo.', v_serie.categoria, v_serie.nombre;
  end if;

  -- ── El género tiene que coincidir ──────────────────────────────────────
  --
  -- Los planes de la ficha son de un género, y `trg_ficha_coherente` valida
  -- que coincida con el de la categoría. Mover a una categoría del otro género
  -- dejaría la ficha con planes del género equivocado — y el trigger lo
  -- rechazaría, pero con un mensaje sobre planes cuando lo que se hizo fue
  -- mover de serie.
  select cc.genero into v_genero_act
    from serie ss join categoria cc on cc.id = ss.categoria_id
   where ss.id = v_ficha.serie_id;

  if v_serie.genero <> v_genero_act then
    raise exception
      'No se puede mover a «% %»: es de género % y la ficha es de %. Los planes '
      'de tarifa de la ficha son del género actual.',
      v_serie.categoria, v_serie.nombre, v_serie.genero, v_genero_act;
  end if;

  -- ── Y se bloquea si hay cuotas atadas a jornadas ───────────────────────
  --
  -- Las cuotas `por_partido` se materializan **contra la jornada concreta** de
  -- la serie: `cuota.jornada_id` apunta a una fecha de la serie vieja. Mover la
  -- ficha dejaría esas cuotas venciendo con el calendario de una serie donde el
  -- equipo ya no juega — y nada lo avisaría, porque la FK sigue siendo válida.
  --
  -- Es el mismo modo de falla que veníamos persiguiendo con RLS: correcto para
  -- la base, incoherente para el negocio, y silencioso. Por eso se frena acá,
  -- con el número de cuotas en el mensaje.
  select count(*) into v_con_jornada
    from cuota where equipo_torneo_id = p_ficha_id and jornada_id is not null;

  if v_con_jornada > 0 then
    raise exception
      'No se puede mover a «%»: la ficha tiene % cuota(s) atadas a fechas de su '
      'serie actual. Moverla las dejaría venciendo con el calendario de una '
      'serie donde el equipo ya no juega. Anulá esas cuotas o movelo antes de '
      'generar el calendario.',
      v_ficha.equipo, v_con_jornada;
  end if;

  update equipo_torneo set serie_id = p_nueva_serie_id where id = p_ficha_id;
end;
$function$;

comment on function mover_ficha_de_serie(uuid, uuid) is
  'El ascenso y el descenso: cambia la serie de una ficha. NO regenera cuotas — el precio depende de género, opción y medio, no de la serie, y el género es invariante. Valida que la serie sea del mismo torneo y del mismo género, y BLOQUEA si la ficha tiene cuotas con jornada_id: esas cuotas vencen contra fechas de la serie vieja y moverlas las dejaría apuntando a un calendario donde el equipo ya no juega.';


-- ═══════════════════════════════════════════════════════════════════════════
-- FIX · `borrar_linea_tarifa` necesitaba guarda
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La versión del paso 3 (`20260823310000`) se escribió sobre una afirmación
-- falsa: que `cuota` no referenciaba la línea de tarifa. La referencia existe
-- —`cuota.plan_tarifa_linea_id → plan_tarifa_linea`, con `ON DELETE NO
-- ACTION`— y **las 297 cuotas de la base la tienen seteada**.
--
-- O sea que borrar una línea que ya emitió cuotas no era un no-op inofensivo:
-- fallaba con
--
--     update or delete on table "plan_tarifa_linea" violates foreign key
--     constraint "cuota_plan_tarifa_linea_id_fkey" on table "cuota"
--
-- exactamente el 23503 crudo que en `borrar_categoria` y `borrar_serie` nos
-- tomamos el trabajo de traducir.

create or replace function public.borrar_linea_tarifa(
  p_linea_id uuid
)
returns void
language plpgsql
as $function$
declare
  v_label  text;
  v_cuotas int;
begin
  select concepto_label into v_label from plan_tarifa_linea where id = p_linea_id;

  if not found then
    raise exception 'La línea de tarifa % no existe', p_linea_id;
  end if;

  select count(*) into v_cuotas from cuota where plan_tarifa_linea_id = p_linea_id;

  if v_cuotas > 0 then
    raise exception
      'No se puede borrar la línea «%»: ya generó % cuota(s) en fichas '
      'existentes. Las cuotas emitidas la referencian. Si la línea no va más, '
      'desactivá la opción de pago entera.',
      v_label, v_cuotas;
  end if;

  delete from plan_tarifa_linea where id = p_linea_id;
end;
$function$;

comment on function borrar_linea_tarifa(uuid) is
  'Baja de línea de tarifa. RECHAZA si la línea ya generó cuotas: cuota.plan_tarifa_linea_id la referencia con ON DELETE NO ACTION, así que el borrado fallaría igual — pero con el 23503 crudo en vez de una explicación.';


-- ═══ RLS ═══════════════════════════════════════════════════════════════════
--
-- **Nada nuevo.** El arrastre escribe `equipo_torneo` (INSERT) y `cuota`
-- (INSERT) a través de `crear_equipo_torneo`, más el trigger `sync_total_plan`
-- que actualiza `equipo_torneo`. `mover_ficha_de_serie` es un UPDATE de
-- `equipo_torneo`.
--
-- Las tres operaciones ya están cubiertas por las policies del núcleo escritas
-- en `20260823260000_rls_fase5_nucleo` —`equipo_torneo` I/S/U y `cuota` I/S/U—
-- que siguen **sin aplicar**, esperando la revisión de Horacio. Verificado:
-- este paso no introduce ninguna clase de escritura que la Fase 5 no contemple.
--
-- Hoy esas tablas tienen RLS apagado, así que el arrastre corre libre. **RLS
-- sigue en 38/51.**
