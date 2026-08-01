-- ============================================================================
-- CAMPA · Seed de PRODUCCIÓN · Clausura 2026 · 4/4 · Calendario (284 jornadas)
--
-- Fuente: clausura_2026_04_calendario.csv, versión corregida y validada.
--
-- Requiere la pieza 2 aplicada: usa crear_jornada(). NO inserta directo en
-- `jornada` a propósito — el seed y el módulo de calendario de la app pasan
-- por la misma lógica validada (decisión 49). Si el seed insertara por su
-- cuenta, podría cargar algo que la pantalla habría rechazado.
--
-- La serie se resuelve POR NOMBRE contra la base, como el padrón. Sin uuids
-- hardcodeados.
--
-- Idempotente: salta las jornadas que ya existen (serie + número).
--
-- Regla 12: los datos del torneo están acá, en un seed. La lógica
-- —crear_jornada— es agnóstica: recibe serie, número y fecha.
--
-- ⚠ APLICAR ESTE SEED ARMA LA CUENTA DE v_presupuesto_total.
-- La vista multiplica los presupuestos `por_jornada` por la cantidad de
-- jornadas del torneo: pasa de 0 a 284. La pieza 5 (las tres unidades de
-- costo, decisión 44) tiene que llegar antes de que se cargue el primer
-- presupuesto. Hoy las tablas de presupuesto están vacías.
-- ============================================================================

do $$
declare
  r          record;
  v_torneo   uuid;
  v_serie_id uuid;
  v_creadas  int := 0;
begin
  select id into v_torneo from torneo where temporada='clausura' and anio=2026;
  if v_torneo is null then
    raise exception 'Falta el torneo Clausura 2026: correr primero 01_estructura';
  end if;

  for r in
    select * from (values
      -- Libre · Serie A
      ('Libre','A',1,'2026-08-01'::date),
      ('Libre','A',2,'2026-08-08'::date),
      ('Libre','A',3,'2026-08-22'::date),
      ('Libre','A',4,'2026-08-30'::date),
      ('Libre','A',5,'2026-09-05'::date),
      ('Libre','A',6,'2026-09-12'::date),
      ('Libre','A',7,'2026-09-19'::date),
      ('Libre','A',8,'2026-09-26'::date),
      ('Libre','A',9,'2026-10-03'::date),
      ('Libre','A',10,'2026-10-17'::date),
      ('Libre','A',11,'2026-10-24'::date),
      ('Libre','A',12,'2026-10-31'::date),
      ('Libre','A',13,'2026-11-07'::date),
      ('Libre','A',14,'2026-11-14'::date),
      ('Libre','A',15,'2026-11-21'::date),
      -- Libre · Serie B
      ('Libre','B',1,'2026-08-02'::date),
      ('Libre','B',2,'2026-08-08'::date),
      ('Libre','B',3,'2026-08-22'::date),
      ('Libre','B',4,'2026-08-29'::date),
      ('Libre','B',5,'2026-09-05'::date),
      ('Libre','B',6,'2026-09-12'::date),
      ('Libre','B',7,'2026-09-19'::date),
      ('Libre','B',8,'2026-09-26'::date),
      ('Libre','B',9,'2026-10-03'::date),
      ('Libre','B',10,'2026-10-18'::date),
      ('Libre','B',11,'2026-10-24'::date),
      ('Libre','B',12,'2026-10-31'::date),
      ('Libre','B',13,'2026-11-07'::date),
      ('Libre','B',14,'2026-11-14'::date),
      ('Libre','B',15,'2026-11-21'::date),
      -- Libre · Serie C
      ('Libre','C',1,'2026-08-01'::date),
      ('Libre','C',2,'2026-08-08'::date),
      ('Libre','C',3,'2026-08-15'::date),
      ('Libre','C',4,'2026-08-29'::date),
      ('Libre','C',5,'2026-09-05'::date),
      ('Libre','C',6,'2026-09-13'::date),
      ('Libre','C',7,'2026-09-19'::date),
      ('Libre','C',8,'2026-09-26'::date),
      ('Libre','C',9,'2026-10-03'::date),
      ('Libre','C',10,'2026-10-18'::date),
      ('Libre','C',11,'2026-10-24'::date),
      ('Libre','C',12,'2026-10-31'::date),
      ('Libre','C',13,'2026-11-07'::date),
      ('Libre','C',14,'2026-11-14'::date),
      ('Libre','C',15,'2026-11-21'::date),
      -- Libre · Serie D
      ('Libre','D',1,'2026-08-08'::date),
      ('Libre','D',2,'2026-08-16'::date),
      ('Libre','D',3,'2026-08-22'::date),
      ('Libre','D',4,'2026-09-05'::date),
      ('Libre','D',5,'2026-09-12'::date),
      ('Libre','D',6,'2026-09-19'::date),
      ('Libre','D',7,'2026-09-26'::date),
      ('Libre','D',8,'2026-10-04'::date),
      ('Libre','D',9,'2026-10-10'::date),
      ('Libre','D',10,'2026-10-17'::date),
      ('Libre','D',11,'2026-10-24'::date),
      ('Libre','D',12,'2026-10-31'::date),
      ('Libre','D',13,'2026-11-07'::date),
      ('Libre','D',14,'2026-11-14'::date),
      ('Libre','D',15,'2026-11-21'::date),
      -- Libre · Serie E
      ('Libre','E',1,'2026-08-08'::date),
      ('Libre','E',2,'2026-08-23'::date),
      ('Libre','E',3,'2026-08-29'::date),
      ('Libre','E',4,'2026-09-05'::date),
      ('Libre','E',5,'2026-09-12'::date),
      ('Libre','E',6,'2026-09-19'::date),
      ('Libre','E',7,'2026-09-26'::date),
      ('Libre','E',8,'2026-10-04'::date),
      ('Libre','E',9,'2026-10-10'::date),
      ('Libre','E',10,'2026-10-17'::date),
      ('Libre','E',11,'2026-10-24'::date),
      ('Libre','E',12,'2026-10-31'::date),
      ('Libre','E',13,'2026-11-07'::date),
      ('Libre','E',14,'2026-11-14'::date),
      ('Libre','E',15,'2026-11-21'::date),
      -- Libre · Serie F
      ('Libre','F',1,'2026-08-09'::date),
      ('Libre','F',2,'2026-08-22'::date),
      ('Libre','F',3,'2026-08-29'::date),
      ('Libre','F',4,'2026-09-05'::date),
      ('Libre','F',5,'2026-09-13'::date),
      ('Libre','F',6,'2026-09-19'::date),
      ('Libre','F',7,'2026-09-26'::date),
      ('Libre','F',8,'2026-10-03'::date),
      ('Libre','F',9,'2026-10-10'::date),
      ('Libre','F',10,'2026-10-17'::date),
      ('Libre','F',11,'2026-10-24'::date),
      ('Libre','F',12,'2026-10-31'::date),
      ('Libre','F',13,'2026-11-07'::date),
      ('Libre','F',14,'2026-11-14'::date),
      ('Libre','F',15,'2026-11-21'::date),
      -- +30 · Serie A
      ('+30','A',1,'2026-08-08'::date),
      ('+30','A',2,'2026-08-15'::date),
      ('+30','A',3,'2026-08-22'::date),
      ('+30','A',4,'2026-08-29'::date),
      ('+30','A',5,'2026-09-05'::date),
      ('+30','A',6,'2026-09-12'::date),
      ('+30','A',7,'2026-09-19'::date),
      ('+30','A',8,'2026-09-27'::date),
      ('+30','A',9,'2026-10-03'::date),
      ('+30','A',10,'2026-10-17'::date),
      ('+30','A',11,'2026-10-24'::date),
      ('+30','A',12,'2026-10-31'::date),
      ('+30','A',13,'2026-11-07'::date),
      ('+30','A',14,'2026-11-14'::date),
      ('+30','A',15,'2026-11-21'::date),
      -- +30 · Serie B
      ('+30','B',1,'2026-08-01'::date),
      ('+30','B',2,'2026-08-08'::date),
      ('+30','B',3,'2026-08-15'::date),
      ('+30','B',4,'2026-08-29'::date),
      ('+30','B',5,'2026-09-05'::date),
      ('+30','B',6,'2026-09-12'::date),
      ('+30','B',7,'2026-09-19'::date),
      ('+30','B',8,'2026-09-27'::date),
      ('+30','B',9,'2026-10-03'::date),
      ('+30','B',10,'2026-10-17'::date),
      ('+30','B',11,'2026-10-24'::date),
      ('+30','B',12,'2026-10-31'::date),
      ('+30','B',13,'2026-11-07'::date),
      ('+30','B',14,'2026-11-14'::date),
      ('+30','B',15,'2026-11-21'::date),
      -- +30 · Serie C
      ('+30','C',1,'2026-08-01'::date),
      ('+30','C',2,'2026-08-15'::date),
      ('+30','C',3,'2026-08-29'::date),
      ('+30','C',4,'2026-09-05'::date),
      ('+30','C',5,'2026-09-12'::date),
      ('+30','C',6,'2026-09-20'::date),
      ('+30','C',7,'2026-09-26'::date),
      ('+30','C',8,'2026-10-03'::date),
      ('+30','C',9,'2026-10-10'::date),
      ('+30','C',10,'2026-10-17'::date),
      ('+30','C',11,'2026-10-24'::date),
      ('+30','C',12,'2026-10-31'::date),
      ('+30','C',13,'2026-11-07'::date),
      ('+30','C',14,'2026-11-14'::date),
      ('+30','C',15,'2026-11-21'::date),
      -- +35 · Serie A
      ('+35','A',1,'2026-08-01'::date),
      ('+35','A',2,'2026-08-15'::date),
      ('+35','A',3,'2026-08-22'::date),
      ('+35','A',4,'2026-08-29'::date),
      ('+35','A',5,'2026-09-05'::date),
      ('+35','A',6,'2026-09-12'::date),
      ('+35','A',7,'2026-09-20'::date),
      ('+35','A',8,'2026-09-26'::date),
      ('+35','A',9,'2026-10-03'::date),
      ('+35','A',10,'2026-10-17'::date),
      ('+35','A',11,'2026-10-24'::date),
      ('+35','A',12,'2026-10-31'::date),
      ('+35','A',13,'2026-11-07'::date),
      ('+35','A',14,'2026-11-14'::date),
      ('+35','A',15,'2026-11-21'::date),
      -- +35 · Serie B
      ('+35','B',1,'2026-08-01'::date),
      ('+35','B',2,'2026-08-15'::date),
      ('+35','B',3,'2026-08-29'::date),
      ('+35','B',4,'2026-09-06'::date),
      ('+35','B',5,'2026-09-12'::date),
      ('+35','B',6,'2026-09-19'::date),
      ('+35','B',7,'2026-09-26'::date),
      ('+35','B',8,'2026-10-03'::date),
      ('+35','B',9,'2026-10-10'::date),
      ('+35','B',10,'2026-10-17'::date),
      ('+35','B',11,'2026-10-25'::date),
      ('+35','B',12,'2026-10-31'::date),
      ('+35','B',13,'2026-11-07'::date),
      ('+35','B',14,'2026-11-14'::date),
      ('+35','B',15,'2026-11-21'::date),
      -- +40 · Serie A
      ('+40','A',1,'2026-08-01'::date),
      ('+40','A',2,'2026-08-15'::date),
      ('+40','A',3,'2026-08-22'::date),
      ('+40','A',4,'2026-08-29'::date),
      ('+40','A',5,'2026-09-06'::date),
      ('+40','A',6,'2026-09-12'::date),
      ('+40','A',7,'2026-09-19'::date),
      ('+40','A',8,'2026-09-26'::date),
      ('+40','A',9,'2026-10-03'::date),
      ('+40','A',10,'2026-10-17'::date),
      ('+40','A',11,'2026-10-24'::date),
      ('+40','A',12,'2026-10-31'::date),
      ('+40','A',13,'2026-11-07'::date),
      ('+40','A',14,'2026-11-14'::date),
      ('+40','A',15,'2026-11-21'::date),
      -- Femenino · Serie A
      ('Femenino','A',1,'2026-08-08'::date),
      ('Femenino','A',2,'2026-08-15'::date),
      ('Femenino','A',3,'2026-08-29'::date),
      ('Femenino','A',4,'2026-09-05'::date),
      ('Femenino','A',5,'2026-09-12'::date),
      ('Femenino','A',6,'2026-09-19'::date),
      ('Femenino','A',7,'2026-10-03'::date),
      ('Femenino','A',8,'2026-10-17'::date),
      ('Femenino','A',9,'2026-10-24'::date),
      ('Femenino','A',10,'2026-10-31'::date),
      ('Femenino','A',11,'2026-11-07'::date),
      ('Femenino','A',12,'2026-11-14'::date),
      ('Femenino','A',13,'2026-11-21'::date),
      -- Femenino · Serie B
      ('Femenino','B',1,'2026-08-08'::date),
      ('Femenino','B',2,'2026-08-15'::date),
      ('Femenino','B',3,'2026-08-29'::date),
      ('Femenino','B',4,'2026-09-12'::date),
      ('Femenino','B',5,'2026-09-19'::date),
      ('Femenino','B',6,'2026-09-26'::date),
      ('Femenino','B',7,'2026-10-03'::date),
      ('Femenino','B',8,'2026-10-17'::date),
      ('Femenino','B',9,'2026-10-24'::date),
      ('Femenino','B',10,'2026-10-31'::date),
      ('Femenino','B',11,'2026-11-07'::date),
      ('Femenino','B',12,'2026-11-14'::date),
      ('Femenino','B',13,'2026-11-21'::date),
      -- Femenino · Serie C
      ('Femenino','C',1,'2026-08-08'::date),
      ('Femenino','C',2,'2026-08-22'::date),
      ('Femenino','C',3,'2026-08-29'::date),
      ('Femenino','C',4,'2026-09-05'::date),
      ('Femenino','C',5,'2026-09-19'::date),
      ('Femenino','C',6,'2026-09-26'::date),
      ('Femenino','C',7,'2026-10-03'::date),
      ('Femenino','C',8,'2026-10-17'::date),
      ('Femenino','C',9,'2026-10-24'::date),
      ('Femenino','C',10,'2026-10-31'::date),
      ('Femenino','C',11,'2026-11-07'::date),
      ('Femenino','C',12,'2026-11-14'::date),
      ('Femenino','C',13,'2026-11-21'::date),
      -- Femenino · Serie D
      ('Femenino','D',1,'2026-08-08'::date),
      ('Femenino','D',2,'2026-08-22'::date),
      ('Femenino','D',3,'2026-08-29'::date),
      ('Femenino','D',4,'2026-09-05'::date),
      ('Femenino','D',5,'2026-09-12'::date),
      ('Femenino','D',6,'2026-09-26'::date),
      ('Femenino','D',7,'2026-10-03'::date),
      ('Femenino','D',8,'2026-10-10'::date),
      ('Femenino','D',9,'2026-10-17'::date),
      ('Femenino','D',10,'2026-10-24'::date),
      ('Femenino','D',11,'2026-11-07'::date),
      ('Femenino','D',12,'2026-11-14'::date),
      ('Femenino','D',13,'2026-11-21'::date),
      -- Femenino · Serie E
      ('Femenino','E',1,'2026-08-08'::date),
      ('Femenino','E',2,'2026-08-22'::date),
      ('Femenino','E',3,'2026-09-05'::date),
      ('Femenino','E',4,'2026-09-12'::date),
      ('Femenino','E',5,'2026-09-19'::date),
      ('Femenino','E',6,'2026-09-26'::date),
      ('Femenino','E',7,'2026-10-03'::date),
      ('Femenino','E',8,'2026-10-10'::date),
      ('Femenino','E',9,'2026-10-17'::date),
      ('Femenino','E',10,'2026-10-24'::date),
      ('Femenino','E',11,'2026-10-31'::date),
      ('Femenino','E',12,'2026-11-07'::date),
      ('Femenino','E',13,'2026-11-21'::date),
      -- Femenino · Serie F
      ('Femenino','F',1,'2026-08-15'::date),
      ('Femenino','F',2,'2026-08-22'::date),
      ('Femenino','F',3,'2026-08-29'::date),
      ('Femenino','F',4,'2026-09-05'::date),
      ('Femenino','F',5,'2026-09-12'::date),
      ('Femenino','F',6,'2026-09-19'::date),
      ('Femenino','F',7,'2026-09-26'::date),
      ('Femenino','F',8,'2026-10-10'::date),
      ('Femenino','F',9,'2026-10-17'::date),
      ('Femenino','F',10,'2026-10-24'::date),
      ('Femenino','F',11,'2026-10-31'::date),
      ('Femenino','F',12,'2026-11-14'::date),
      ('Femenino','F',13,'2026-11-21'::date),
      -- Femenino · Serie G
      ('Femenino','G',1,'2026-08-15'::date),
      ('Femenino','G',2,'2026-08-22'::date),
      ('Femenino','G',3,'2026-08-29'::date),
      ('Femenino','G',4,'2026-09-05'::date),
      ('Femenino','G',5,'2026-09-12'::date),
      ('Femenino','G',6,'2026-09-19'::date),
      ('Femenino','G',7,'2026-09-26'::date),
      ('Femenino','G',8,'2026-10-03'::date),
      ('Femenino','G',9,'2026-10-10'::date),
      ('Femenino','G',10,'2026-10-24'::date),
      ('Femenino','G',11,'2026-10-31'::date),
      ('Femenino','G',12,'2026-11-07'::date),
      ('Femenino','G',13,'2026-11-14'::date),
      -- Flex · Serie A
      ('Flex','A',1,'2026-08-15'::date),
      ('Flex','A',2,'2026-08-29'::date),
      ('Flex','A',3,'2026-09-05'::date),
      ('Flex','A',4,'2026-09-12'::date),
      ('Flex','A',5,'2026-09-19'::date),
      ('Flex','A',6,'2026-09-26'::date),
      ('Flex','A',7,'2026-10-03'::date),
      ('Flex','A',8,'2026-10-10'::date),
      ('Flex','A',9,'2026-10-17'::date),
      ('Flex','A',10,'2026-10-31'::date),
      ('Flex','A',11,'2026-11-07'::date),
      ('Flex','A',12,'2026-11-14'::date),
      ('Flex','A',13,'2026-11-21'::date)
    ) as v(categoria, serie, nro_fecha, dia)
  loop
    select s.id into v_serie_id
      from serie s
      join categoria c on c.id = s.categoria_id
     where c.torneo_id = v_torneo
       and c.nombre = r.categoria
       and s.nombre = r.serie;

    if v_serie_id is null then
      raise exception 'No existe la serie % %', r.categoria, r.serie;
    end if;

    if not exists (
      select 1 from jornada
       where serie_id = v_serie_id and numero = r.nro_fecha
    ) then
      perform crear_jornada(v_serie_id, r.nro_fecha::smallint, r.dia);
      v_creadas := v_creadas + 1;
    end if;
  end loop;

  raise notice 'Calendario Clausura 2026: % jornadas creadas', v_creadas;
end $$;


-- ── Verificación ────────────────────────────────────────────────────────────

do $$
declare v_torneo uuid; v_total int; v_series int; v_mal int; v_1010 int;
begin
  select id into v_torneo from torneo where temporada='clausura' and anio=2026;

  select count(*) into v_total
    from jornada j join serie s on s.id=j.serie_id
    join categoria c on c.id=s.categoria_id
   where c.torneo_id = v_torneo;
  if v_total <> 284 then
    raise exception 'Se esperaban 284 jornadas y hay %', v_total;
  end if;

  select count(distinct j.serie_id) into v_series
    from jornada j join serie s on s.id=j.serie_id
    join categoria c on c.id=s.categoria_id
   where c.torneo_id = v_torneo;
  if v_series <> 20 then
    raise exception 'Se esperaban 20 series con calendario y hay %', v_series;
  end if;

  select count(*) into v_mal from (
    select s.id
      from jornada j join serie s on s.id=j.serie_id
      join categoria c on c.id=s.categoria_id
     where c.torneo_id = v_torneo
     group by s.id, c.genero
    having count(*) <> (case when c.genero='masculino' then 15 else 13 end)
  ) d;
  if v_mal > 0 then
    raise exception '% series con cantidad de jornadas incorrecta', v_mal;
  end if;

  select count(*) into v_mal from (
    select s.id
      from jornada j join serie s on s.id=j.serie_id
      join categoria c on c.id=s.categoria_id
     where c.torneo_id = v_torneo
     group by s.id
    having max(j.numero) <> count(*) or min(j.numero) <> 1
        or count(distinct j.numero) <> count(*)
  ) d;
  if v_mal > 0 then
    raise exception '% series con numeracion no correlativa', v_mal;
  end if;

  select count(*) into v_1010
    from jornada j join serie s on s.id=j.serie_id
    join categoria c on c.id=s.categoria_id
   where c.torneo_id = v_torneo and j.fecha = '2026-10-10';
  if v_1010 <> 10 then
    raise exception 'El 10/10/2026 lo juegan % series y deberian ser 10', v_1010;
  end if;

  raise notice 'Calendario OK · 284 jornadas · 20 series · conteos · correlatividad · 10/10';
end $$;
