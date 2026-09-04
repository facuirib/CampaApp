-- ─────────────────────────────────────────────────────────────────────────────
-- Si un torneo se puede borrar, y qué lo frena
--
-- Nivel A, la UI de eliminar.
--
-- `borrar_torneo` ya decide y explica, pero lo hace DESPUÉS del click. Para que
-- el botón pueda nombrar lo que de verdad va a pasar —«Eliminar» o «Dar de
-- baja»— la pantalla necesita saberlo antes.
--
-- Un botón que dice «Eliminar» y siempre termina dando de baja miente dos
-- veces: promete lo que no hace, y esconde que existe una acción distinta que
-- sí funciona.
--
-- Las condiciones son EXACTAMENTE las de la función. Si alguna vez se separan,
-- el botón diría una cosa y pasaría otra — por eso van pegadas y con el mismo
-- orden y los mismos textos.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_torneo_listo as
select
  t.id as torneo_id,
  t.nombre,
  t.estado,
  (select count(*) from categoria c where c.torneo_id = t.id)::int as categorias,
  (select count(*) from serie s join categoria c on c.id = s.categoria_id
    where c.torneo_id = t.id)::int as series,
  (select count(*) from plan_tarifa p where p.torneo_id = t.id and p.activo)::int as planes,
  (select count(*) from equipo_torneo et where et.torneo_id = t.id)::int as fichas,
  (select count(*) from jornada j join serie s on s.id = j.serie_id
     join categoria c on c.id = s.categoria_id
    where c.torneo_id = t.id)::int as jornadas,
  (select count(*) from jornada j join serie s on s.id = j.serie_id
     join categoria c on c.id = s.categoria_id
    where c.torneo_id = t.id and j.fecha is null)::int as jornadas_sin_fecha,
  (select count(*) from cuota q join equipo_torneo et on et.id = q.equipo_torneo_id
    where et.torneo_id = t.id)::int as cuotas,
  (exists (select 1 from cuota q join equipo_torneo et on et.id = q.equipo_torneo_id
            where et.torneo_id = t.id)) as confirmado,
  array_remove(array[
    case when (select count(*) from categoria c where c.torneo_id = t.id) = 0
         then 'estructura: no hay categorías' end,
    case when (select count(*) from serie s join categoria c on c.id = s.categoria_id
                where c.torneo_id = t.id) = 0
         then 'estructura: no hay series' end,
    case when (select count(*) from plan_tarifa p where p.torneo_id = t.id and p.activo) = 0
         then 'tarifario: no hay planes activos' end,
    case when (select count(*) from equipo_torneo et where et.torneo_id = t.id) = 0
         then 'equipos: no hay fichas' end,
    case when (select count(*) from jornada j join serie s on s.id = j.serie_id
                 join categoria c on c.id = s.categoria_id where c.torneo_id = t.id) = 0
         then 'calendario: no hay jornadas — sin esto las cuotas por fecha no se pueden generar' end,
    case when (select count(*) from jornada j join serie s on s.id = j.serie_id
                 join categoria c on c.id = s.categoria_id
                where c.torneo_id = t.id and j.fecha is null) > 0
         then 'calendario: hay jornadas sin fecha — la cuota vence con su jornada' end
  ], null) as falta,
  -- ── Lo nuevo: qué impide BORRARLO ───────────────────────────────────────
  array_remove(array[
    case when t.estado <> 'planificado'
         then format('está %s, y un torneo que empezó es historia', t.estado) end,
    case when (select count(*) from cuota q join equipo_torneo et on et.id = q.equipo_torneo_id
                where et.torneo_id = t.id) > 0
         then format('tiene %s cuotas generadas',
                (select count(*) from cuota q join equipo_torneo et on et.id = q.equipo_torneo_id
                  where et.torneo_id = t.id)) end,
    case when (select count(*) from asiento where torneo_id = t.id) > 0
         then format('%s asientos lo referencian', (select count(*) from asiento where torneo_id = t.id)) end,
    case when (select count(*) from gasto where torneo_id = t.id) > 0
         then format('%s gastos lo referencian', (select count(*) from gasto where torneo_id = t.id)) end,
    case when (select count(*) from presupuesto where torneo_id = t.id) > 0
         then format('%s presupuestos lo referencian', (select count(*) from presupuesto where torneo_id = t.id)) end,
    case when (select count(*) from reclamo where torneo_id = t.id) > 0
         then format('%s reclamos lo referencian', (select count(*) from reclamo where torneo_id = t.id)) end,
    case when (select count(*) from compromiso where torneo_id = t.id) > 0
         then format('%s compromisos lo referencian', (select count(*) from compromiso where torneo_id = t.id)) end,
    case when (select count(*) from movimiento_fondo where torneo_id = t.id) > 0
         then format('%s movimientos de fondo lo referencian', (select count(*) from movimiento_fondo where torneo_id = t.id)) end,
    case when (select count(*) from gasto_planificado where torneo_id = t.id) > 0
         then format('%s gastos planificados lo referencian', (select count(*) from gasto_planificado where torneo_id = t.id)) end
  ], null) as impide_borrar
from torneo t;

comment on view v_torneo_listo is
  'La lista de control de un torneo. `falta` vacío = se puede confirmar. `impide_borrar` vacío = se puede borrar de verdad; con algo = borrar_torneo lo daría de baja lógica.';
