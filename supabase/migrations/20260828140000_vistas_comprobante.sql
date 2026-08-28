-- ═══════════════════════════════════════════════════════════════════════════
-- Las vistas del módulo de consulta de comprobantes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tres, y cada una contesta una pregunta distinta: qué comprobantes hay
-- (`v_comprobante`), cuántos y de qué clase (`v_comprobante_kpi`), y cuánto se
-- facturó desde cada dirección (`v_facturado_por_direccion`).
--
-- Facturas y recibos van JUNTOS en la lista, con `es_factura` para separarlos.
-- Son dos documentos distintos —uno es fiscal y el otro no— pero se buscan en
-- el mismo lugar: «el papel del cobro de tal equipo». Tenerlos en dos pantallas
-- obligaría a saber de antemano cuál se emitió.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view v_comprobante as
select
  c.id,
  c.fecha_emision,
  to_char(c.fecha_emision, 'YYYY-MM')            as periodo,
  extract(year from c.fecha_emision)::int        as anio,

  c.tipo_comprobante,
  case c.tipo_comprobante
    when 0 then 'Recibo'
    when 1 then 'Factura A'      when 6 then 'Factura B'
    when 2 then 'Nota de débito A'  when 7 then 'Nota de débito B'
    when 3 then 'Nota de crédito A' when 8 then 'Nota de crédito B'
    else 'Tipo ' || c.tipo_comprobante
  end                                            as tipo_label,
  case
    when c.tipo_comprobante in (1, 2, 3) then 'A'
    when c.tipo_comprobante in (6, 7, 8) then 'B'
  end                                            as letra,
  (c.tipo_comprobante <> 0)                      as es_factura,

  c.punto_venta,
  c.numero,
  -- El recibo tiene punto 0 y sale 0000-00000123, que es lo correcto: su punto
  -- de venta ES 0, no «ninguno».
  lpad(c.punto_venta::text, 4, '0') || '-' || lpad(c.numero::text, 8, '0')
                                                 as numero_formateado,

  c.receptor_nombre,
  case c.receptor_doc_tipo
    when 80 then 'CUIT' when 86 then 'CUIL' when 96 then 'DNI' else 'Doc.'
  end || ' ' || coalesce(c.receptor_doc_nro, '—') as receptor_doc,
  civ.descripcion                                as condicion_iva,
  c.receptor_domicilio,

  c.detalle,
  c.monto, c.neto, c.iva, c.moneda, c.cotizacion,

  c.cae, c.cae_vencimiento, c.tipo_cod_aut,
  c.estado,
  case c.estado
    when 'emitida' then 'Emitida'  when 'pendiente' then 'Pendiente'
    when 'error'   then 'Error'    when 'generado'  then 'Generado'
    else c.estado
  end                                            as estado_label,
  c.error_detalle,
  c.emisor_domicilio,
  c.sin_origen, c.motivo_sin_origen,
  c.pago_id, c.cuota_cobro_sponsor_id, c.emitida_por, c.created_at,

  -- Hay PDF cuando el documento existe de verdad: el recibo siempre —lo
  -- emitimos nosotros—, la factura sólo si ARCA la autorizó. Una «pendiente»
  -- reservó un número y nada más; una «error» fue rechazada. Un PDF de
  -- cualquiera de las dos PARECERÍA una factura sin serlo.
  (c.tipo_comprobante = 0 or c.estado = 'emitida') as tiene_pdf
from comprobante c
left join condicion_iva_receptor civ on civ.id = c.condicion_iva_receptor_id;

comment on view v_comprobante is
  'Una fila por comprobante, facturas y recibos juntos, con lo derivado ya resuelto (etiquetas, número formateado, período, si tiene PDF). Base de /comprobantes.';


create or replace view v_comprobante_kpi as
select
  count(*)                                                  as total,
  count(*) filter (where tipo_comprobante <> 0)             as facturas,
  count(*) filter (where tipo_comprobante = 0)              as recibos,
  count(*) filter (where estado = 'pendiente')              as pendientes,
  count(*) filter (where estado = 'error')                  as con_error,
  -- Facturado del mes con el mismo criterio que la base de C&I: sólo emitidas,
  -- y las notas de crédito restando. Si el KPI y el acumulado contaran
  -- distinto, uno de los dos estaría mintiendo.
  coalesce(sum(
    case when tipo_comprobante in (3, 8) then -monto else monto end
  ) filter (
    where tipo_comprobante <> 0
      and estado = 'emitida'
      and to_char(fecha_emision, 'YYYY-MM') = to_char(current_date, 'YYYY-MM')
  ), 0)                                                     as facturado_mes
from comprobante;

comment on view v_comprobante_kpi is
  'Los conteos del encabezado de /comprobantes. La pantalla no cuenta nada (regla 1).';


-- ═══════════════════════════════════════════════════════════════════════════
-- v_facturado_por_direccion — la BASE para Comercio e Industria
-- ═══════════════════════════════════════════════════════════════════════════
--
-- C&I es un impuesto municipal que se paga según DÓNDE se factura, y el
-- domicilio del punto de venta es lo que lo determina. Esta vista da la base:
-- cuánto se facturó desde cada dirección, por mes. **No calcula el impuesto** —
-- eso llega cuando se trabajen impuestos.
--
-- ── Dos filtros que no son detalles ───────────────────────────────────────
--
-- ① Sólo `estado = 'emitida'`. Una «pendiente» reservó un número y ARCA nunca
--    la autorizó; una «error» fue rechazada. Ninguna existe fiscalmente. Sumarlas
--    inflaría la base imponible **en silencio**, que es la peor forma de estar
--    mal: nadie revisa un número que parece razonable.
--
-- ② Las notas de crédito RESTAN. Hoy no hay ninguna emitida, y justamente por
--    eso se pone ahora: el día que se emita la primera, una vista que sume todo
--    a ciegas la sumaría **en vez de restarla**, inflando la base justo cuando
--    se la está corrigiendo hacia abajo. Es una línea hoy y un error difícil de
--    ver después.
--
-- El `left join` es a propósito: un comprobante de un punto que no está en la
-- configuración —la #407, del punto 200— cae con `domicilio` en null. La
-- pantalla lo rotula «sin dirección configurada, no suma a C&I». Visible y
-- fuera de toda dirección, que es distinto de filtrarlo en silencio.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view v_facturado_por_direccion as
select
  to_char(c.fecha_emision, 'YYYY-MM')       as periodo,
  extract(year from c.fecha_emision)::int   as anio,
  c.punto_venta,
  pv.nombre                                 as punto_nombre,
  pv.domicilio,
  count(*)                                  as cantidad,
  sum(case when c.tipo_comprobante in (3, 8) then -c.neto  else c.neto  end) as neto,
  sum(case when c.tipo_comprobante in (3, 8) then -c.iva   else c.iva   end) as iva,
  sum(case when c.tipo_comprobante in (3, 8) then -c.monto else c.monto end) as total
from comprobante c
left join punto_venta pv on pv.numero = c.punto_venta
where c.tipo_comprobante <> 0
  and c.estado = 'emitida'
group by 1, 2, 3, 4, 5;

comment on view v_facturado_por_direccion is
  'Base para Comercio e Industria: facturado por mes y por dirección del punto de venta. Sólo comprobantes EMITIDOS (los pendientes y con error no existen fiscalmente) y con las notas de crédito restando. NO calcula el impuesto.';
