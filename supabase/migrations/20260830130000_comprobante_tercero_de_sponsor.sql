-- ═══════════════════════════════════════════════════════════════════════════
-- `v_comprobante.tercero_id` resuelve también el origen sponsor
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La vista resolvía el tercero por **un solo camino**:
--
--     left join pago p on p.id = c.pago_id   →   p.tercero_id
--
-- Con el recibo del cobro de sponsor (`20260830100000`) apareció el segundo
-- origen, y ese camino no lo cubre: un recibo de sponsor tiene `pago_id` en
-- NULL —el cobro de sponsor no pasa por `pago`— así que el join no engancha y
-- **`tercero_id` sale NULL**. Medido en rollback sobre un cobro real:
--
--     nº24 · Recibo · «Bodega Los Cerros» · tercero_id = 🔴 null
--
-- No es cosmético: `tercero_id` es de donde el modal de emisión saca al cliente
-- para preguntarle a `v_cliente` su condición de IVA, que es lo que **decide la
-- letra A o B**. Sin tercero, `contextoEmision` devuelve `null` y el modal no
-- abre: al sponsor no se le puede facturar.
--
-- ── Por qué acá y no en la pantalla ────────────────────────────────────────
--
-- Porque el que sabe de qué cuelga un comprobante es el comprobante. Si la
-- pantalla resolviera «si hay pago_id andá a pago, si no andá por contrato», esa
-- regla viviría en el front y habría que repetirla en cada lugar que necesite el
-- tercero — el módulo de consulta, la emisión, el mail que venga después.
--
-- `ya_facturado` ya contemplaba los dos orígenes desde que se diseñaron los
-- índices partidos; era `tercero_id` el que se había quedado con uno solo. Esto
-- los deja parejos.
--
-- La columna NO cambia de posición ni de tipo: sólo pasa a mirar los dos lados.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_comprobante as
 SELECT c.id,
    c.fecha_emision,
    to_char(c.fecha_emision::timestamp with time zone, 'YYYY-MM'::text) AS periodo,
    EXTRACT(year FROM c.fecha_emision)::integer AS anio,
    c.tipo_comprobante,
        CASE c.tipo_comprobante
            WHEN 0 THEN 'Recibo'::text
            WHEN 1 THEN 'Factura A'::text
            WHEN 6 THEN 'Factura B'::text
            WHEN 2 THEN 'Nota de débito A'::text
            WHEN 7 THEN 'Nota de débito B'::text
            WHEN 3 THEN 'Nota de crédito A'::text
            WHEN 8 THEN 'Nota de crédito B'::text
            ELSE 'Tipo '::text || c.tipo_comprobante
        END AS tipo_label,
        CASE
            WHEN c.tipo_comprobante = ANY (ARRAY[1, 2, 3]) THEN 'A'::text
            WHEN c.tipo_comprobante = ANY (ARRAY[6, 7, 8]) THEN 'B'::text
            ELSE NULL::text
        END AS letra,
    c.tipo_comprobante <> 0 AS es_factura,
    c.punto_venta,
    c.numero,
    (lpad(c.punto_venta::text, 4, '0'::text) || '-'::text) || lpad(c.numero::text, 8, '0'::text) AS numero_formateado,
    c.receptor_nombre,
    (
        CASE c.receptor_doc_tipo
            WHEN 80 THEN 'CUIT'::text
            WHEN 86 THEN 'CUIL'::text
            WHEN 96 THEN 'DNI'::text
            ELSE 'Doc.'::text
        END || ' '::text) || COALESCE(c.receptor_doc_nro, '—'::text) AS receptor_doc,
    civ.descripcion AS condicion_iva,
    c.receptor_domicilio,
    c.detalle,
    c.monto,
    c.neto,
    c.iva,
    c.moneda,
    c.cotizacion,
    c.cae,
    c.cae_vencimiento,
    c.tipo_cod_aut,
    c.estado,
        CASE c.estado
            WHEN 'emitida'::text THEN 'Emitida'::text
            WHEN 'pendiente'::text THEN 'Pendiente'::text
            WHEN 'error'::text THEN 'Error'::text
            WHEN 'generado'::text THEN 'Generado'::text
            ELSE c.estado
        END AS estado_label,
    c.error_detalle,
    c.emisor_domicilio,
    c.sin_origen,
    c.motivo_sin_origen,
    c.pago_id,
    c.cuota_cobro_sponsor_id,
    c.emitida_por,
    c.created_at,
    c.tipo_comprobante = 0 OR c.estado = 'emitida'::text AS tiene_pdf,

    -- Los DOS orígenes. `comprobante_un_origen` garantiza que sea uno o el
    -- otro, nunca los dos, así que el coalesce no puede elegir mal.
    COALESCE(p.tercero_id, cs.sponsor_id) AS tercero_id,

    c.pago_id IS NOT NULL AND (EXISTS ( SELECT 1
           FROM comprobante f
          WHERE f.pago_id = c.pago_id AND f.tipo_comprobante <> 0 AND f.estado <> 'error'::text)) OR c.cuota_cobro_sponsor_id IS NOT NULL AND (EXISTS ( SELECT 1
           FROM comprobante f
          WHERE f.cuota_cobro_sponsor_id = c.cuota_cobro_sponsor_id AND f.tipo_comprobante <> 0 AND f.estado <> 'error'::text)) AS ya_facturado
   FROM comprobante c
     LEFT JOIN condicion_iva_receptor civ ON civ.id = c.condicion_iva_receptor_id
     LEFT JOIN pago p ON p.id = c.pago_id
     LEFT JOIN cuota_cobro_sponsor q ON q.id = c.cuota_cobro_sponsor_id
     LEFT JOIN contrato_sponsor cs ON cs.id = q.contrato_id;

comment on view public.v_comprobante is
  'Los comprobantes para pantalla: recibos internos y facturas de ARCA. '
  '`tercero_id` resuelve los DOS orígenes —el pago de un equipo y la cuota de '
  'un sponsor—, que es de donde la emisión saca al cliente para decidir la '
  'letra. `ya_facturado` mira el mismo par de orígenes.';
