-- ═══════════════════════════════════════════════════════════════════════
-- v_gasto_detalle · el desglose del pago y la fecha del gasto
--
-- Cinco columnas al final -lo único que create or replace view permite-. Las
-- 21 anteriores quedan idénticas en nombre, tipo y posición, así que los dos
-- consumidores (/gastos y /gastos/[id]/pagar, los dos con select *) no se
-- enteran.
--
-- Contestan tres preguntas que el modelo YA respondía y la vista no exponía:
--
--   · «¿a qué fecha pertenece este gasto?» — había jornada_id, un uuid.
--   · «¿quién lo pagó?» — estaba en asiento.created_by del asiento de pago.
--   · «¿de dónde salió la plata?» — en la línea al haber de ese asiento.
-- ═══════════════════════════════════════════════════════════════════════
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

  -- ── Lo nuevo, al final ───────────────────────────────────────────────

  -- La jornada, para los gastos `por_fecha`. Van el NÚMERO y la FECHA: la
  -- jornada es por SERIE, así que «Fecha 1» son varias filas con días
  -- distintos. Sólo el número no alcanza para ubicar el gasto.
  j.numero as jornada_numero,
  j.fecha  as jornada_fecha,

  -- Quién pagó. Van los dos: el uuid y el email ya resuelto.
  --
  -- `email_usuario` es SECURITY DEFINER y corre una vez por fila. Con el
  -- volumen de hoy es irrelevante, y si algún día pesara, el uuid ya está en
  -- la vista y el front puede resolverlo con una sola llamada por usuario
  -- distinto — sin tocar la vista.
  apag.created_by                as pagado_por_id,
  email_usuario(apag.created_by) as pagado_por,

  -- De qué caja salió. `string_agg` y NO `limit 1`.
  --
  -- Hoy siempre es una sola: `pagar_gasto` recibe un único medio, y está
  -- verificado que ningún asiento de pago tiene más de una línea al haber.
  -- Pero un asiento manual o un pago repartido en el futuro darían dos, y con
  -- `limit 1` la pantalla mostraría UNA CAJA COMO SI FUERA TODO EL PAGO —
  -- mentiría sin avisar. Con string_agg dice «CAJA_EFECTIVO + CAJA_TRANSFERENCIA»
  -- y el que lee se da cuenta.
  (select string_agg(c.codigo, ' + ' order by c.codigo)
     from asiento_linea l
     join cuenta c on c.id = l.cuenta_id
    where l.asiento_id = g.asiento_pag_id and l.haber > 0) as caja_pago,

  -- El predio del PAGO, que no es el mismo dato que `gasto.predio_id`: ése es
  -- dónde ocurrió el gasto; éste, de qué caja física salió la plata. Sólo lo
  -- tienen los pagos en efectivo.
  ppag.nombre as predio_pago

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
  'Un gasto por fila, con su categoria, su estado (anulado/pagado/devengado) y -desde 20260812- la jornada a la que pertenece si es por_fecha, quien lo pago y de que caja(s) salio. caja_pago usa string_agg y no limit 1: si un pago saliera de dos cajas, lo dice en vez de mostrar una sola como si fuera todo.';
