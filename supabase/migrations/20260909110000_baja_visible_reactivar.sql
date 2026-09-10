-- ─────────────────────────────────────────────────────────────────────────────
-- El detalle del torneo se entera de la baja + la vuelta atrás
--
-- ── El bug que arregla ─────────────────────────────────────────────────────
--
-- Facu dio de baja el Apertura 2027, volvió a entrar al torneo, y el detalle
-- le ofrecía «Dar de baja» otra vez, como si nada hubiera pasado. La baja SÍ
-- había persistido (activo=false): el problema era que `v_torneo_listo` —la
-- vista que alimenta el detalle— no exponía `activo`, así que la pantalla no
-- tenía forma de saberlo. La lista /torneos sí lo mostraba; el detalle no.
--
-- `activo` se agrega AL FINAL: create or replace view solo permite apilar
-- columnas nuevas al final. El resto se transcribe tal cual está en la base.
--
-- ── Y la vuelta atrás, que no existía en ningún lado ───────────────────────
--
-- La UI de la baja decía «se deshace poniendo activo de nuevo en true» — y no
-- había ningún botón ni función que lo hiciera. `reactivar_torneo` es esa
-- puerta: guarda de admin (el mismo rol que da de baja), y exige que el torneo
-- esté efectivamente de baja — reactivar lo activo no es idempotencia inocua,
-- es señal de que alguien está operando sobre el torneo equivocado.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_torneo_listo as
 SELECT id AS torneo_id,
    nombre,
    estado,
    (( SELECT count(*) AS count
           FROM categoria c
          WHERE c.torneo_id = t.id))::integer AS categorias,
    (( SELECT count(*) AS count
           FROM serie s
             JOIN categoria c ON c.id = s.categoria_id
          WHERE c.torneo_id = t.id))::integer AS series,
    (( SELECT count(*) AS count
           FROM plan_tarifa p
          WHERE p.torneo_id = t.id AND p.activo))::integer AS planes,
    (( SELECT count(*) AS count
           FROM equipo_torneo et
          WHERE et.torneo_id = t.id))::integer AS fichas,
    (( SELECT count(*) AS count
           FROM jornada j
             JOIN serie s ON s.id = j.serie_id
             JOIN categoria c ON c.id = s.categoria_id
          WHERE c.torneo_id = t.id))::integer AS jornadas,
    (( SELECT count(*) AS count
           FROM jornada j
             JOIN serie s ON s.id = j.serie_id
             JOIN categoria c ON c.id = s.categoria_id
          WHERE c.torneo_id = t.id AND j.fecha IS NULL))::integer AS jornadas_sin_fecha,
    (( SELECT count(*) AS count
           FROM cuota q
             JOIN equipo_torneo et ON et.id = q.equipo_torneo_id
          WHERE et.torneo_id = t.id))::integer AS cuotas,
    (EXISTS ( SELECT 1
           FROM cuota q
             JOIN equipo_torneo et ON et.id = q.equipo_torneo_id
          WHERE et.torneo_id = t.id)) AS confirmado,
    array_remove(ARRAY[
        CASE
            WHEN (( SELECT count(*) AS count
               FROM categoria c
              WHERE c.torneo_id = t.id)) = 0 THEN 'estructura: no hay categorías'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM serie s
                 JOIN categoria c ON c.id = s.categoria_id
              WHERE c.torneo_id = t.id)) = 0 THEN 'estructura: no hay series'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM plan_tarifa p
              WHERE p.torneo_id = t.id AND p.activo)) = 0 THEN 'tarifario: no hay planes activos'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM equipo_torneo et
              WHERE et.torneo_id = t.id)) = 0 THEN 'equipos: no hay fichas'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM jornada j
                 JOIN serie s ON s.id = j.serie_id
                 JOIN categoria c ON c.id = s.categoria_id
              WHERE c.torneo_id = t.id)) = 0 THEN 'calendario: no hay jornadas — sin esto las cuotas por fecha no se pueden generar'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM jornada j
                 JOIN serie s ON s.id = j.serie_id
                 JOIN categoria c ON c.id = s.categoria_id
              WHERE c.torneo_id = t.id AND j.fecha IS NULL)) > 0 THEN 'calendario: hay jornadas sin fecha — la cuota vence con su jornada'::text
            ELSE NULL::text
        END], NULL::text) AS falta,
    array_remove(ARRAY[
        CASE
            WHEN estado <> 'planificado'::text THEN format('está %s, y un torneo que empezó es historia'::text, estado)
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM cuota q
                 JOIN equipo_torneo et ON et.id = q.equipo_torneo_id
              WHERE et.torneo_id = t.id)) > 0 THEN format('tiene %s cuotas generadas'::text, ( SELECT count(*) AS count
               FROM cuota q
                 JOIN equipo_torneo et ON et.id = q.equipo_torneo_id
              WHERE et.torneo_id = t.id))
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM asiento
              WHERE asiento.torneo_id = t.id)) > 0 THEN format('%s asientos lo referencian'::text, ( SELECT count(*) AS count
               FROM asiento
              WHERE asiento.torneo_id = t.id))
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM gasto
              WHERE gasto.torneo_id = t.id)) > 0 THEN format('%s gastos lo referencian'::text, ( SELECT count(*) AS count
               FROM gasto
              WHERE gasto.torneo_id = t.id))
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM presupuesto
              WHERE presupuesto.torneo_id = t.id)) > 0 THEN format('%s presupuestos lo referencian'::text, ( SELECT count(*) AS count
               FROM presupuesto
              WHERE presupuesto.torneo_id = t.id))
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM reclamo
              WHERE reclamo.torneo_id = t.id)) > 0 THEN format('%s reclamos lo referencian'::text, ( SELECT count(*) AS count
               FROM reclamo
              WHERE reclamo.torneo_id = t.id))
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM compromiso
              WHERE compromiso.torneo_id = t.id)) > 0 THEN format('%s compromisos lo referencian'::text, ( SELECT count(*) AS count
               FROM compromiso
              WHERE compromiso.torneo_id = t.id))
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM movimiento_fondo
              WHERE movimiento_fondo.torneo_id = t.id)) > 0 THEN format('%s movimientos de fondo lo referencian'::text, ( SELECT count(*) AS count
               FROM movimiento_fondo
              WHERE movimiento_fondo.torneo_id = t.id))
            ELSE NULL::text
        END,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM gasto_planificado
              WHERE gasto_planificado.torneo_id = t.id)) > 0 THEN format('%s gastos planificados lo referencian'::text, ( SELECT count(*) AS count
               FROM gasto_planificado
              WHERE gasto_planificado.torneo_id = t.id))
            ELSE NULL::text
        END], NULL::text) AS impide_borrar
,
    t.activo
   FROM torneo t;

create or replace function public.reactivar_torneo(p_torneo_id uuid)
returns void
language plpgsql
as $$
declare
  v_t record;
begin
  if not (coalesce(auth_rol(), '') = 'admin') then
    raise exception
      'Reactivar un torneo es de administrador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select nombre, activo into v_t from torneo where id = p_torneo_id;
  if not found then
    raise exception 'El torneo % no existe', p_torneo_id;
  end if;

  if v_t.activo then
    raise exception 'El torneo «%» ya está activo: no hay nada que reactivar.', v_t.nombre;
  end if;

  update torneo set activo = true where id = p_torneo_id;
end;
$$;

comment on function public.reactivar_torneo(uuid) is
  'Deshace la baja lógica de un torneo (activo=true). Sólo admin. Falla si ya está activo.';
