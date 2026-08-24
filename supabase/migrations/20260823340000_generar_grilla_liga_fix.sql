-- ═══════════════════════════════════════════════════════════════
-- generar_grilla_liga · reescrita para el modelo actual (por serie)
-- Responde al hallazgo de Facu (23/08): la función insertaba en
-- columnas de jornada que ya no existen (torneo_id, genero) — es
-- precondición del arrastre de fichas.
--
-- Reescrita para el modelo actual:
--  - Recibe p_serie_id (no p_torneo_id) y p_cantidad_fechas (no dos
--    parámetros con default hardcodeado — regla 12 de CLAUDE.md).
--  - Usa crear_jornada() en loop, la puerta que ya existe.
--  - Sin fecha (p_fecha queda NULL en cada jornada) — se asigna después.
--
-- ⚠️ Encontrado al verificar: la variable de control de un
-- "FOR v IN 1..n LOOP" en PL/pgSQL se tipa como integer SIEMPRE,
-- ignorando su declaración explícita (acá v_num smallint). Sin cast en
-- el punto de uso (v_num::smallint), la llamada a crear_jornada fallaba
-- silenciosamente (el exception when others la tragaba) y la función
-- devolvía 0 sin ningún error visible.
-- ═══════════════════════════════════════════════════════════════

drop function if exists generar_grilla_liga(uuid, smallint, smallint);

create or replace function public.generar_grilla_liga(
  p_serie_id        uuid,
  p_cantidad_fechas smallint
)
returns integer
language plpgsql
as $function$
declare
  v_num        smallint;
  v_insertadas integer := 0;
begin
  if not exists (select 1 from serie where id = p_serie_id) then
    raise exception 'La serie % no existe', p_serie_id;
  end if;

  if p_cantidad_fechas is null or p_cantidad_fechas < 1 then
    raise exception
      'La cantidad de fechas debe ser positiva (se recibió %)', p_cantidad_fechas;
  end if;

  for v_num in 1..p_cantidad_fechas loop
    begin
      perform crear_jornada(p_serie_id, v_num::smallint, null::date);
      v_insertadas := v_insertadas + 1;
    exception when others then
      null;
    end;
  end loop;

  return v_insertadas;
end;
$function$;

comment on function generar_grilla_liga(uuid, smallint) is
  'Siembra el calendario de una serie con N fechas vacías (sin día '
  'asignado). Reescrita 23/08 para el modelo por serie — la versión '
  'anterior insertaba en columnas de jornada que ya no existen '
  '(torneo_id, genero). Usa crear_jornada() en loop.';