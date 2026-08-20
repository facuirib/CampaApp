-- ═══════════════════════════════════════════════════════════════
-- K1 · CRUD de categorías de gasto — PROPUESTA, NO APLICAR sin revisión
--
-- cat_gasto no tenía funciones de escritura — solo se cargaba a mano
-- (seed) o directo en el editor. Tres funciones: alta, edición,
-- desactivación (soft-delete vía `activo`, no hay borrado físico —
-- coherente con el resto del proyecto: nada se borra si ya se usó).
--
-- Todos los campos de cat_gasto son NOT NULL con sus propios CHECK
-- (area/naturaleza/imputacion_default/unidad_default) — Postgres ya
-- valida los valores permitidos; estas funciones agregan mensajes claros
-- y la regla de negocio (no desactivar si tiene gastos activos).
--
-- ⚠️ DECISIONES PARA FACU:
--  1. Sin auditoría (cat_gasto no tiene created_by/updated_at). ¿Hace
--     falta agregarla, o es aceptable para una tabla de catálogo simple
--     (a diferencia de gasto/cheque, que sí llevan responsable)?
--  2. Sin RLS/roles todavía (bloque 10 pendiente) — cualquier usuario
--     autenticado podría crear/editar categorías. ¿Es aceptable ahora
--     (como el resto del sistema sin RLS), o esto conviene esperar a
--     que haya roles? La nota de arquitectura marca la "gestión desde
--     la app" como atada al bloque 10 — no sé si K1 cae en esa
--     categoría o es más simple (un catálogo, no gestión de torneo).
--  3. editar_cat_gasto permite cambiar CUALQUIER campo, incluida
--     `cuenta_id`. Cambiar la cuenta contable de una categoría con
--     gastos ya asentados no altera esos asientos viejos (crear_asiento
--     ya los grabó), pero sí cambia dónde van los NUEVOS. ¿Es el
--     comportamiento esperado, o cuenta_id debería ser inmutable tras
--     el primer uso?
--  4. cat_gasto tiene UNIQUE(area, nombre) INCONDICIONAL (no distingue
--     activo). Es una limitación del schema, no de estas funciones: una
--     categoría desactivada sigue "ocupando" su nombre+área — no se puede
--     dar de alta otra igual mientras la vieja exista desactivada, ni
--     reactivarla si alguien ya creó una nueva con el mismo nombre.
--     ¿Vale la pena que el unique sea condicional (WHERE activo), como
--     hiciste con NULLS NOT DISTINCT en presupuesto? No lo cambié yo —
--     es tocar el índice, no solo la función. Queda para tu criterio.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.crear_cat_gasto(
  p_nombre              text,
  p_naturaleza          text,
  p_area                text,
  p_cuenta_id            uuid,
  p_imputacion_default  text,
  p_unidad_default      text
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'La categoría necesita un nombre';
  end if;

  if exists (select 1 from cat_gasto where nombre = p_nombre and area = p_area) then
    raise exception 'Ya existe una categoría "%" en el área "%"', p_nombre, p_area;
  end if;

  if not exists (select 1 from cuenta where id = p_cuenta_id) then
    raise exception 'La cuenta % no existe', p_cuenta_id;
  end if;

  insert into cat_gasto (nombre, naturaleza, area, cuenta_id, imputacion_default, unidad_default, activo)
  values (p_nombre, p_naturaleza, p_area, p_cuenta_id, p_imputacion_default, p_unidad_default, true)
  returning id into v_id;

  return v_id;
end;
$function$;


create or replace function public.editar_cat_gasto(
  p_cat_gasto_id        uuid,
  p_nombre              text default null,
  p_naturaleza          text default null,
  p_area                text default null,
  p_cuenta_id           uuid default null,
  p_imputacion_default  text default null,
  p_unidad_default      text default null
)
returns void
language plpgsql
as $function$
begin
  if not exists (select 1 from cat_gasto where id = p_cat_gasto_id) then
    raise exception 'La categoría % no existe', p_cat_gasto_id;
  end if;

  if p_cuenta_id is not null and not exists (select 1 from cuenta where id = p_cuenta_id) then
    raise exception 'La cuenta % no existe', p_cuenta_id;
  end if;

  if (p_nombre is not null or p_area is not null) and exists (
    select 1 from cat_gasto
    where nombre = coalesce(p_nombre, (select nombre from cat_gasto where id = p_cat_gasto_id))
      and area   = coalesce(p_area,   (select area   from cat_gasto where id = p_cat_gasto_id))
      and id <> p_cat_gasto_id
  ) then
    raise exception 'Ya existe otra categoría con ese nombre en esa área';
  end if;

  update cat_gasto
     set nombre              = coalesce(p_nombre, nombre),
         naturaleza          = coalesce(p_naturaleza, naturaleza),
         area                = coalesce(p_area, area),
         cuenta_id           = coalesce(p_cuenta_id, cuenta_id),
         imputacion_default  = coalesce(p_imputacion_default, imputacion_default),
         unidad_default      = coalesce(p_unidad_default, unidad_default)
   where id = p_cat_gasto_id;
end;
$function$;


create or replace function public.desactivar_cat_gasto(
  p_cat_gasto_id uuid
)
returns void
language plpgsql
as $function$
declare
  v_gastos_activos int;
begin
  if not exists (select 1 from cat_gasto where id = p_cat_gasto_id) then
    raise exception 'La categoría % no existe', p_cat_gasto_id;
  end if;

  select count(*)
    into v_gastos_activos
  from gasto g
  join v_gasto_detalle d on d.gasto_id = g.id
  where g.cat_gasto_id = p_cat_gasto_id
    and d.estado <> 'anulado';

  if v_gastos_activos > 0 then
    raise exception
      'No se puede desactivar: tiene % gasto(s) asociados (pagados o '
      'pendientes). Desactivarla no los borra, pero conviene revisar '
      'antes de sacarla del catálogo.',
      v_gastos_activos;
  end if;

  update cat_gasto set activo = false where id = p_cat_gasto_id;
end;
$function$;

comment on function crear_cat_gasto(text, text, text, uuid, text, text) is
  'K1 — alta de categoría de gasto. Rechaza nombre+área duplicado y cuenta inexistente. Ver decisión 4 del header sobre el unique incondicional.';
comment on function editar_cat_gasto(uuid, text, text, text, uuid, text, text) is
  'K1 — edición parcial (solo los parámetros no-null se actualizan). Ver decisiones 3 y 4 del header.';
comment on function desactivar_cat_gasto(uuid) is
  'K1 — soft-delete. Rechaza si hay gastos (no anulados) asociados, para no ocultar una categoría con plata viva.';