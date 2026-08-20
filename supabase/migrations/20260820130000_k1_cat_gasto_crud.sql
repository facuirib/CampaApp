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
-- ✅ RESPUESTAS DE FACU (20/08, en coordinacion.md):
--  K1-1 auditoría: SÍ, vía audit_log existente (6 tablas sensibles con
--    trigger). NO bloquea K1 — se aplica ahora, el trigger se suma
--    después sin tocar funciones.
--  K1-2 ¿espera bloque 10? → VA YA. Con la anon key en el bundle, RLS no
--    cambia la exposición (ya se puede escribir con o sin login); el
--    riesgo real es de criterio (cuenta equivocada), que mitiga K1-3, no
--    los roles.
--  K1-3 cuenta_id inmutable: SÍ, con gastos no anulados asociados. Si
--    'Arbitros Masculino' tiene 199 gastos en GAS_FECHA y se le cambia
--    la cuenta, la categoría queda partida en dos — el P&L por cuenta
--    deja de coincidir con el P&L por categoría, en silencio. Mismo
--    chequeo que ya hace desactivar_cat_gasto. AGREGADO en esta versión.
--  K1-4 unique condicional: NO, queda incondicional. Aflojarlo mezclaría
--    dos categorías con el mismo nombre en una fila de
--    v_gasto_categoria_mes (agrupa por nombre), rompiendo el 'vs real'
--    del presupuesto. Si hay que reusar un nombre, se reactiva la
--    vieja.
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

  if p_cuenta_id is not null then
    declare
      v_cuenta_actual uuid;
      v_gastos_activos int;
    begin
      select cuenta_id into v_cuenta_actual from cat_gasto where id = p_cat_gasto_id;

      if p_cuenta_id <> v_cuenta_actual then
        select count(*)
          into v_gastos_activos
        from gasto g
        join v_gasto_detalle d on d.gasto_id = g.id
        where g.cat_gasto_id = p_cat_gasto_id
          and d.estado <> 'anulado';

        if v_gastos_activos > 0 then
          raise exception
            'No se puede cambiar la cuenta: la categoría tiene % gasto(s) '
            'asociados. Cambiar la cuenta partiría la categoría en dos — '
            'los gastos viejos en una cuenta, los nuevos en otra. Es una '
            'operación deliberada con reimputación, no un cambio de '
            'formulario.',
            v_gastos_activos;
        end if;
      end if;
    end;
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
  'K1 — alta de categoría de gasto. Rechaza nombre+área duplicado y cuenta inexistente. Ver header con las respuestas de Facu (20/08).';
comment on function editar_cat_gasto(uuid, text, text, text, uuid, text, text) is
  'K1 — edición parcial (solo los parámetros no-null se actualizan). Ver header con las respuestas de Facu (20/08).';
comment on function desactivar_cat_gasto(uuid) is
  'K1 — soft-delete. Rechaza si hay gastos (no anulados) asociados, para no ocultar una categoría con plata viva.';