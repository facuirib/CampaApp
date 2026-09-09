-- ─────────────────────────────────────────────────────────────────────────────
-- Editar los datos de un torneo
--
-- No existía: ni función ni pantalla. Un typo en el nombre de un torneo era
-- para siempre — la única salida era SQL a mano contra la base compartida.
--
-- ── Qué edita y qué NO ─────────────────────────────────────────────────────
--
-- Edita lo DESCRIPTIVO: nombre, año, temporada y el ejercicio al que pertenece.
-- No toca el estado (para eso está el ciclo: iniciar/cerrar/reabrir), no toca
-- `activo` (para eso están la baja y reactivar), y no toca nada generado —
-- fichas, cuotas, calendario, tarifario tienen sus propias puertas.
--
-- `null` significa «no tocar», igual que en `editar_linea_presupuesto`. Por
-- eso el ejercicio se puede ASIGNAR pero no des-asignar desde acá: no hay
-- forma de distinguir «dejalo» de «borralo», y desasignar el ejercicio de un
-- torneo con movimientos es una decisión contable que no debería estar a un
-- null de distancia.
--
-- ── La guarda ──────────────────────────────────────────────────────────────
--
-- admin · operador, como crear_torneo. Va como guarda interna y no confiando
-- en la policy de UPDATE de `torneo`, que es `_autenticado`: la función es más
-- estricta que la policy, el patrón documentado en lib/permisos.ts.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.editar_torneo(
  p_torneo_id  uuid,
  p_nombre     text default null,
  p_anio       integer default null,
  p_temporada  temporada default null,
  p_ejercicio_id uuid default null
) returns void
language plpgsql
as $$
begin
  if not (coalesce(auth_rol(), '') in ('admin', 'operador')) then
    raise exception
      'Editar un torneo es de administrador u operador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  if not exists (select 1 from torneo where id = p_torneo_id) then
    raise exception 'El torneo % no existe', p_torneo_id;
  end if;

  if p_nombre is null and p_anio is null and p_temporada is null and p_ejercicio_id is null then
    raise exception 'No se pasó ningún campo para editar';
  end if;

  if p_nombre is not null and btrim(p_nombre) = '' then
    raise exception 'El nombre del torneo no puede quedar vacío';
  end if;

  if p_ejercicio_id is not null
     and not exists (select 1 from ejercicio where id = p_ejercicio_id) then
    raise exception 'El ejercicio % no existe', p_ejercicio_id;
  end if;

  update torneo
     set nombre       = coalesce(btrim(p_nombre), nombre),
         anio         = coalesce(p_anio, anio),
         temporada    = coalesce(p_temporada, temporada),
         ejercicio_id = coalesce(p_ejercicio_id, ejercicio_id)
   where id = p_torneo_id;
end;
$$;

comment on function public.editar_torneo(uuid, text, integer, temporada, uuid) is
  'Edita lo descriptivo del torneo: nombre, año, temporada, ejercicio. NULL = no tocar (el ejercicio se asigna, no se des-asigna). No toca estado ni activo. admin · operador.';
