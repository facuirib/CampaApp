-- ─────────────────────────────────────────────────────────────────────────────
-- Dar de alta un ejercicio
--
-- ── Por qué hace falta ─────────────────────────────────────────────────────
--
-- `ejercicio` tenía UNA sola policy —`ejercicio_select_autenticado`—, así que la
-- app podía leerlo y nadie podía crearlo. Con un solo ejercicio cargado (2026)
-- eso alcanzaba para hoy y bloqueaba todo el año que viene: presupuestar 2027
-- necesita el ejercicio 2027, y `periodo_de_fecha` corta cualquier movimiento
-- con fecha fuera de un ejercicio existente («No hay ejercicio que contenga la
-- fecha X»). O sea que sin esto, el 1 de enero la app deja de poder registrar.
--
-- ── Lo que NO hace, a propósito ────────────────────────────────────────────
--
-- No crea los doce períodos. `periodo_de_fecha` ya los crea al vuelo la primera
-- vez que se opera en cada mes, y adelantarlos dejaría doce filas vacías que
-- sólo sirven para que un mes sin movimientos parezca abierto y trabajado.
--
-- ── El ejercicio es el año calendario, y eso no es un parámetro ────────────
--
-- Las fechas se derivan de `p_anio`: del 1 de enero al 31 de diciembre. No
-- entran por parámetro, y es deliberado: todo el modelo trata a `ejercicio.anio`
-- como EL año —el filtro de /presupuesto, `periodo.anio`— y la unidad `por_mes`
-- de las líneas de presupuesto calcula su factor midiendo el largo del
-- ejercicio. Un ejercicio de seis meses cargado a mano partiría ese factor al
-- medio en silencio. Si algún día hace falta un ejercicio fiscal desfasado, es
-- una decisión de modelo, no un argumento más.
--
-- ── Por qué se exige que sea contiguo ──────────────────────────────────────
--
-- Un hueco no falla al crearse: falla meses después, cuando alguien carga un
-- gasto con fecha del año que quedó sin ejercicio y `periodo_de_fecha` lo
-- rechaza. Como no hay forma de borrar un ejercicio, un `2062` mal tipeado
-- queda para siempre en el desplegable de presupuestos. Se exige pegado al
-- rango que ya existe, que es además la única forma en que los ejercicios se
-- usan de verdad: uno atrás del otro.
--
-- El año se lee de la base (`max`/`min`), no hay ninguno escrito acá: la regla
-- 12 vale también para los años.
-- ─────────────────────────────────────────────────────────────────────────────

-- La puerta valida el rol, pero la escritura sigue pasando por RLS: la función
-- corre con los permisos de quien llama. Sin esta policy el insert se frenaría
-- igual, y en silencio.
create policy ejercicio_insert_rol on ejercicio
  for insert to authenticated
  with check (auth_rol() = 'admin');

create or replace function public.crear_ejercicio(p_anio integer)
returns uuid
language plpgsql
as $$
declare
  v_id     uuid;
  v_min    int;
  v_max    int;
begin
  if not (coalesce(auth_rol(), '') = 'admin') then
    raise exception
      'Crear un ejercicio es de administrador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  if p_anio is null then
    raise exception 'El ejercicio necesita un año';
  end if;

  select min(anio), max(anio) into v_min, v_max from ejercicio;

  -- Con la tabla vacía se acepta cualquiera: es el primero y no hay contra qué
  -- medir la contigüidad.
  if v_min is not null and p_anio not between v_min - 1 and v_max + 1 then
    raise exception
      'Los ejercicios tienen que ser consecutivos. Hoy van de % a %, así que el '
      'próximo puede ser % o %. Un año salteado no falla ahora: falla cuando '
      'alguien registre un movimiento con fecha del año que quedó sin ejercicio.',
      v_min, v_max, v_min - 1, v_max + 1;
  end if;

  begin
    insert into ejercicio (anio, fecha_desde, fecha_hasta)
    values (p_anio, make_date(p_anio, 1, 1), make_date(p_anio, 12, 31))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'El ejercicio % ya está creado', p_anio;
  end;

  return v_id;
end;
$$;

comment on function public.crear_ejercicio(integer) is
  'Da de alta un ejercicio (año calendario). Sólo admin. Exige que sea consecutivo a los que ya hay.';
