-- ═══════════════════════════════════════════════════════════════
-- CAMPA · Migración 004
-- Motor de asientos: crear, anular, consultar
-- ═══════════════════════════════════════════════════════════════
-- Se aplica después de 003_deuda_equipo.sql
--
-- Estas funciones son la ÚNICA vía por la que se escriben asientos.
-- Ningún módulo inserta en `asiento` / `asiento_linea` directamente.
--
-- Por qué en Postgres y no en la app: así es imposible registrar un
-- movimiento sin su asiento. Si la lógica viviera en TypeScript,
-- alcanzaría con que alguien llame al insert directo para saltearla.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- A. RESOLUCIÓN DE PERÍODO
-- ───────────────────────────────────────────────────────────────
-- Toda escritura necesita saber a qué período pertenece su fecha.
-- Si el período no existe, se crea; si está cerrado, falla.

create or replace function periodo_de_fecha(p_fecha date)
returns uuid as $$
declare
  v_ejercicio_id uuid;
  v_periodo_id   uuid;
  v_estado       text;
begin
  select id into v_ejercicio_id
    from ejercicio
   where p_fecha between fecha_desde and fecha_hasta;

  if v_ejercicio_id is null then
    raise exception
      'No hay ejercicio que contenga la fecha %. Crealo antes de registrar movimientos.',
      p_fecha;
  end if;

  select id, estado into v_periodo_id, v_estado
    from periodo
   where ejercicio_id = v_ejercicio_id
     and anio = extract(year  from p_fecha)::int
     and mes  = extract(month from p_fecha)::int;

  -- El período se crea solo la primera vez que se opera en ese mes
  if v_periodo_id is null then
    insert into periodo (ejercicio_id, anio, mes)
    values (v_ejercicio_id,
            extract(year  from p_fecha)::int,
            extract(month from p_fecha)::int)
    returning id into v_periodo_id;
    return v_periodo_id;
  end if;

  if v_estado = 'cerrado' then
    raise exception
      'El período %-% está cerrado. Las correcciones se registran como '
      'ajuste en el período abierto.',
      extract(year from p_fecha)::int,
      lpad(extract(month from p_fecha)::text, 2, '0');
  end if;

  return v_periodo_id;
end $$ language plpgsql;

comment on function periodo_de_fecha is
  'Devuelve el período de una fecha. Lo crea si no existe; falla si está cerrado.';


-- ───────────────────────────────────────────────────────────────
-- B. CREAR ASIENTO
-- ───────────────────────────────────────────────────────────────
-- Punto de entrada único para escribir en el libro diario.
--
-- Las líneas llegan como jsonb:
--   [{"cuenta": "CAJA_EFECTIVO", "debe": 1000},
--    {"cuenta": "ING_PARTIDOS",  "haber": 1000, "tercero_id": "..."}]
--
-- `cuenta` es el CÓDIGO, no el uuid: hace las llamadas legibles y
-- evita que cada módulo tenga que resolver ids.

-- Si existe una versión con otra firma, hay que borrarla:
-- `create or replace` no pisa funciones con distinta cantidad de parámetros,
-- crea una nueva y Postgres no sabe cuál llamar.
drop function if exists crear_asiento(date,text,text,jsonb,uuid,uuid,uuid,uuid);

create or replace function crear_asiento(
  p_fecha       date,
  p_origen      text,
  p_descripcion text,
  p_lineas      jsonb,
  p_torneo_id   uuid default null,
  p_jornada_id  uuid default null,
  p_predio_id   uuid default null,
  p_origen_id   uuid default null,
  p_created_by  uuid default null
) returns uuid as $$
declare
  v_periodo_id uuid;
  v_asiento_id uuid;
  v_user_id    uuid;
  v_linea      jsonb;
  v_cuenta_id  uuid;
  v_codigo     text;
  v_debe       numeric(16,2);
  v_haber      numeric(16,2);
  v_suma_debe  numeric(16,2) := 0;
  v_suma_haber numeric(16,2) := 0;
  v_n          int := 0;
begin
  if p_lineas is null or jsonb_array_length(p_lineas) < 2 then
    raise exception 'Un asiento necesita al menos dos líneas';
  end if;

  -- Usuario: el parámetro, la sesión, o el primero que exista.
  -- El último caso es para pruebas desde el SQL Editor, donde no hay sesión.
  v_user_id := coalesce(p_created_by, auth.uid(), (select id from auth.users limit 1));
  if v_user_id is null then
    raise exception
      'No hay usuario para atribuir el asiento. Creá uno en Authentication '
      'o pasá p_created_by.';
  end if;

  v_periodo_id := periodo_de_fecha(p_fecha);

  -- Un movimiento de efectivo tiene que decir de qué predio es:
  -- si no, no se puede arquear ni saber a qué caja pertenece.
  if p_predio_id is null and exists (
    select 1 from jsonb_array_elements(p_lineas) x
    where x->>'cuenta' = 'CAJA_EFECTIVO'
  ) then
    raise exception
      'Un movimiento de Caja Efectivo requiere predio_id: el arqueo es por predio';
  end if;

  insert into asiento (
    periodo_id, torneo_id, jornada_id, predio_id,
    fecha, origen, origen_id, descripcion, created_by
  ) values (
    v_periodo_id, p_torneo_id, p_jornada_id, p_predio_id,
    p_fecha, p_origen, p_origen_id, p_descripcion, v_user_id
  ) returning id into v_asiento_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_n      := v_n + 1;
    v_codigo := v_linea->>'cuenta';
    v_debe   := coalesce((v_linea->>'debe')::numeric,  0);
    v_haber  := coalesce((v_linea->>'haber')::numeric, 0);

    select id into v_cuenta_id from cuenta where codigo = v_codigo;
    if v_cuenta_id is null then
      raise exception 'La cuenta % no existe (línea %)', v_codigo, v_n;
    end if;

    if v_debe = 0 and v_haber = 0 then
      raise exception 'La línea % no tiene importe', v_n;
    end if;
    if v_debe > 0 and v_haber > 0 then
      raise exception 'La línea % tiene debe y haber a la vez', v_n;
    end if;
    if v_debe < 0 or v_haber < 0 then
      raise exception 'La línea % tiene un importe negativo. Para revertir, usá anular_asiento()', v_n;
    end if;

    insert into asiento_linea (asiento_id, cuenta_id, debe, haber, tercero_id)
    values (v_asiento_id, v_cuenta_id, v_debe, v_haber,
            (v_linea->>'tercero_id')::uuid);

    v_suma_debe  := v_suma_debe  + v_debe;
    v_suma_haber := v_suma_haber + v_haber;
  end loop;

  -- El trigger deferrable también lo valida, pero acá el mensaje
  -- es más útil: dice cuánto falta y de qué lado.
  if v_suma_debe <> v_suma_haber then
    raise exception
      'El asiento no balancea: debe % · haber % · diferencia %',
      v_suma_debe, v_suma_haber, abs(v_suma_debe - v_suma_haber);
  end if;

  return v_asiento_id;
end $$ language plpgsql;

comment on function crear_asiento is
  'Única vía para escribir en el libro diario. Resuelve el período, '
  'valida las líneas y devuelve el id del asiento.';


-- ───────────────────────────────────────────────────────────────
-- C. ANULAR ASIENTO
-- ───────────────────────────────────────────────────────────────
-- El asiento nunca se borra ni se edita: se anula con un
-- contraasiento que invierte debe y haber.
--
-- El contraasiento va en la fecha que se indique (por defecto hoy),
-- no en la del original: si el período original está cerrado, la
-- corrección tiene que caer en el abierto.

create or replace function anular_asiento(
  p_asiento_id uuid,
  p_motivo     text,
  p_fecha      date default current_date
) returns uuid as $$
declare
  v_orig    record;
  v_nuevo   uuid;
  v_lineas  jsonb;
begin
  select * into v_orig from asiento where id = p_asiento_id;

  if not found then
    raise exception 'El asiento % no existe', p_asiento_id;
  end if;

  if v_orig.anulado_por is not null then
    raise exception 'El asiento % ya fue anulado', p_asiento_id;
  end if;

  -- ¿Es este un contraasiento de otro?
  if exists (select 1 from asiento where anulado_por = p_asiento_id) then
    raise exception
      'El asiento % es un contraasiento y no se puede anular', p_asiento_id;
  end if;

  -- Invertir: lo que estaba al debe va al haber y viceversa
  select jsonb_agg(jsonb_build_object(
           'cuenta',     c.codigo,
           'debe',       l.haber,
           'haber',      l.debe,
           'tercero_id', l.tercero_id
         ))
    into v_lineas
    from asiento_linea l
    join cuenta c on c.id = l.cuenta_id
   where l.asiento_id = p_asiento_id;

  v_nuevo := crear_asiento(
    p_fecha,
    'ajuste',
    'Anulación: ' || v_orig.descripcion || ' · ' || p_motivo,
    v_lineas,
    v_orig.torneo_id,
    v_orig.jornada_id,
    v_orig.predio_id,
    p_asiento_id
  );

  update asiento set anulado_por = v_nuevo where id = p_asiento_id;

  return v_nuevo;
end $$ language plpgsql;

comment on function anular_asiento is
  'Anula un asiento con un contraasiento. El original queda marcado '
  'con anulado_por y deja de contar en las vistas.';


-- ───────────────────────────────────────────────────────────────
-- D. CONSULTA DEL LIBRO DIARIO
-- ───────────────────────────────────────────────────────────────
-- Alimenta la pantalla "Registro de movimientos" (Configuración).

create or replace view v_libro_diario as
select
  a.id            as asiento_id,
  a.fecha,
  a.origen,
  a.origen_id,
  a.descripcion,
  t.nombre        as torneo,
  p.codigo        as predio,
  j.numero        as jornada,
  per.anio,
  per.mes,
  per.estado      as periodo_estado,
  a.anulado_por is not null as anulado,
  a.created_at,
  sum(l.debe)     as total_debe,
  sum(l.haber)    as total_haber,
  count(l.id)     as lineas
from asiento a
join periodo per      on per.id = a.periodo_id
join asiento_linea l  on l.asiento_id = a.id
left join torneo t    on t.id = a.torneo_id
left join predio p    on p.id = a.predio_id
left join jornada j   on j.id = a.jornada_id
group by a.id, a.fecha, a.origen, a.origen_id, a.descripcion,
         t.nombre, p.codigo, j.numero, per.anio, per.mes, per.estado,
         a.anulado_por, a.created_at;

comment on view v_libro_diario is
  'Cabecera de cada asiento con sus totales. Para el detalle, '
  'consultar asiento_linea por asiento_id.';


-- Detalle de un asiento, con nombres en vez de ids

create or replace view v_asiento_detalle as
select
  l.asiento_id,
  a.fecha,
  a.descripcion   as asiento,
  c.codigo        as cuenta_codigo,
  c.nombre        as cuenta,
  c.tipo          as cuenta_tipo,
  l.debe,
  l.haber,
  ter.nombre      as tercero
from asiento_linea l
join asiento a  on a.id = l.asiento_id
join cuenta c   on c.id = l.cuenta_id
left join tercero ter on ter.id = l.tercero_id;


-- ───────────────────────────────────────────────────────────────
-- E. SALDO DE CUENTA
-- ───────────────────────────────────────────────────────────────
-- Saldo de cualquier cuenta a una fecha, respetando su naturaleza:
-- activo y egreso suman por el debe; pasivo, patrimonio e ingreso
-- por el haber.

-- Nota sobre asientos anulados: NO se excluyen del saldo.
-- El original y su contraasiento se cancelan entre sí, que es lo
-- correcto contablemente: el libro muestra la historia completa,
-- incluido el error y su corrección.
--
-- Excluir solo el original daría un saldo mal: se restaría la
-- anulación sin haber sumado nunca el asiento equivocado.

create or replace function saldo_cuenta(
  p_codigo text,
  p_hasta  date default current_date,
  p_torneo_id uuid default null
) returns numeric as $$
declare v_saldo numeric(16,2);
begin
  select coalesce(sum(
    case when c.tipo in ('activo','egreso')
         then l.debe - l.haber
         else l.haber - l.debe
    end), 0)
    into v_saldo
    from asiento_linea l
    join asiento a on a.id = l.asiento_id
    join cuenta  c on c.id = l.cuenta_id
   where c.codigo = p_codigo
     and a.fecha <= p_hasta
     and (p_torneo_id is null or a.torneo_id = p_torneo_id);

  return v_saldo;
end $$ language plpgsql;

comment on function saldo_cuenta is
  'Saldo de una cuenta a una fecha, según su naturaleza. Incluye '
  'asientos anulados y sus contraasientos: se cancelan entre sí.';


-- ───────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ───────────────────────────────────────────────────────────────

do $$
declare n int;
begin
  select count(*) into n from pg_proc
   where proname in ('crear_asiento','anular_asiento','periodo_de_fecha','saldo_cuenta');
  if n < 4 then raise exception 'Faltan funciones (% de 4)', n; end if;

  select count(*) into n from information_schema.views
   where table_name in ('v_libro_diario','v_asiento_detalle');
  if n <> 2 then raise exception 'Faltan vistas (% de 2)', n; end if;

  raise notice 'Migración 004 aplicada correctamente';
end $$;


-- ───────────────────────────────────────────────────────────────
-- F. CORRECCIÓN: vistas que excluían asientos anulados
-- ───────────────────────────────────────────────────────────────
-- Las vistas de 001 y 002 filtraban `anulado_por is null`, que da un
-- resultado incorrecto: excluye el asiento equivocado pero deja su
-- contraasiento, así que el saldo queda desviado por el monto de la
-- corrección — al revés.
--
-- Criterio correcto: los dos participan y se cancelan entre sí.
-- Es lo que hace cualquier libro diario auditable.

create or replace view v_saldo_caja as
select
  cj.id        as caja_id,
  cj.tipo,
  cj.nombre,
  cj.predio_id,
  p.nombre     as predio,
  coalesce(mov.saldo, 0) as saldo
from caja cj
left join predio p on p.id = cj.predio_id
left join lateral (
  select sum(l.debe - l.haber) as saldo
  from asiento_linea l
  join asiento a on a.id = l.asiento_id
  join cuenta  c on c.id = l.cuenta_id
  where c.codigo = case cj.tipo
          when 'efectivo'      then 'CAJA_EFECTIVO'
          when 'transferencia' then 'CAJA_TRANSFERENCIA'
          when 'usd'           then 'CAJA_USD'
        end
    -- Efectivo: solo el predio de esta caja.
    -- Transferencia y USD: todo, no tienen predio.
    and (cj.predio_id is null or a.predio_id = cj.predio_id)
) mov on true
where cj.activo;


create or replace view v_resultado_producto as
select
  e.anio,
  coalesce(t.nombre, 'Estructura permanente') as producto,
  sum(case when c.tipo = 'ingreso' then l.haber - l.debe else 0 end) as ingresos,
  sum(case when c.tipo = 'egreso'  then l.debe  - l.haber else 0 end) as egresos,
  sum(case when c.tipo = 'ingreso' then l.haber - l.debe else 0 end)
  - sum(case when c.tipo = 'egreso' then l.debe - l.haber else 0 end) as contribucion
from asiento a
join periodo p        on p.id = a.periodo_id
join ejercicio e      on e.id = p.ejercicio_id
join asiento_linea l  on l.asiento_id = a.id
join cuenta c         on c.id = l.cuenta_id
left join torneo t    on t.id = a.torneo_id
where c.tipo in ('ingreso','egreso')
group by e.anio, coalesce(t.nombre, 'Estructura permanente');


create or replace view v_comparador_torneos as
select t.nombre, t.fecha_desde,
  count(distinct et.id) as equipos,
  sum(case when c.tipo='ingreso' then l.haber-l.debe else 0 end) as ingresos,
  sum(case when c.tipo='egreso'  then l.debe-l.haber else 0 end) as costos_directos,
  sum(case when c.tipo='ingreso' then l.haber-l.debe else 0 end)
  - sum(case when c.tipo='egreso' then l.debe-l.haber else 0 end) as contribucion,
  round((sum(case when c.tipo='ingreso' then l.haber-l.debe else 0 end)
       - sum(case when c.tipo='egreso'  then l.debe-l.haber else 0 end))
       / nullif(count(distinct et.id),0), 0) as contribucion_por_equipo
from torneo t
left join equipo_torneo et on et.torneo_id = t.id
left join asiento a        on a.torneo_id  = t.id
left join asiento_linea l  on l.asiento_id = a.id
left join cuenta c         on c.id = l.cuenta_id
group by t.id, t.nombre, t.fecha_desde;
