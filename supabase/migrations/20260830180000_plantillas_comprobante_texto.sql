-- ═══════════════════════════════════════════════════════════════════════════
-- Las plantillas de comprobante pasan a ser SÓLO texto
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Antes la fila traía el mensaje y lo poco que había de diseño. Ahora el diseño
-- vive en `lib/mail/sobre.ts`, fijo en código, y la fila guarda **el mensaje y
-- nada más**: los párrafos que van adentro del sobre.
--
-- El corte no es estético, es de dueño. El texto lo ajusta quien atiende a los
-- equipos cuando una frase no se entiende; el layout es HTML de mail, que se
-- rompe de maneras que no se ven hasta que alguien lo abre en Outlook. Con el
-- layout adentro de la fila editable, una etiqueta sin cerrar dejaría el mail
-- roto para todos los que vengan — y el error aparecería en la casilla de un
-- equipo, no en la pantalla de quien lo escribió.
--
-- ── Los placeholders cambian ───────────────────────────────────────────────
--
-- Se van `{{equipo}}` y `{{cantidad}}`, que venían de reclamos y no significan
-- nada acá. Entran:
--
--   {{saludo}}   «Hola Acme,» — o «Hola,» a secas cuando no hay nombre real
--   {{numero}}   «0010-00000018»
--   {{monto}}    «$525.000»
--   {{detalle}}  el concepto: «Cuota 3, Cuota 4»
--   {{fecha}}    «18/08/2026»
--
-- `{{saludo}}` reemplaza a `{{equipo}}` y se lleva la coma adentro. Con
-- `Hola {{equipo}},` y un receptor vacío salía «Hola ,», y con el receptor que
-- pone el circuito cuando el cliente no tiene datos salía «Hola Consumidor
-- Final,» — que es peor, porque le habla a una categoría fiscal como si fuera
-- el nombre de alguien. Hoy es el caso de 304 de 307 clientes.
--
-- ── El monto y el número NO están en el texto ──────────────────────────────
--
-- Van en la tarjeta de destacados, que arma el sobre desde la fila del
-- comprobante. Un número escrito en un texto editable se puede desincronizar
-- del comprobante sin que nadie lo note; leído de la fila, no.
-- ═══════════════════════════════════════════════════════════════════════════

update plantilla_mail set
  asunto = 'Recibo N° {{numero}} · Campa Fútbol',
  cuerpo =
    '<p style="margin:0 0 14px 0;">{{saludo}}</p>' ||
    '<p style="margin:0 0 14px 0;">Recibimos tu pago de <strong>{{monto}}</strong>. Te adjuntamos el recibo en PDF.</p>' ||
    '<p style="margin:0 0 14px 0;">{{detalle}}</p>' ||
    -- Esta línea acompaña a la que el PDF imprime en grande. El papel lo dice
    -- con todas las letras; el mail que lo lleva no debería decir menos.
    '<p style="margin:0 0 14px 0;">Es un comprobante interno de pago: no reemplaza a una factura.</p>' ||
    '<p style="margin:0;">Cualquier duda, respondé este mail.</p>',
  cuerpo_texto =
    '{{saludo}}' || chr(10) || chr(10) ||
    'Recibimos tu pago de {{monto}}. Te adjuntamos el recibo en PDF.' || chr(10) ||
    '{{detalle}}' || chr(10) || chr(10) ||
    'Es un comprobante interno de pago: no reemplaza a una factura.' || chr(10) ||
    'Cualquier duda, respondé este mail.'
where clave = 'recibo_pago';

update plantilla_mail set
  asunto = 'Factura {{numero}} · Campa Fútbol',
  cuerpo =
    '<p style="margin:0 0 14px 0;">{{saludo}}</p>' ||
    '<p style="margin:0 0 14px 0;">Te enviamos la factura correspondiente a {{detalle}}, por un total de <strong>{{monto}}</strong>.</p>' ||
    '<p style="margin:0 0 14px 0;">El comprobante adjunto es un documento fiscal electrónico, con su CAE y el código QR de ARCA.</p>' ||
    '<p style="margin:0;">Ante cualquier consulta, podés responder a este mail.</p>',
  cuerpo_texto =
    '{{saludo}}' || chr(10) || chr(10) ||
    'Te enviamos la factura correspondiente a {{detalle}}, por un total de {{monto}}.' || chr(10) || chr(10) ||
    'El comprobante adjunto es un documento fiscal electrónico, con su CAE y el código QR de ARCA.' || chr(10) ||
    'Ante cualquier consulta, podés responder a este mail.'
where clave = 'factura_emitida';
