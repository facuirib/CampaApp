-- ═══════════════════════════════════════════════════════════════
-- v_gasto_detalle + v_gasto_categoria_mes — exponer cat_gasto_id/torneo_id
--
-- PROPUESTA, NO APLICAR sin revisión — responde al pedido de Facu en
-- coordinacion.md (19/08, "Presupuesto · estado y plan"): "presupuesto vs
-- real" necesita cruzar por cat_gasto_id, no por nombre de categoría
-- (texto) — un renombre rompe el cruce en silencio, y ya pasó una vez
-- (776ddf9, reordenamiento del plan de cuentas). Y v_gasto_categoria_mes
-- necesita torneo_id para comparar un torneo contra su propio presupuesto
-- (que se organiza por torneo vs estructura con torneo_id NULL).
--
-- "Sin apuro, no bloquea nada" (Facu) — la carga de presupuesto no
-- depende de esto, es para cuando se construya la comparación.
--
-- ── Corregido antes de aplicar ─────────────────────────────────────────
--
-- La primera versión insertaba las columnas nuevas EN EL MEDIO del select
-- (cat_gasto_id antes de categoria, torneo_id después de area). Postgres
-- sólo permite agregar columnas AL FINAL en un CREATE OR REPLACE VIEW —
-- insertarlas antes corre de posición a todo lo que sigue, y Postgres lo
-- lee como un rename: falló con
--   ERROR 42P16: cannot change name of view column "categoria" to "cat_gasto_id"
-- Mismo problema que ya resolvió 20260812163452_v_gasto_detalle_pago_y_jornada
-- ("Cinco columnas al final -lo único que create or replace view permite-").
--
-- Además: `torneo_id` YA está en v_gasto_detalle desde esa misma migración
-- (12/08, columna 7) — no es una columna nueva. Lo único que le falta a
-- v_gasto_detalle es `cat_gasto_id`. La vista que sí necesita `torneo_id`
-- nuevo es v_gasto_categoria_mes, que agrupa por categoría y no lo traía.
--
-- Se corrige el archivo EN EL LUGAR y no con una migración aparte: todavía
-- no se había aplicado, así que la vista nunca llega a existir con el error
-- y el historial no queda con un bug seguido de su parche.
--
-- Las 27 columnas de v_gasto_detalle y las 9 de v_gasto_categoria_mes
-- quedan idénticas en nombre, tipo y posición. Sólo se agrega al final de
-- cada una lo que corresponde.
--
-- OJO: agregar torneo_id al GROUP BY de v_gasto_categoria_mes cambia su
-- granularidad — antes "Alquileres" de distintos torneos se mezclaba en
-- una fila, ahora se separa por torneo. Es lo que pide la comparación,
-- pero es un cambio de forma, no solo una columna extra.
-- ═══════════════════════════════════════════════════════════════

create or replace view public.v_gasto_detalle as
select
  g.id as gasto_id,
  coalesce(cg.nombre, g.concepto_libre) as concepto,
  g.concepto_id is null as es_libre,
  cat.nombre as categoria,
  cat.naturaleza,
  cat.area,
  g.torneo_id,
  t.nombre as torneo,
  g.predio_id,
  p.nombre as predio,
  g.jornada_id,
  g.activo_id,
  g.arancel,
  g.cantidad,
  g.total,
  g.devengado_at,
  g.pagado_at,
  g.medio_pago,
  case
    when adev.anulado_por is not null then 'anulado'
    when g.pagado_at is not null      then 'pagado'
    else                                   'devengado'
  end as estado,
  g.asiento_dev_id,
  g.asiento_pag_id,
  j.numero as jornada_numero,
  j.fecha  as jornada_fecha,
  apag.created_by                as pagado_por_id,
  email_usuario(apag.created_by) as pagado_por,
  (select string_agg(c.codigo, ' + ' order by c.codigo)
     from asiento_linea l
     join cuenta c on c.id = l.cuenta_id
    where l.asiento_id = g.asiento_pag_id and l.haber > 0) as caja_pago,
  ppag.nombre as predio_pago,

  -- ── Lo nuevo, al final: cat_gasto_id (19/08) ──────────────────────────
  -- Para que presupuesto-vs-real cruce por id, no por nombre de categoría
  -- (texto) — un renombre del plan de cuentas rompía el cruce en silencio.
  g.cat_gasto_id

from gasto g
join cat_gasto cat          on cat.id = g.cat_gasto_id
left join concepto_gasto cg on cg.id = g.concepto_id
left join torneo t          on t.id = g.torneo_id
left join predio p          on p.id = g.predio_id
left join asiento adev      on adev.id = g.asiento_dev_id
left join jornada j         on j.id = g.jornada_id
left join asiento apag      on apag.id = g.asiento_pag_id
left join predio ppag       on ppag.id = apag.predio_id;

comment on view public.v_gasto_detalle is
  'Un gasto por fila, con su categoria, su estado (anulado/pagado/devengado), la jornada a la que pertenece si es por_fecha, quien lo pago y de que caja(s) salio. caja_pago usa string_agg y no limit 1: si un pago saliera de dos cajas, lo dice en vez de mostrar una sola como si fuera todo. cat_gasto_id agregado 19/08 (al final, aditivo) para que presupuesto-vs-real cruce por id, no por nombre de categoria.';


create or replace view public.v_gasto_categoria_mes as
select
  extract(year  from devengado_at)::int as anio,
  extract(month from devengado_at)::int as mes,
  categoria,
  naturaleza,
  area,
  count(*)                                                                  as gastos,
  coalesce(sum(total), 0)::numeric(16,2)                                    as total,
  coalesce(sum(total) filter (where estado = 'pagado'), 0)::numeric(16,2)    as pagado,
  coalesce(sum(total) filter (where estado = 'devengado'), 0)::numeric(16,2) as adeudado,

  -- ── Lo nuevo, al final: cat_gasto_id + torneo_id (19/08) ──────────────
  -- cat_gasto_id para cruzar contra presupuesto por id, no por nombre.
  -- torneo_id para comparar un torneo contra su propio presupuesto (NULL =
  -- estructura permanente). Entra al GROUP BY: separa filas que antes se
  -- mezclaban ("Alquileres" de dos torneos distintos, antes una fila, ahora
  -- dos) — cambio de granularidad, no solo una columna extra.
  cat_gasto_id,
  torneo_id

from v_gasto_detalle
where estado <> 'anulado'
group by 1, 2, 3, 4, 5, cat_gasto_id, torneo_id;

comment on view public.v_gasto_categoria_mes is
  'Gastos por categoria y mes, con su naturaleza y area para colorear. Alimenta el grafico de categorias de /gastos. Excluye anulados. cat_gasto_id y torneo_id agregados 19/08 (al final, aditivo, entran al GROUP BY) para comparar el gasto de un torneo contra su propio presupuesto (torneo_id NULL = estructura permanente).';