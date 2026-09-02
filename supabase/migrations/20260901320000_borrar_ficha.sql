-- ═══════════════════════════════════════════════════════════════
-- borrar_ficha
-- APLICADA el 01/09/2026. Necesaria para editar un torneo clonado
-- antes de confirmar. Bloquea si la ficha ya tiene cuotas -mismo
-- criterio que el resto del proyecto: no se borra lo que tiene
-- historial real.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.borrar_ficha(
  p_equipo_torneo_id uuid
)
returns void
language plpgsql
as $function$
begin
  if not (coalesce(auth_rol(), '') = 'admin') then
    raise exception 'Borrar una ficha es de administrador. Tu rol es «%».', coalesce(auth_rol(), 'sin rol');
  end if;
  if not exists (select 1 from equipo_torneo where id = p_equipo_torneo_id) then
    raise exception 'La ficha % no existe', p_equipo_torneo_id;
  end if;
  if exists (select 1 from cuota where equipo_torneo_id = p_equipo_torneo_id) then
    raise exception 'La ficha % ya tiene cuotas generadas. No se puede borrar: perderia el historial contable.', p_equipo_torneo_id;
  end if;
  delete from equipo_torneo where id = p_equipo_torneo_id;
end;
$function$;

comment on function borrar_ficha(uuid) is
  'Borra una ficha (equipo_torneo) SOLO si no tiene cuotas todavia. Pensada para editar un torneo clonado antes de confirmar.';
