-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DATOS DE PRUEBA — NO ES PRODUCCIÓN                                      ║
-- ║                                                                          ║
-- ║  Puebla el sistema para poder MIRAR las pantallas con datos realistas    ║
-- ║  durante la fase de diseño. No representa nada real: los equipos salen   ║
-- ║  del padrón de verdad, pero sus fichas, cobros y gastos son inventados.  ║
-- ║                                                                          ║
-- ║  Se borra entero con 99_datos_prueba_limpieza.sql, que deja la base      ║
-- ║  como estaba. Correr los dos cuantas veces haga falta.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── Cómo se marca lo que es de prueba ───────────────────────────────────────
--
-- `equipo_torneo` no tiene ningún campo de texto libre donde poner un prefijo:
-- una ficha es un tercero + una serie + dos planes, nada más. Así que el
-- marcador es una tabla aparte, `_prueba_marca`, donde el seed anota el id de
-- todo lo que crea. La limpieza borra exactamente eso y después tira la tabla.
--
-- Es más preciso que cualquier prefijo: no depende de que nadie renombre nada,
-- y no puede borrar de más. Los gastos llevan además `ZZ_TEST_` en el concepto
-- libre, que es texto y sí admite prefijo, para que se reconozcan a simple
-- vista en la pantalla de gastos.
--
-- ── Idempotente ────────────────────────────────────────────────────────────
--
-- Si `_prueba_marca` tiene filas, el seed avisa y no hace nada. Correrlo dos
-- veces no duplica.

create table if not exists public._prueba_marca (
  tipo text not null,
  id   uuid not null
);

comment on table public._prueba_marca is
  'NO-PRODUCCIÓN. Marcador de los datos creados por 99_datos_prueba.sql. '
  'La limpieza borra lo que figura acá y después tira esta tabla.';


do $$
declare
  v_user     uuid;
  v_torneo   uuid;
  v_tirolesa uuid;
  v_aero     uuid;

  v_terceros uuid[];
  v_fechas   date[] := array['2026-07-12','2026-07-19','2026-07-26',
                             '2026-08-02','2026-08-06']::date[];

  v_slot     record;
  v_serie    uuid;
  v_genero   text;
  v_pi       uuid;   -- plan de inscripción
  v_pp       uuid;   -- plan de partidos
  v_ficha    uuid;
  v_tercero  uuid;
  v_predio   uuid;
  v_fecha    date;

  v_imput    jsonb;
  v_monto    numeric(16,2);
  v_pago     uuid;

  v_gasto    record;
  v_gasto_id uuid;
  v_jornada  uuid;
  v_cuenta   text;
  v_asiento  uuid;

  v_fichas   int := 0;
  v_pagos    int := 0;
  v_gastos   int := 0;
begin
  -- ── Guardas ──────────────────────────────────────────────────────────────
  if exists (select 1 from public._prueba_marca) then
    raise notice 'El set de prueba ya está sembrado. Corré 99_datos_prueba_limpieza.sql primero.';
    return;
  end if;

  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise exception 'No hay ningún usuario en auth.users: los cobros necesitan responsable.';
  end if;

  select id into v_torneo from torneo where activo order by nombre limit 1;
  if v_torneo is null then
    raise exception 'No hay torneo activo.';
  end if;

  select id into v_tirolesa from predio where nombre = 'Tirolesa';
  select id into v_aero     from predio where nombre = 'Aeropuerto';
  if v_tirolesa is null or v_aero is null then
    raise exception 'Faltan los predios Tirolesa y/o Aeropuerto.';
  end if;

  -- Los 28 primeros equipos del padrón por nombre. Determinista: la limpieza
  -- no depende de esto (usa el marcador), pero re-sembrar da el mismo set.
  select array_agg(id order by nombre)
    into v_terceros
    from (select id, nombre from tercero where tipo = 'equipo' order by nombre limit 28) t;

  if coalesce(array_length(v_terceros, 1), 0) < 28 then
    raise exception 'El padrón tiene menos de 28 equipos.';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1 · Las 28 fichas y sus cobros
  -- ══════════════════════════════════════════════════════════════════════════
  --
  -- `modo` elige las dos opciones del tarifario a la vez, que es como se
  -- comporta un equipo real: o paga a medida que juega (Pago único + Pago por
  -- fecha, 13 cuotas) o va en cuotas (Cuotas + Cuotas, 6 cuotas).
  --
  -- `grupo` decide qué se cobra:
  --   al_dia      todo lo vencido, completo
  --   mora        nada
  --   parcial     el 60% de la primera cuota — queda debiendo lo vencido
  --   adelantado  todo lo vencido + la primera cuota futura
  --
  -- La Seña vence el 2026-07-10, o sea que YA está vencida para todas las
  -- fichas. Por eso el estado de mora no depende de la serie: depende de si se
  -- pagó o no. Las 8 series con jornada pasada (01/02-08) le suman una segunda
  -- cuota vencida a las fichas "por fecha".
  for v_slot in
    select * from (values
      -- ── masculinos en series CON jornada pasada (12) ──
      ( 1, 'Libre', 'A', 'por_fecha', 'transferencia', 'al_dia'),
      ( 2, 'Libre', 'A', 'cuotas',    'efectivo',      'mora'),
      ( 3, 'Libre', 'B', 'por_fecha', 'transferencia', 'al_dia'),
      ( 4, 'Libre', 'B', 'cuotas',    'transferencia', 'parcial'),
      ( 5, 'Libre', 'C', 'por_fecha', 'efectivo',      'mora'),
      ( 6, 'Libre', 'C', 'cuotas',    'transferencia', 'al_dia'),
      ( 7, '+30',   'B', 'por_fecha', 'transferencia', 'parcial'),
      ( 8, '+30',   'B', 'cuotas',    'efectivo',      'adelantado'),
      ( 9, '+30',   'C', 'por_fecha', 'transferencia', 'mora'),
      (10, '+35',   'A', 'por_fecha', 'efectivo',      'al_dia'),
      (11, '+35',   'B', 'cuotas',    'transferencia', 'parcial'),
      (12, '+40',   'A', 'por_fecha', 'transferencia', 'al_dia'),
      -- ── masculinos en series SIN jornada pasada (6) ──
      (13, 'Libre', 'D', 'por_fecha', 'transferencia', 'mora'),
      (14, 'Libre', 'D', 'cuotas',    'efectivo',      'al_dia'),
      (15, 'Libre', 'E', 'por_fecha', 'efectivo',      'parcial'),
      (16, 'Libre', 'E', 'cuotas',    'transferencia', 'adelantado'),
      (17, 'Libre', 'F', 'por_fecha', 'transferencia', 'al_dia'),
      (18, '+30',   'A', 'cuotas',    'transferencia', 'mora'),
      -- ── femeninos (10) ──
      (19, 'Femenino', 'A', 'por_fecha', 'transferencia', 'al_dia'),
      (20, 'Femenino', 'A', 'cuotas',    'efectivo',      'mora'),
      (21, 'Femenino', 'B', 'por_fecha', 'transferencia', 'parcial'),
      (22, 'Femenino', 'B', 'cuotas',    'transferencia', 'al_dia'),
      (23, 'Femenino', 'C', 'por_fecha', 'efectivo',      'adelantado'),
      (24, 'Femenino', 'D', 'cuotas',    'transferencia', 'mora'),
      (25, 'Femenino', 'E', 'por_fecha', 'transferencia', 'al_dia'),
      (26, 'Femenino', 'F', 'cuotas',    'efectivo',      'parcial'),
      (27, 'Femenino', 'G', 'por_fecha', 'transferencia', 'mora'),
      (28, 'Flex',     'A', 'cuotas',    'transferencia', 'adelantado')
    ) as s(orden, categoria, serie, modo, medio, grupo)
    order by 1
  loop
    -- Serie y género, de la estructura real
    select s.id, c.genero::text
      into v_serie, v_genero
      from serie s
      join categoria c on c.id = s.categoria_id
     where c.nombre = v_slot.categoria
       and s.nombre = v_slot.serie
       and c.torneo_id = v_torneo;

    if v_serie is null then
      raise exception 'No existe la serie % % en el torneo activo', v_slot.categoria, v_slot.serie;
    end if;

    -- Planes reales del tarifario: opción 1 = Pago único / Pago por fecha,
    -- opción 2 = Cuotas, en los dos conceptos.
    select id into v_pi
      from plan_tarifa
     where torneo_id = v_torneo and activo
       and genero::text = v_genero
       and concepto::text = 'inscripcion'
       and opcion_orden = case v_slot.modo when 'por_fecha' then 1 else 2 end;

    select id into v_pp
      from plan_tarifa
     where torneo_id = v_torneo and activo
       and genero::text = v_genero
       and concepto::text = 'partidos'
       and opcion_orden = case v_slot.modo when 'por_fecha' then 1 else 2 end;

    if v_pi is null or v_pp is null then
      raise exception 'Faltan planes % para género %', v_slot.modo, v_genero;
    end if;

    v_tercero := v_terceros[v_slot.orden];

    v_ficha := crear_equipo_torneo(
      v_tercero, v_serie, v_pi, v_pp,
      v_slot.medio::medio_pago, v_user);

    insert into public._prueba_marca values ('equipo_torneo', v_ficha);
    v_fichas := v_fichas + 1;

    -- ── El cobro ──────────────────────────────────────────────────────────
    if v_slot.grupo = 'mora' then
      continue;   -- no paga nada
    end if;

    if v_slot.grupo = 'parcial' then
      -- 60% de la primera cuota: queda debiendo parte de lo vencido, así que
      -- sigue en mora aunque su serie no tenga jornadas jugadas.
      select jsonb_build_array(jsonb_build_object(
               'cuota_id', c.id,
               'monto', round(c.monto * 0.6, 2))),
             round(c.monto * 0.6, 2)
        into v_imput, v_monto
        from cuota c
       where c.equipo_torneo_id = v_ficha
       order by c.vence_at, c.numero
       limit 1;
    else
      -- al_dia: todo lo vencido. adelantado: lo vencido + la primera futura.
      with elegidas as (
        select c.id, c.monto
          from cuota c
         where c.equipo_torneo_id = v_ficha
           and (c.vence_at < current_date
                or (v_slot.grupo = 'adelantado'
                    and c.id = (select c2.id from cuota c2
                                 where c2.equipo_torneo_id = v_ficha
                                   and c2.vence_at >= current_date
                                 order by c2.vence_at, c2.numero
                                 limit 1)))
      )
      select jsonb_agg(jsonb_build_object('cuota_id', id, 'monto', monto)),
             sum(monto)
        into v_imput, v_monto
        from elegidas;
    end if;

    if v_imput is null or coalesce(v_monto, 0) <= 0 then
      continue;
    end if;

    v_predio := case when v_slot.medio = 'efectivo'
                     then case when v_slot.orden % 2 = 0 then v_tirolesa else v_aero end
                     else null end;

    -- Los cobros se reparten en cinco fechas para que la curva de caja de
    -- /proyeccion y del dashboard tenga forma y no una línea plana.
    v_fecha := v_fechas[1 + (v_slot.orden % 5)];

    v_pago := registrar_cobro(
      v_tercero, v_monto, v_slot.medio, v_fecha, v_imput, v_predio, v_user);

    insert into public._prueba_marca values ('pago', v_pago);
    insert into public._prueba_marca
      select 'asiento', asiento_id from pago where id = v_pago and asiento_id is not null;

    v_pagos := v_pagos + 1;
  end loop;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2 · Gastos mínimos
  -- ══════════════════════════════════════════════════════════════════════════
  --
  -- PROVISORIO Y A MANO. No existe todavía la puerta `crear_gasto` —es el
  -- pendiente G1/G3—, así que acá se inserta en `gasto` y se llaman los dos
  -- asientos a mano. La puerta del diario SÍ se respeta: los asientos salen de
  -- `crear_asiento` y no de un insert directo (regla 8). Cuando exista
  -- `crear_gasto`, esta sección se reemplaza por llamadas a esa función.
  --
  -- Son pocos y con una intención: que el Resultado se despegue de la caja.
  -- Tres se devengan Y se pagan (tocan resultado y caja) y tres se devengan
  -- sin pagar (tocan el resultado, no la caja). Esa diferencia es la que el
  -- modelo cuida y la que el dashboard tiene que dejar ver.
  -- El catálogo tiene nombres repetidos —`Extras` existe como por_fecha/bar y
  -- como eventual/torneo, y `Limpieza` también está dos veces—, así que la
  -- categoría se identifica por la terna (nombre, naturaleza, área) y no por el
  -- nombre solo. Con el nombre solo, este bloque insertaba el gasto dos veces.
  for v_gasto in
    select * from (values
      ('Arbitros Masculino','por_fecha','torneo','Libre', 'A', 4800000::numeric, date '2026-08-01', date '2026-08-03', 'efectivo'),
      ('Coordinación',      'por_fecha','torneo','Libre', 'B', 1500000::numeric, date '2026-08-02', date '2026-08-04', 'transferencia'),
      ('Operativos',        'por_fecha','torneo','Libre', 'C', 2400000::numeric, date '2026-08-01', null::date,        null),
      ('Medicinal',         'por_fecha','torneo','+35',   'A', 1100000::numeric, date '2026-08-01', null::date,        null),
      ('Tribunal',          'por_fecha','torneo','+40',   'A',  800000::numeric, date '2026-08-01', null::date,        null),
      ('Extras',            'eventual', 'torneo', null,   null, 2200000::numeric, date '2026-07-20', date '2026-07-25', 'transferencia')
    ) as g(categoria, naturaleza, area, cat_serie, serie, monto, devengado, pagado, medio)
  loop
    -- Un gasto `por_fecha` necesita jornada (trg_gasto_coherente); `Extras` es
    -- `eventual` y se ancla al torneo.
    v_jornada := null;
    if v_gasto.cat_serie is not null then
      select j.id into v_jornada
        from jornada j
        join serie s    on s.id = j.serie_id
        join categoria c on c.id = s.categoria_id
       where c.nombre = v_gasto.cat_serie and s.nombre = v_gasto.serie
         and c.torneo_id = v_torneo
         and j.fecha < current_date and not j.es_playoff
       order by j.fecha
       limit 1;

      if v_jornada is null then
        raise exception 'No hay jornada pasada en % % para anclar el gasto %',
          v_gasto.cat_serie, v_gasto.serie, v_gasto.categoria;
      end if;
    end if;

    select c.codigo into v_cuenta
      from cat_gasto cg join cuenta c on c.id = cg.cuenta_id
     where cg.nombre = v_gasto.categoria
       and cg.naturaleza = v_gasto.naturaleza
       and cg.area = v_gasto.area;

    insert into gasto (cat_gasto_id, concepto_libre, torneo_id, jornada_id,
                       arancel, cantidad, devengado_at, pagado_at, medio_pago)
    select cg.id, 'ZZ_TEST_' || v_gasto.categoria, v_torneo, v_jornada,
           v_gasto.monto, 1, v_gasto.devengado, v_gasto.pagado, v_gasto.medio
      from cat_gasto cg
     where cg.nombre = v_gasto.categoria
       and cg.naturaleza = v_gasto.naturaleza
       and cg.area = v_gasto.area
    returning id into v_gasto_id;

    insert into public._prueba_marca values ('gasto', v_gasto_id);

    -- Asiento 1 · devengo: el gasto existe aunque no se haya pagado
    v_asiento := crear_asiento(
      v_gasto.devengado, 'gasto_devengo',
      'ZZ_TEST_ Devengo ' || v_gasto.categoria,
      jsonb_build_array(
        jsonb_build_object('cuenta', v_cuenta,     'debe',  v_gasto.monto),
        jsonb_build_object('cuenta', 'PROVEEDORES','haber', v_gasto.monto)),
      v_torneo, v_jornada, null, v_gasto_id, v_user);

    update gasto set asiento_dev_id = v_asiento where id = v_gasto_id;
    insert into public._prueba_marca values ('asiento', v_asiento);

    -- Asiento 2 · pago, solo si se pagó (regla 7: son dos asientos, no uno)
    if v_gasto.pagado is not null then
      v_predio := case when v_gasto.medio = 'efectivo' then v_tirolesa else null end;

      v_asiento := crear_asiento(
        v_gasto.pagado, 'gasto_pago',
        'ZZ_TEST_ Pago ' || v_gasto.categoria,
        jsonb_build_array(
          jsonb_build_object('cuenta', 'PROVEEDORES', 'debe', v_gasto.monto),
          jsonb_build_object('cuenta',
            case v_gasto.medio when 'efectivo' then 'CAJA_EFECTIVO'
                               else 'CAJA_TRANSFERENCIA' end,
            'haber', v_gasto.monto)),
        v_torneo, v_jornada, v_predio, v_gasto_id, v_user);

      update gasto set asiento_pag_id = v_asiento where id = v_gasto_id;
      insert into public._prueba_marca values ('asiento', v_asiento);
    end if;

    v_gastos := v_gastos + 1;
  end loop;

  raise notice 'Set de prueba sembrado: % fichas, % cobros, % gastos.',
    v_fichas, v_pagos, v_gastos;
end $$;
