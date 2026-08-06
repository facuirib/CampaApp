-- ============================================================================
-- CAMPA · v_gasto_detalle — la lista de gastos ejecutados, con su estado
--
-- No había vista para listar gastos: `v_presupuesto_total` es presupuesto, o
-- sea lo que se planea gastar, no lo que se gastó. Ésta expone cada gasto con
-- su categoría (los dos ejes: naturaleza y área), su concepto —de catálogo o
-- libre—, su anclaje, los montos y el estado.
--
-- ── El estado sale del diario, no de una columna ────────────────────────────
--
-- Son tres: anulado · pagado · devengado, y `anulado` tiene prioridad.
--
-- Un gasto son dos asientos (regla 7): el devengo al cargarlo y el pago al
-- pagarlo. Si el devengo se carga por error, se contraasienta con
-- `anular_asiento`, y ahí aparecía el hueco: el diario se corregía solo —el
-- original y su contraasiento se compensan— pero la fila de `gasto` quedaba
-- intacta, así que la pantalla seguía mostrando un gasto que contablemente ya
-- no existía.
--
-- Se resuelve LEYENDO el asiento, no agregando una columna `anulado` a
-- `gasto`. Una columna sería una segunda verdad sobre el mismo hecho, y las
-- dos verdades se despegan el día que alguien anule por un camino y se olvide
-- del otro. Acá no puede pasar: si el asiento está anulado, el gasto se ve
-- anulado, sin nada que mantener sincronizado.
--
-- Verificado contra `anular_asiento`: la función marca SOLO el original
-- (`update asiento set anulado_por = v_nuevo where id = p_asiento_id`) y deja
-- el contraasiento con `anulado_por is null`. Por eso la condición es
-- `adev.anulado_por is not null` sobre el asiento de devengo, y no hace falta
-- excluir contraasientos: un gasto nunca apunta a uno.
--
-- ── Lo que esta vista TODAVÍA no cubre ──────────────────────────────────────
--
-- Si se anula el asiento de PAGO y no el de devengo, `pagado_at` sigue escrito
-- y la fila se muestra 'pagado' aunque el diario diga que no se pagó. Es el
-- mismo hueco, del otro lado. No se toca acá porque `pagado_at` es un dato
-- propio del gasto y no un derivado del asiento: arreglarlo es decidir si el
-- pago también pasa a derivarse del diario, y esa es una decisión de modelo
-- aparte.
--
-- Pendiente relacionado: falta la puerta `anular_gasto()`, que contraasiente
-- el devengo y deje la baja operable. Esta vista hace que el sistema MUESTRE
-- la baja; la puerta hará que se OPERE. Va con la escritura de gastos.
-- ============================================================================

create or replace view public.v_gasto_detalle as
select
  g.id                                            as gasto_id,

  -- El concepto sale del catálogo, y si el gasto no lo usa, del texto libre.
  -- El coalesce no puede dar null: `gasto_check` exige que haya uno de los dos.
  coalesce(cg.nombre, g.concepto_libre)           as concepto,
  (g.concepto_id is null)                         as es_libre,

  cat.nombre                                      as categoria,
  cat.naturaleza,
  cat.area,

  g.torneo_id,
  t.nombre                                        as torneo,
  g.predio_id,
  p.nombre                                        as predio,
  g.jornada_id,
  -- Para los gastos de naturaleza `inversion`: a qué activo fijo se imputó.
  g.activo_id,

  g.arancel,
  g.cantidad,
  g.total,                                        -- generada: arancel * cantidad

  g.devengado_at,
  g.pagado_at,
  g.medio_pago,

  case
    when adev.anulado_por is not null then 'anulado'
    when g.pagado_at is not null      then 'pagado'
    else                                   'devengado'
  end                                             as estado,

  g.asiento_dev_id,
  g.asiento_pag_id

from gasto g
-- Duro a propósito: `gasto.cat_gasto_id` es NOT NULL, así que no puede perder
-- filas en silencio. Todo lo demás cuelga de columnas nullable.
join      cat_gasto      cat  on cat.id  = g.cat_gasto_id
left join concepto_gasto cg   on cg.id   = g.concepto_id
left join torneo         t    on t.id    = g.torneo_id
left join predio         p    on p.id    = g.predio_id
left join asiento        adev on adev.id = g.asiento_dev_id;

comment on view v_gasto_detalle is
  'Lista de gastos ejecutados: categoría (naturaleza + área), concepto de '
  'catálogo o libre, anclaje, activo imputado, montos y estado. El estado '
  '(anulado / pagado / devengado) se deriva del asiento de devengo, no de una '
  'columna en gasto: la anulación vive en el diario y no se duplica.';
