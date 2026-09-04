-- ─────────────────────────────────────────────────────────────────────────────
-- Borrar un torneo, o darlo de baja si no se puede
--
-- Nivel A, parte 5.
--
-- ── Por qué no alcanzaba con un delete ─────────────────────────────────────
--
-- No había función ni policy de DELETE sobre `torneo`, así que borrar uno era
-- imposible desde la app. Y hacerlo a mano sería peligroso: de las diez FK que
-- apuntan a `torneo`, sólo `categoria` y `plan_tarifa` están en CASCADE. Las
-- otras ocho son NO ACTION, o sea que el delete revienta con un error de
-- constraint que no le dice nada a nadie.
--
-- Esta función decide ANTES de intentar, y explica.
--
-- ── Los tres frenos ────────────────────────────────────────────────────────
--
--   1. sólo `planificado` — un torneo en curso o cerrado es historia, y la
--      historia no se borra. Para eso está anular, no borrar.
--   2. sin cuotas — con cuotas hay plata comprometida con equipos.
--   3. sin referencias — asientos, gastos, presupuesto, reclamos, compromisos
--      o movimientos de fondo que lo nombren.
--
-- Cada uno dice QUÉ lo frena y con cuánto, porque «no se puede» sin el motivo
-- obliga a adivinar.
--
-- ── Y si algo frena, no falla: da de baja ──────────────────────────────────
--
-- Levantar una excepción dejaría al operador sin salida frente a un torneo que
-- quiere sacar de la lista y no puede borrar. `activo = false` es exactamente
-- para eso desde que el ciclo de torneo separó los dos significados —`estado`
-- es la verdad, `activo` es la baja lógica— y hasta hoy ese campo no tenía
-- quien lo escribiera.
--
-- Devuelve un jsonb con `resultado` y `motivo`, no un texto suelto: si sólo
-- dijera 'baja_logica', la pantalla tendría que adivinar por qué, y el operador
-- vería «no se pudo» sin saber qué resolver. El motivo se arma con los números
-- reales — «tiene 273 cuotas», «12 asientos» — porque un freno sin cantidad no
-- se puede accionar.
--
-- 🔴 NO recibe un `p_motivo`. `torneo` no tiene dónde guardarlo, y aceptar un
-- parámetro que se ignora es peor que no tenerlo: el que llama cree que quedó
-- registrado. (`cerrar_torneo` arrastra ese vicio — recibe motivo y no lo
-- guarda; no lo replicamos.)
--
-- ── El orden del delete ────────────────────────────────────────────────────
--
-- `equipo_torneo` es NO ACTION, así que las fichas se borran explícitamente
-- antes. Y está bien que sea así: si una ficha no se pudiera borrar, el torneo
-- tampoco debería.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.borrar_torneo(
  p_torneo_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_t        record;
  v_cuotas   int;
  v_monto    numeric(16,2);
  v_refs     text[] := '{}';
  v_n        int;
  v_fichas   int;
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

  return jsonb_build_object(
    'resultado', 'borrado',
    'motivo', format(
      'Se borró «%s» con sus %s fichas, su estructura y su tarifario.',
      v_t.nombre, v_fichas));
end;
$$;

comment on function borrar_torneo(uuid) is
  'Borra un torneo planificado sin cuotas ni referencias. Si algo lo frena, lo da de baja lógica (activo=false) en vez de fallar. Devuelve jsonb {resultado, motivo}.';
