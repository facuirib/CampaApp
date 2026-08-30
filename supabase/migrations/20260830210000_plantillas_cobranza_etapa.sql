-- ═══════════════════════════════════════════════════════════════════════════
-- COBRANZA · una plantilla de TEXTO por etapa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `reclamo_vencida` era una sola para todo, y con las tres etapas ya no
-- alcanza: el mismo texto no puede servir para avisar que algo vence en tres
-- días y para reclamar algo vencido hace dos meses. El tono escala.
--
-- ── Sólo el TEXTO, como en los comprobantes ────────────────────────────────
--
-- Estas tres filas guardan el MENSAJE. El diseño —el encabezado navy, el
-- isologo, el pie— vive en `lib/mail/sobre.ts` y lo pone `envolver()`, el mismo
-- que ya usan el recibo y la factura.
--
-- `reclamo_vencida` hace lo contrario: trae un `<div>` con estilos inline
-- adentro del campo editable. Ahí una etiqueta sin cerrar rompe el mail para
-- todos los reclamos siguientes, y el error aparece en la casilla de un equipo
-- y no en la pantalla de quien lo escribió. **No se toca en esta migración**
-- —sigue siendo la plantilla del reclamo suelto— pero las nuevas nacen bien.
--
-- ── Los placeholders ───────────────────────────────────────────────────────
--
--   {{saludo}}       «Hola Acme,» — o «Hola,» si no hay nombre real
--   {{cantidad}}     «3 cuotas vencidas»
--   {{monto}}        el total del aviso
--   {{detalle}}      las cuotas, una por línea
--   {{vencimiento}}  NUEVO. La fecha que importa según la etapa: el próximo
--                    vencimiento en el preventivo, el más antiguo impago en los
--                    otros dos
--
-- Se va `{{equipo}}`: con el nombre vacío salía «Hola ,», y el saludo con la
-- coma adentro no se puede escribir mal.
--
-- El `{{detalle}}` va en un `<div>` con `white-space:pre-wrap` porque
-- `armarDetalle()` devuelve una cuota por línea con saltos reales, y en HTML
-- sin eso se verían todas pegadas.
-- ═══════════════════════════════════════════════════════════════════════════

insert into plantilla_mail (clave, asunto, cuerpo, cuerpo_texto) values
(
  'cobranza_por_vencer',
  'Tu cuota vence pronto · Campa Fútbol',
  '<p style="margin:0 0 14px 0;">{{saludo}}</p>' ||
  '<p style="margin:0 0 14px 0;">Te recordamos que {{cantidad}} vence el {{vencimiento}}, por <strong>{{monto}}</strong>.</p>' ||
  '<div style="margin:0 0 14px 0;white-space:pre-wrap;">{{detalle}}</div>' ||
  '<p style="margin:0 0 14px 0;">Si ya lo pagaste, avisanos y lo verificamos.</p>' ||
  '<p style="margin:0;">¡Nos vemos en la cancha!</p>',
  '{{saludo}}' || chr(10) || chr(10) ||
  'Te recordamos que {{cantidad}} vence el {{vencimiento}}, por {{monto}}.' || chr(10) || chr(10) ||
  '{{detalle}}' || chr(10) || chr(10) ||
  'Si ya lo pagaste, avisanos y lo verificamos.' || chr(10) ||
  '¡Nos vemos en la cancha!'
),
(
  'cobranza_recordatorio',
  'Te quedó una cuota pendiente · Campa Fútbol',
  '<p style="margin:0 0 14px 0;">{{saludo}}</p>' ||
  '<p style="margin:0 0 14px 0;">Nos figura {{cantidad}} sin registrar, por un total de <strong>{{monto}}</strong>.</p>' ||
  '<div style="margin:0 0 14px 0;white-space:pre-wrap;">{{detalle}}</div>' ||
  '<p style="margin:0 0 14px 0;">Puede que se nos haya cruzado el pago: si ya lo hiciste, avisanos y lo verificamos.</p>' ||
  '<p style="margin:0;">Si no, te pedimos regularizarlo esta semana.</p>',
  '{{saludo}}' || chr(10) || chr(10) ||
  'Nos figura {{cantidad}} sin registrar, por un total de {{monto}}.' || chr(10) || chr(10) ||
  '{{detalle}}' || chr(10) || chr(10) ||
  'Puede que se nos haya cruzado el pago: si ya lo hiciste, avisanos y lo verificamos.' || chr(10) ||
  'Si no, te pedimos regularizarlo esta semana.'
),
(
  'cobranza_firme',
  'Cuotas vencidas — regularización · Campa Fútbol',
  '<p style="margin:0 0 14px 0;">{{saludo}}</p>' ||
  '<p style="margin:0 0 14px 0;">Te escribimos por {{cantidad}} impagas, por un total de <strong>{{monto}}</strong>, la más antigua vencida el {{vencimiento}}.</p>' ||
  '<div style="margin:0 0 14px 0;white-space:pre-wrap;">{{detalle}}</div>' ||
  '<p style="margin:0 0 14px 0;">Necesitamos regularizar la situación para que el equipo siga participando.</p>' ||
  '<p style="margin:0;">Si ya pagaste, avisanos y lo verificamos.</p>',
  '{{saludo}}' || chr(10) || chr(10) ||
  'Te escribimos por {{cantidad}} impagas, por un total de {{monto}}, la más antigua vencida el {{vencimiento}}.' || chr(10) || chr(10) ||
  '{{detalle}}' || chr(10) || chr(10) ||
  'Necesitamos regularizar la situación para que el equipo siga participando.' || chr(10) ||
  'Si ya pagaste, avisanos y lo verificamos.'
)
on conflict (clave) do nothing;
