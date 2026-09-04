-- ─────────────────────────────────────────────────────────────────────────────
-- Qué va a generar la confirmación, antes de confirmarla
--
-- Nivel A, parte 4.
--
-- Confirmar materializa las cuotas de todas las fichas, y es irreversible sin
-- anularlas una por una. Mostrar antes cuántas y por cuánto no es un lujo: es
-- la diferencia entre apretar sabiendo y apretar a ver qué pasa.
--
-- ── Se calcula igual que generar_cuotas_ficha, sin insertar ────────────────
--
-- La expansión es la misma: las líneas `fecha_fija` y `bloque_adelantado` dan
-- una cuota cada una; las `por_partido` dan una por jornada no suspendida en su
-- rango. Y el precio sale del `medio_previsto` de la ficha, como allá.
--
-- Que el previo y la función real sean dos lugares es un riesgo conocido —si
-- una cambia, la otra queda vieja—. Se acepta porque la alternativa sería que
-- `generar_cuotas_ficha` tuviera un modo «simulación», y eso agrega una rama
-- dentro de la función que escribe: peor lugar para equivocarse. El previo se
-- verifica contra el resultado real en la prueba del flujo completo.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_previo_confirmar as
with lineas as (
  select
    et.torneo_id,
    et.id as equipo_torneo_id,
    et.serie_id,
    l.id as linea_id,
    l.regla,
    l.es_playoff,
    l.fecha_desde,
    l.fecha_hasta,
    case et.medio_previsto
      when 'efectivo' then l.precio_efectivo
      else                 l.precio_transferencia
    end as monto
  from equipo_torneo et
    join plan_tarifa p on p.id in (et.plan_inscripcion_id, et.plan_partidos_id)
    join plan_tarifa_linea l on l.plan_tarifa_id = p.id
  where not exists (select 1 from cuota q where q.equipo_torneo_id = et.id)
),
expandidas as (
  select torneo_id, monto from lineas
   where regla in ('fecha_fija', 'bloque_adelantado')

  union all

  select l.torneo_id, l.monto
    from lineas l
    join jornada j
      on  j.serie_id = l.serie_id
      and not j.es_playoff
      and j.estado <> 'suspendida'
      and j.numero between l.fecha_desde and l.fecha_hasta
   where l.regla = 'por_partido' and not l.es_playoff
)
select
  torneo_id,
  count(*)::int as cuotas,
  coalesce(sum(monto), 0)::numeric(16,2) as monto
from expandidas
group by torneo_id;

comment on view v_previo_confirmar is
  'Cuántas cuotas y por cuánto generaría confirmar un torneo. Sólo cuenta fichas SIN cuotas, que son las que confirmar tocaría.';
