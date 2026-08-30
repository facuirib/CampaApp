-- ═══════════════════════════════════════════════════════════════════════════
-- La plantilla del mail que acompaña a una factura
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `plantilla_mail` ya tenía `recibo_pago`, que sirve para el recibo interno.
-- Falta la de la factura fiscal, y **no puede ser la misma**: un recibo dice
-- «recibimos tu pago» y una factura es un documento fiscal con CAE. Mandar el
-- texto del recibo con una factura adjunta sería decir una cosa y adjuntar
-- otra.
--
-- Va como fila y no como texto en el código por lo mismo que las otras cuatro:
-- la redacción de un mail que sale con el nombre del club la tiene que poder
-- cambiar alguien de la oficina desde la pantalla de plantillas, sin un deploy.
--
-- Los placeholders son los que ya resuelve `aplicar()`: no se inventa ninguno.
--   {{equipo}}  el receptor congelado del comprobante
--   {{monto}}   el total, formateado
--   {{detalle}} «Factura 0010-00000002»
-- ═══════════════════════════════════════════════════════════════════════════

insert into plantilla_mail (clave, asunto, cuerpo, cuerpo_texto)
values (
  'factura_emitida',
  'Tu factura de CAMPA · {{detalle}}',
  '<p>Hola {{equipo}},</p>' ||
  '<p>Te adjuntamos la factura por <strong>{{monto}}</strong>.</p>' ||
  '<p>{{detalle}}</p>' ||
  '<p>El comprobante va adjunto en PDF, con su CAE y el código QR de ARCA.</p>' ||
  '<p>Cualquier duda, respondé este mail.</p>' ||
  '<p>— CAMPA</p>',
  'Hola {{equipo}},' || chr(10) || chr(10) ||
  'Te adjuntamos la factura por {{monto}}.' || chr(10) ||
  '{{detalle}}' || chr(10) || chr(10) ||
  'El comprobante va adjunto en PDF, con su CAE y el código QR de ARCA.' || chr(10) ||
  'Cualquier duda, respondé este mail.' || chr(10) || chr(10) ||
  '— CAMPA'
)
on conflict (clave) do nothing;
