-- ═══════════════════════════════════════════════════════════════════════════
-- v_comprobante: `ya_facturado` y `tercero_id`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dos columnas que necesita la emisión desde el recibo.
--
-- `ya_facturado` dice si el cobro de esta fila **ya tiene su factura**. El
-- índice `comprobante_factura_por_pago` lo impediría igual, pero ofrecer un
-- botón que la base va a rechazar es una promesa que no se puede cumplir: el
-- usuario lo aprieta, espera, y recibe un error que no explica nada. Mejor no
-- ofrecerlo.
--
-- Mira las dos clases de origen —pago y cuota de sponsor— porque el modelo las
-- trata igual: cada una admite un recibo y una factura.
--
-- `tercero_id` sale del pago y sirve para dos cosas en el modal: leer los datos
-- fiscales del cliente —que deciden si la factura sale A o B, y si se puede
-- emitir— y armar el link a su ficha cuando le falta algo.
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
    when 1 then 'Factura A'         when 6 then 'Factura B'
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
  (c.tipo_comprobante = 0 or c.estado = 'emitida') as tiene_pdf,

  -- El equipo (o sponsor) que pagó. Sale del pago, no del comprobante: en el
  -- comprobante lo que hay es el receptor CONGELADO, que es el dato del
  -- documento; para leer la ficha fiscal de hoy hace falta el tercero vivo.
  p.tercero_id,

  -- ¿Este cobro ya tiene factura? Ver la nota del encabezado.
  (
    (c.pago_id is not null and exists (
       select 1 from comprobante f
        where f.pago_id = c.pago_id
          and f.tipo_comprobante <> 0 and f.estado <> 'error'))
    or
    (c.cuota_cobro_sponsor_id is not null and exists (
       select 1 from comprobante f
        where f.cuota_cobro_sponsor_id = c.cuota_cobro_sponsor_id
          and f.tipo_comprobante <> 0 and f.estado <> 'error'))
  )                                              as ya_facturado

from comprobante c
left join condicion_iva_receptor civ on civ.id = c.condicion_iva_receptor_id
left join pago p on p.id = c.pago_id;

comment on view v_comprobante is
  'Una fila por comprobante, facturas y recibos juntos, con lo derivado ya resuelto. `ya_facturado` dice si el cobro de esta fila ya tiene su factura —para no ofrecer un botón que el índice va a rechazar—; `tercero_id` es el cliente vivo, que decide si la factura sale A o B.';
