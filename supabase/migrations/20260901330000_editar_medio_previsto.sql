-- ═══════════════════════════════════════════════════════════════
-- editar_medio_previsto
-- APLICADA el 01/09/2026. Necesaria para editar un torneo clonado
-- antes de confirmar. Bloquea si la ficha ya tiene cuotas: el monto
-- de cada cuota ya se calculo con el medio_previsto viejo.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.editar_medio_previsto(
  p_equipo_torneo_id uuid,
  p_medio_previsto    medio_pago
)
returns void
language plpgsql
as $function$
declare
  v_ficha    record;
  v_cuotas   int;
begin
  if not (coalesce(auth_rol(), '') = 'admin') then
    raise exception 'Editar la forma de pago prevista es de administrador. Tu rol es «%».', coalesce(auth_rol(), 'sin rol');
  end if;
  select e.id, t.nombre as equipo, e.medio_previsto
    into v_ficha
    from equipo_torneo e
    join tercero t on t.id = e.tercero_id
   where e.id = p_equipo_torneo_id;
  if not found then
    raise exception 'La ficha % no existe', p_equipo_torneo_id;
  end if;
  if v_ficha.medio_previsto = p_medio_previsto then
    raise exception 'La ficha ya tiene ese medio previsto.';
  end if;
  select count(*) into v_cuotas from cuota where equipo_torneo_id = p_equipo_torneo_id;
  if v_cuotas > 0 then
    raise exception 'No se puede cambiar el medio previsto de «%»: ya tiene % cuota(s) generadas.', v_ficha.equipo, v_cuotas;
  end if;
  update equipo_torneo set medio_previsto = p_medio_previsto where id = p_equipo_torneo_id;
end;
$function$;

comment on function editar_medio_previsto(uuid, medio_pago) is
  'Cambia el medio previsto de una ficha SOLO si no tiene cuotas todavia. Pensada para editar un torneo clonado antes de confirmar.';
