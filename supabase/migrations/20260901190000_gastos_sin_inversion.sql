-- ─────────────────────────────────────────────────────────────────────────────
-- El módulo Gastos deja de contar inversión
--
-- D1, commit 3. Comprar un activo no es un gasto: el asiento ya lo sabía
-- —va a BIENES_USO, no al resultado— pero el tablero de Gastos lo sumaba igual.
-- Agosto 2026: $60.050.000 de «gastos», de los cuales $52.900.000 eran
-- inversión. El número grande sobrestimaba el gasto ocho veces.
--
-- ── 🔴 Dónde NO va el filtro, y por qué. Esto es lo importante ─────────────
--
-- El lugar obvio para filtrar era `v_gasto_detalle`, la base de todo. Sería un
-- error, y lo medí antes de tocar nada: esa vista alimenta SEIS vistas, y dos
-- son del cashflow.
--
--   v_gasto_detalle
--     ├── v_gasto_kpi              ← el módulo
--     ├── v_gasto_categoria_mes    ← el módulo
--     ├── v_gasto_naturaleza_mes   ← el módulo
--     ├── v_cashflow_comprometido  🔴 la plata que va a salir
--     ├── v_cashflow_estimado      🔴
--     └── v_activo                 🔴 compra_registrada
--
-- **La compra sale del módulo Gastos, pero NO sale del cashflow**: la plata
-- igual se va. Un activo comprado a crédito es una salida comprometida como
-- cualquier otra, y esconderla del cashflow sería mentir en el único lugar
-- donde el club mira si le alcanza la plata.
--
-- Medido con una compra a crédito de $12.000.000 en rollback:
--
--   cashflow comprometido   285 filas / $247.302.498
--   con la compra cargada   286 filas / $235.302.498      (−$12.000.000)
--
-- Si `v_gasto_detalle` filtrara la inversión, esos $12.000.000 desaparecerían
-- del cashflow. Hoy no habría roto nada —no hay ninguna compra impaga, medido—
-- pero eso es suerte del dato, no del diseño: rompería con la primera compra a
-- plazo, en silencio, y en la pantalla donde menos se perdona.
--
-- Y `v_activo.compra_registrada` se apoya en la misma vista para saber si un
-- activo tiene su compra. Filtrando ahí, el único activo capitalizado pasaría a
-- figurar «Sin compra»: el detector del agujero se rompería justo cuando lo
-- acabamos de cerrar.
--
-- Por eso el filtro va en los TRES AGREGADOS DEL MÓDULO y no en la base
-- compartida. `v_gasto_detalle` no se toca.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_gasto_kpi as
select
  extract(year from devengado_at)::integer  as anio,
  extract(month from devengado_at)::integer as mes,
  count(*)                                                                         as gastos,
  coalesce(sum(total), 0)::numeric(16,2)                                           as total,
  coalesce(sum(total) filter (where estado = 'pagado'), 0)::numeric(16,2)          as pagado,
  coalesce(sum(total) filter (where estado = 'devengado'), 0)::numeric(16,2)       as adeudado,
  count(*) filter (where estado = 'devengado')                                     as gastos_impagos
from v_gasto_detalle
where estado <> 'anulado'
  and naturaleza <> 'inversion'
group by grouping sets (
  ((extract(year from devengado_at))),
  ((extract(year from devengado_at)), (extract(month from devengado_at)))
);

create or replace view v_gasto_naturaleza_mes as
select
  extract(year from devengado_at)::integer  as anio,
  extract(month from devengado_at)::integer as mes,
  naturaleza,
  count(*)                                                                         as gastos,
  coalesce(sum(total), 0)::numeric(16,2)                                           as total,
  coalesce(sum(total) filter (where estado = 'pagado'), 0)::numeric(16,2)          as pagado,
  coalesce(sum(total) filter (where estado = 'devengado'), 0)::numeric(16,2)       as adeudado,
  count(*) filter (where estado = 'devengado')                                     as gastos_impagos
from v_gasto_detalle
where estado <> 'anulado'
  and naturaleza <> 'inversion'
group by 1, 2, naturaleza;

create or replace view v_gasto_categoria_mes as
select
  extract(year from devengado_at)::integer  as anio,
  extract(month from devengado_at)::integer as mes,
  categoria, naturaleza, area,
  count(*)                                                                         as gastos,
  coalesce(sum(total), 0)::numeric(16,2)                                           as total,
  coalesce(sum(total) filter (where estado = 'pagado'), 0)::numeric(16,2)          as pagado,
  coalesce(sum(total) filter (where estado = 'devengado'), 0)::numeric(16,2)       as adeudado,
  cat_gasto_id, torneo_id
from v_gasto_detalle
where estado <> 'anulado'
  and naturaleza <> 'inversion'
group by 1, 2, categoria, naturaleza, area, cat_gasto_id, torneo_id;
