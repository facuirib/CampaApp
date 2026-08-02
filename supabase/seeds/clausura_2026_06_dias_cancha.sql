-- Días de cancha del Clausura 2026
--
-- Decisión 54. Arquitectura §3.5.
--
-- Caso base: todas las fechas del calendario × todos los predios activos.
-- 29 fechas × 2 predios (TIR, AEP) = 58 días de cancha.
--
-- Agnóstico del torneo (regla 12): no tiene ni una fecha ni una cantidad
-- escrita. Lee las fechas de las jornadas ya sembradas y los predios de la
-- tabla `predio`. Un torneo nuevo corre este mismo seed y funciona.
--
-- Pasa por `crear_dia_cancha()` en vez de insertar directo: una lógica, dos
-- puertas (decisión 49). El seed no puede cargar nada que la pantalla hubiera
-- rechazado. La función es idempotente, así que correr esto dos veces no rompe.

begin;

do $$
declare
  r record;
begin
  for r in
    select distinct j.fecha, p.id as predio_id
    from jornada j
    cross join predio p
    where j.fecha is not null
      and j.estado <> 'suspendida'
      and p.activo
    order by j.fecha, p.id
  loop
    perform crear_dia_cancha(r.fecha, r.predio_id);
  end loop;
end $$;

-- Verificación de la poscondición DE ESTE SEED: que exista un día de cancha por
-- cada (fecha de jornada × predio activo).
--
-- No se verifica el total de la tabla ni que todo día resuelva a un torneo:
-- `dia_cancha` puede tener legítimamente días sin fútbol —bar, evento— que este
-- seed no carga y que no tiene por qué contar.
do $$
declare
  v_fechas    integer;
  v_predios   integer;
  v_del_seed  integer;
  v_total     integer;
begin
  select count(distinct fecha) into v_fechas
    from jornada where fecha is not null and estado <> 'suspendida';

  select count(*) into v_predios from predio where activo;

  select count(*) into v_del_seed
    from dia_cancha dc
    join predio p on p.id = dc.predio_id and p.activo
    where exists (
      select 1 from jornada j
      where j.fecha = dc.fecha and j.estado <> 'suspendida'
    );

  select count(*) into v_total from dia_cancha;

  if v_del_seed <> v_fechas * v_predios then
    raise exception
      'Días de cancha con fútbol: % — esperado % fechas × % predios = %',
      v_del_seed, v_fechas, v_predios, v_fechas * v_predios;
  end if;

  raise notice 'Días de cancha con fútbol: % (% fechas × % predios). Total en tabla: %.',
    v_del_seed, v_fechas, v_predios, v_total;
end $$;

commit;

-- EXCEPCIONES CONOCIDAS · no cargadas.
--
-- El caso base asume que los dos predios operan todas las fechas. Se sabe que
-- eso no es exacto —hay domingos con un solo predio abierto, y la semifinal y
-- la final no usan los dos— pero cuáles y cuántos no está relevado.
--
-- No se inventan: 58 es el techo, y cada excepción baja el presupuesto por día
-- de cancha. Se quitan con `eliminar_dia_cancha(id)` cuando estén confirmadas.
