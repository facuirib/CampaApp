-- ═══════════════════════════════════════════════════════════════
-- confirmar_torneo_clonado
-- APLICADA el 30/08/2026.
--
-- El paso "confirmar" del flujo clonar → editar → confirmar → recién
-- ahí proyecta cuotas. Recorre las fichas del torneo que TODAVÍA no
-- tienen cuotas (así que es seguro correrla dos veces: no reprocesa
-- lo que ya tiene cuotas) y llama generar_cuotas_ficha() por cada una.
--
-- Devuelve fichas_procesadas y cuotas_generadas, para que la pantalla
-- pueda mostrar el resultado en vez de solo un "listo".
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirmar_torneo_clonado(p_torneo_id uuid)
 RETURNS TABLE(fichas_procesadas integer, cuotas_generadas integer)
 LANGUAGE plpgsql
AS $function$
declare
  r_ficha            record;
  v_cuotas_ficha      int;
  v_fichas_procesadas int := 0;
  v_cuotas_totales    int := 0;
begin
  if not (coalesce(auth_rol(), '') = 'admin') then
    raise exception 'Confirmar un torneo es de administrador. Tu rol es «%».', coalesce(auth_rol(), 'sin rol');
  end if;
  if not exists (select 1 from torneo where id = p_torneo_id) then
    raise exception 'El torneo % no existe', p_torneo_id;
  end if;
  for r_ficha in
    select et.id from equipo_torneo et
     where et.torneo_id = p_torneo_id
       and not exists (select 1 from cuota c where c.equipo_torneo_id = et.id)
  loop
    v_cuotas_ficha := generar_cuotas_ficha(r_ficha.id);
    v_fichas_procesadas := v_fichas_procesadas + 1;
    v_cuotas_totales := v_cuotas_totales + v_cuotas_ficha;
  end loop;
  return query select v_fichas_procesadas, v_cuotas_totales;
end;
$function$
