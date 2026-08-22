-- ═══════════════════════════════════════════════════════════════
-- K2 · crear_torneo — PROPUESTA, NO APLICAR sin revisión de Facu
-- (regla 11 · motor + zona de gestión, atada al bloque 10 según la
-- nota de arquitectura — avisar antes de construir más de esto).
--
-- Alta mínima de un torneo: nombre, temporada, año, estado inicial.
-- NO crea categorías ni series — nace vacío. Es la decisión más
-- importante de esta propuesta, y la dejo abierta a propósito:
--
-- ⚠️ DECISIÓN PARA FACU (la más importante):
--  ¿Un torneo nuevo nace completamente vacío (sin categorías/series,
--  se cargan aparte), o clona la estructura de un torneo anterior
--  (mismas categorías/series, sin equipos)? Clonar ahorra carga manual
--  pero es una decisión de diseño más grande — necesita saber de qué
--  torneo clonar, y si algo cambió de una temporada a otra (una
--  categoría que se da de baja, una que se agrega) hay que resolverlo
--  en la función de clonado, no acá. Propongo EMPEZAR por la versión
--  vacía (esta migración) y agregar el clonado como una función aparte
--  después, si hace falta — no atarlo al alta básica.
--
-- Otras decisiones, menores:
--  - estado inicial: propongo 'planificado' siempre — pasar a 'en_curso'
--    es una transición aparte (¿otra función, o UPDATE directo? Mismo
--    patrón que arqueo/cheque si hace falta más adelante, no ahora).
--  - ejercicio_id: opcional (la columna ya lo permite). Si no se pasa,
--    el torneo queda sin ejercicio asignado hasta que se resuelva —
--    coherente con que el Clausura actual también lo tiene así.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.crear_torneo(
  p_nombre        text,
  p_temporada     temporada,
  p_anio          smallint,
  p_ejercicio_id  uuid default null,
  p_fecha_desde   date default null,
  p_fecha_hasta   date default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'El torneo necesita un nombre';
  end if;

  if p_anio is null or p_anio < 2000 then
    raise exception 'El año no es válido (recibido: %)', p_anio;
  end if;

  if p_ejercicio_id is not null and not exists (select 1 from ejercicio where id = p_ejercicio_id) then
    raise exception 'El ejercicio % no existe', p_ejercicio_id;
  end if;

  if p_fecha_desde is not null and p_fecha_hasta is not null and p_fecha_desde > p_fecha_hasta then
    raise exception 'La fecha desde (%) no puede ser posterior a la fecha hasta (%)', p_fecha_desde, p_fecha_hasta;
  end if;

  begin
    insert into torneo (nombre, temporada, anio, ejercicio_id, fecha_desde, fecha_hasta, estado, activo)
    values (p_nombre, p_temporada, p_anio, p_ejercicio_id, p_fecha_desde, p_fecha_hasta, 'planificado', true)
    returning id into v_id;
  exception when unique_violation then
    raise exception
      'Ya existe un torneo % % (temporada+año es único). No puede coexistir '
      'otro con la misma combinación.',
      p_temporada, p_anio;
  end;

  return v_id;
end;
$function$;

comment on function crear_torneo(text, temporada, smallint, uuid, date, date) is
  'K2 — alta mínima de torneo, nace vacío (sin categorías/series) y en '
  'estado planificado. Ver header: la decisión de clonar estructura de un '
  'torneo anterior queda abierta, no resuelta acá.';