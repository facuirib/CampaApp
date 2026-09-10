-- ─────────────────────────────────────────────────────────────────────────────
-- El borrado de torneo, arreglado: las policies que faltaban + el cinturón
--
-- ── El bug ─────────────────────────────────────────────────────────────────
--
-- `torneo` y `equipo_torneo` tenían policies de insert, select y update — y
-- NINGUNA de delete. RLS deniega el DELETE en silencio: 0 filas, sin error.
-- `borrar_torneo` corre con los permisos de quien llama, así que sus dos
-- `delete` explícitos no borraban nada... y la función devolvía «borrado»
-- igual, porque nunca verificaba el row_count del torneo. La UI redirigía a
-- /torneos y el torneo seguía en la lista.
--
-- Resultado: nadie podía borrar ningún torneo desde la app, y encima la app
-- decía que sí. Encontrado por Facu intentando borrar «Prueba Clon».
--
-- ── El arreglo, en dos capas ───────────────────────────────────────────────
--
-- 1. Las policies de DELETE, con el rol nombrado (lección del Nivel C: nunca
--    `_autenticado`). Sólo admin, igual que la guarda de `borrar_torneo`.
--
--    Sólo estas dos tablas: el resto de lo que el borrado arrastra —categoría,
--    serie, jornada, plan_tarifa, plan_tarifa_linea— cae por FK ON DELETE
--    CASCADE, y las acciones referenciales de Postgres NO pasan por RLS.
--
-- 2. El cinturón en la función: verificar el row_count del delete del torneo
--    y explotar si dio 0. Con las policies puestas no debería pasar nunca —
--    esto protege contra la próxima regresión de policies, para que un borrado
--    denegado vuelva a verse como error y no como éxito.
-- ─────────────────────────────────────────────────────────────────────────────

create policy torneo_delete_rol on torneo
  for delete to authenticated
  using (auth_rol() = 'admin');

create policy equipo_torneo_delete_rol on equipo_torneo
  for delete to authenticated
  using (auth_rol() = 'admin');

create or replace function public.borrar_torneo(p_torneo_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_t        record;
  v_cuotas   int;
  v_monto    numeric(16,2);
  v_refs     text[] := '{}';
  v_n        int;
  v_fichas   int;
  v_borrados int;
begin
  if not (coalesce(auth_rol(), '') = 'admin') then
    raise exception
      'Borrar un torneo es de administrador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select id, nombre, estado, activo into v_t from torneo where id = p_torneo_id;
  if not found then
    raise exception 'El torneo % no existe', p_torneo_id;
  end if;

  -- ── Freno 1 · sólo planificado ──────────────────────────────────────────
  if v_t.estado <> 'planificado' then
    update torneo set activo = false where id = p_torneo_id;
    return jsonb_build_object(
      'resultado', 'baja_logica',
      'motivo', format(
        'El torneo está %s, no planificado: un torneo que empezó es historia y no se borra. '
        'Se dio de baja para sacarlo de la lista.', v_t.estado));
  end if;

  -- ── Freno 2 · sin cuotas ────────────────────────────────────────────────
  select count(*), coalesce(sum(q.monto), 0) into v_cuotas, v_monto
    from cuota q join equipo_torneo et on et.id = q.equipo_torneo_id
   where et.torneo_id = p_torneo_id;

  if v_cuotas > 0 then
    update torneo set activo = false where id = p_torneo_id;
    return jsonb_build_object(
      'resultado', 'baja_logica',
      'motivo', format(
        'Tiene %s cuotas generadas por $%s: hay plata comprometida con los equipos. '
        'Se dio de baja en vez de borrarlo.', v_cuotas, v_monto));
  end if;

  -- ── Freno 3 · sin referencias ───────────────────────────────────────────
  select count(*) into v_n from asiento where torneo_id = p_torneo_id;
  if v_n > 0 then v_refs := v_refs || format('%s asiento(s)', v_n); end if;

  select count(*) into v_n from gasto where torneo_id = p_torneo_id;
  if v_n > 0 then v_refs := v_refs || format('%s gasto(s)', v_n); end if;

  select count(*) into v_n from presupuesto where torneo_id = p_torneo_id;
  if v_n > 0 then v_refs := v_refs || format('%s presupuesto(s)', v_n); end if;

  select count(*) into v_n from reclamo where torneo_id = p_torneo_id;
  if v_n > 0 then v_refs := v_refs || format('%s reclamo(s)', v_n); end if;

  select count(*) into v_n from compromiso where torneo_id = p_torneo_id;
  if v_n > 0 then v_refs := v_refs || format('%s compromiso(s)', v_n); end if;

  select count(*) into v_n from movimiento_fondo where torneo_id = p_torneo_id;
  if v_n > 0 then v_refs := v_refs || format('%s movimiento(s) de fondo', v_n); end if;

  select count(*) into v_n from gasto_planificado where torneo_id = p_torneo_id;
  if v_n > 0 then v_refs := v_refs || format('%s gasto(s) planificado(s)', v_n); end if;

  if array_length(v_refs, 1) > 0 then
    update torneo set activo = false where id = p_torneo_id;
    return jsonb_build_object(
      'resultado', 'baja_logica',
      'motivo', format(
        'Hay cosas que lo referencian: %s. Borrarlo las dejaría apuntando a la nada. '
        'Se dio de baja en vez de borrarlo.', array_to_string(v_refs, ', ')));
  end if;

  -- ── Se puede borrar ─────────────────────────────────────────────────────
  -- Las fichas primero: equipo_torneo es NO ACTION. El resto cae solo —
  -- categoria → serie → jornada, y plan_tarifa → plan_tarifa_linea.
  delete from equipo_torneo where torneo_id = p_torneo_id;
  get diagnostics v_fichas = row_count;

  delete from torneo where id = p_torneo_id;
  get diagnostics v_borrados = row_count;

  -- 🔴 El cinturón. RLS deniega DELETE en silencio —0 filas, sin excepción— y
  -- esta función ya reportó una vez «borrado» sobre un torneo que seguía ahí.
  -- Si el delete no borró, es un error y se dice: nunca más un éxito falso.
  if v_borrados = 0 then
    raise exception
      'El torneo «%» no se pudo borrar: el DELETE no afectó ninguna fila. '
      'Lo más probable es que una policy de RLS lo haya denegado en silencio. '
      'No se hizo ningún cambio.', v_t.nombre;
  end if;

  return jsonb_build_object(
    'resultado', 'borrado',
    'motivo', format(
      'Se borró «%s» con sus %s fichas, su estructura y su tarifario.',
      v_t.nombre, v_fichas));
end;
$$;
