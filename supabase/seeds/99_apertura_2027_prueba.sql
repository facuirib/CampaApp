-- ============================================================================
-- CAMPA · Seed de PRUEBA · Apertura 2027 · segundo torneo
--
-- NO es un seed de producción. Existe para poder PROBAR lo que con un solo
-- torneo cargado no se puede probar: los filtros por torneo, y sobre todo el
-- concepto 5 —«la deuda es del equipo, no del torneo»—, que hasta acá nunca se
-- había ejercitado. Antes de esto, `v_deuda_equipo` no tenía ni un equipo con
-- `torneos_con_deuda > 1`.
--
-- Todo lo que crea queda marcado en `_prueba_marca` para poder limpiarlo.
--
-- ── Por qué el tarifario NO usa `por_partido` ───────────────────────────────
--
-- Porque arrastraría el calendario, que es justo lo que este seed evita.
--
-- `crear_equipo_torneo` genera, para una línea `por_partido` de liga, UNA CUOTA
-- POR JORNADA de la serie en el rango de fechas — y si no encuentra ninguna
-- **aborta** con "Sembrá el calendario de la serie antes de...". No alcanza con
-- no usar `hito_jornada_id`: la dependencia con `jornada` está en la regla, no
-- en esa columna.
--
-- `fecha_fija` y `bloque_adelantado` dan una cuota con fecha propia y no miran
-- `jornada`. Con esas dos alcanza para tener cuotas, deuda y estados, que es
-- todo lo que los filtros necesitan.
--
-- ── Por qué las fechas son todas futuras ────────────────────────────────────
--
-- Para que el contraste sea legible: Clausura 2026 tiene cuotas vencidas y
-- Apertura 2027 no tiene ninguna. Filtrando por torneo, `deuda_vencida` cambia
-- de un número grande a cero — y si la pantalla estuviera sumando los dos
-- torneos en vez de filtrar, se notaría de inmediato.
--
-- No genera ningún asiento: las cuotas son términos de pago, no hechos
-- contables (percibido puro). Por eso `crear_equipo_torneo` no llama a
-- `crear_asiento` y este seed corre sin sesión, aun después de que se sacara el
-- fallback a `auth.users`.
-- ============================================================================

do $$
declare
  v_torneo    uuid;
  v_categoria uuid;
  v_serie     uuid;
  v_insc      uuid;
  v_part      uuid;
  v_tercero   uuid;
  v_ficha     uuid;
begin

  -- ── Torneo ────────────────────────────────────────────────────────────────
  -- `ejercicio_id` queda null, igual que Clausura 2026: no se cargan ejercicios
  -- con fechas fiscales hasta que el estudio externo lo pida. No hace falta:
  -- sin asientos no se toca `periodo_de_fecha`.
  insert into torneo (nombre, temporada, anio, activo, estado, fecha_desde, fecha_hasta)
  values ('Apertura 2027', 'apertura', 2027, false, 'planificado', '2027-03-01', '2027-07-31')
  returning id into v_torneo;

  insert into _prueba_marca (tipo, id) values ('torneo', v_torneo);

  -- ── Categoría y serie ─────────────────────────────────────────────────────
  -- Una sola de cada una: el género de la categoría es lo que resuelve qué
  -- plan_tarifa aplica, así que tiene que coincidir con el de los planes.
  insert into categoria (torneo_id, nombre, genero, orden)
  values (v_torneo, 'Libre', 'masculino', 1)
  returning id into v_categoria;

  insert into serie (categoria_id, nombre, orden)
  values (v_categoria, 'A', 1)
  returning id into v_serie;

  insert into _prueba_marca (tipo, id) values ('categoria', v_categoria), ('serie', v_serie);

  -- ── Tarifario · inscripción ───────────────────────────────────────────────
  insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
  values (v_torneo, 'masculino', 'inscripcion', 1, 'Pago único')
  returning id into v_insc;

  insert into plan_tarifa_linea
    (plan_tarifa_id, linea_orden, concepto_label, precio_efectivo, precio_transferencia,
     regla, fecha_referencia, es_playoff)
  values
    (v_insc, 1, 'Seña',     900000, 1100000, 'fecha_fija', '2027-03-15', false),
    (v_insc, 2, 'Restante', 1900000, 2200000, 'fecha_fija', '2027-04-15', false);

  -- ── Tarifario · partidos ──────────────────────────────────────────────────
  -- `bloque_adelantado` cobra el total del bloque en una cuota con fecha propia.
  -- Es el reemplazo de `por_partido` que no necesita jornadas.
  --
  -- `fecha_desde`/`fecha_hasta` son OBLIGATORIAS acá — las exige `chk_bloque`, y
  -- con razón: son el rango que el bloque cubre. Sin ellas la línea dice "pagás
  -- un bloque" sin decir bloque de qué. Que la cuota no dependa de las jornadas
  -- para VENCER no significa que no cubra un tramo del torneo.
  --
  -- Y son NÚMEROS DE JORNADA (`smallint`), no fechas de calendario: en CAMPA
  -- "fecha" es la jornada. `fecha_desde = 1, fecha_hasta = 8` se lee "de la
  -- fecha 1 a la 8". El nombre engaña si uno viene de leer `fecha_referencia`,
  -- que ahí arriba sí es una fecha de verdad.
  insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
  values (v_torneo, 'masculino', 'partidos', 1, 'Bloque adelantado')
  returning id into v_part;

  insert into plan_tarifa_linea
    (plan_tarifa_id, linea_orden, concepto_label, precio_efectivo, precio_transferencia,
     regla, fecha_referencia, fecha_desde, fecha_hasta, cantidad_esperada, es_playoff)
  values
    (v_part, 1, 'Fechas 1–8 (bloque)',  3400000, 3900000, 'bloque_adelantado',
     '2027-05-15', 1, 8, 8, false),
    (v_part, 2, 'Fechas 9–16 (bloque)', 3400000, 3900000, 'bloque_adelantado',
     '2027-06-15', 9, 16, 8, false);

  insert into _prueba_marca (tipo, id) values ('plan_tarifa', v_insc), ('plan_tarifa', v_part);

  -- ── Fichas · los MISMOS equipos que ya deben en Clausura ──────────────────
  --
  -- Acá está el punto del seed. `tercero` es el equipo y no cambia de torneo a
  -- torneo: la misma entidad se vuelve a anotar, y su deuda se acumula. Eso es
  -- el concepto 5, y es lo que nunca se había podido ver funcionando.
  --
  -- Se eligen por deuda vencida en Clausura para que el caso interesante —el
  -- que debe en los dos— exista de verdad.
  for v_tercero in
    select d.tercero_id
      from v_deuda_equipo d
     where d.deuda_total > 0
     order by d.deuda_vencida desc, d.deuda_total desc
     limit 6
  loop
    v_ficha := crear_equipo_torneo(
      v_tercero,
      v_serie,
      v_insc,
      v_part,
      'transferencia'::medio_pago,
      null              -- responsable: es un seed, no lo cargó nadie desde la app
    );

    insert into _prueba_marca (tipo, id) values ('equipo_torneo', v_ficha);
  end loop;

end $$;
