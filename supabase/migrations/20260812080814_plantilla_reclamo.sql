-- ═══════════════════════════════════════════════════════════════════════════
-- La plantilla de reclamo, con contenido de verdad
--
-- Las cuatro plantillas de `seed.sql` son STUBS: `<p>Hola {{equipo}},</p>` y
-- nada más. Servían para que la tabla no estuviera vacía, no para mandarse.
--
-- Esta migración le pone cuerpo a `reclamo_vencida`, que es la que usa el
-- módulo, en sus dos formatos:
--
--   · `cuerpo`       HTML, para el mail
--   · `cuerpo_texto` plano, para WhatsApp
--
-- ── Qué pone cada uno ──────────────────────────────────────────────────────
--
-- La plantilla pone **el saludo, el cuerpo y el cierre**. La pantalla pone
-- **sólo los datos**. Esa división es la razón de que las plantillas vivan en
-- la base: cambiar "te pedimos regularizarlo" es editar una fila, no un deploy.
--
-- Un primer intento pasaba en `{{detalle}}` el mensaje ENTERO que armaba la
-- pantalla —con su propio saludo y su propio cierre— y la plantilla le agregaba
-- los suyos: el resultado tenía dos saludos, dos despedidas y "te pedimos
-- regularizar" repetido. Se veía sólo al renderizar con datos reales; con los
-- placeholders sin resolver, la plantilla parecía correcta.
--
-- Los cuatro placeholders, y nada más:
--
--   {{equipo}}     nombre del equipo
--   {{cantidad}}   "4 cuotas vencidas" — ya en plural correcto
--   {{monto}}      el total, formateado
--   {{detalle}}    la lista, una línea por cuota: torneo · cuándo venció · saldo
--
-- `{{detalle}}` llega como texto plano en los dos formatos, y en el HTML se
-- envuelve en un bloque con `white-space: pre-wrap` que respeta los saltos de
-- línea. Es a propósito: una sola versión del detalle para los dos canales, en
-- vez de dos que puedan decir cosas distintas.
-- ═══════════════════════════════════════════════════════════════════════════

update plantilla_mail set
  asunto = '{{equipo}} · tenés cuotas vencidas en CAMPA',

  cuerpo =
       '<div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #0b1524;">'
    ||   '<div style="padding: 16px 0; border-bottom: 2px solid #0b1524;">'
    ||     '<strong style="font-size: 18px; letter-spacing: .4px;">CAMPA</strong>'
    ||   '</div>'
    ||   '<div style="padding: 24px 0; font-size: 14px; line-height: 1.55;">'
    ||     '<p>Hola <strong>{{equipo}}</strong>,</p>'
    ||     '<p>Te escribimos porque figuran <strong>{{cantidad}}</strong> a tu nombre, '
    ||       'por un total de <strong>{{monto}}</strong>.</p>'
    ||     '<div style="background: #f4f6fa; border-radius: 10px; padding: 14px 16px; '
    ||       'white-space: pre-wrap; font-size: 13px; line-height: 1.7; margin: 18px 0;">{{detalle}}</div>'
    ||     '<p>Te pedimos regularizarlo para que el equipo siga participando sin '
    ||       'inconvenientes. Si ya lo pagaste, avisanos y lo verificamos.</p>'
    ||     '<p>¡Gracias y nos vemos en la cancha!</p>'
    ||   '</div>'
    ||   '<div style="padding: 16px 0; border-top: 1px solid #e7eaf0; font-size: 12px; color: #6b7686;">'
    ||     'Este mensaje lo generó CAMPA. Respondé este mail ante cualquier duda.'
    ||   '</div>'
    || '</div>',

  -- Sin HTML: WhatsApp lo mostraría literal. Los saltos de línea son los que
  -- se ven en el chat.
  cuerpo_texto =
       'Hola {{equipo}}!' || chr(10) || chr(10)
    || 'Te escribimos de CAMPA: figuran {{cantidad}} a tu nombre, por un total de {{monto}}.'
    || chr(10) || chr(10)
    || '{{detalle}}' || chr(10) || chr(10)
    || 'Te pedimos regularizarlo para seguir participando sin inconvenientes. '
    || 'Si ya lo pagaste, avisanos y lo verificamos.' || chr(10) || chr(10)
    || '¡Gracias y nos vemos en la cancha!'

where clave = 'reclamo_vencida';
