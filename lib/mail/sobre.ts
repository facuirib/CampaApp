/**
 * El «sobre»: el diseño del mail, fijo en código.
 *
 * ── Por qué el diseño NO es editable y el texto SÍ ────────────────────────
 *
 * `plantilla_mail` guarda el MENSAJE —el asunto y los párrafos— y esta función
 * lo envuelve. Son dos cosas con dueños distintos: el texto lo ajusta quien
 * atiende a los equipos, cuando una frase no se entiende; el layout es HTML de
 * mail, que se rompe de maneras que no se ven hasta que alguien abre el mensaje
 * en Outlook.
 *
 * Si el layout viviera en la fila editable, un `<div>` bien intencionado o una
 * etiqueta sin cerrar dejarían el mail roto **para todos los que vengan**, y el
 * error aparecería en la casilla de un equipo, no en la pantalla de quien lo
 * escribió. Separarlos hace que el peor error posible al editar sea una frase
 * fea, no un mail ilegible.
 *
 * ── Las reglas del HTML de mail, que no son las de la web ─────────────────
 *
 * Todo lo de acá abajo parece de 2005 porque tiene que serlo:
 *
 *   · **layout con `<table>`**, no flex ni grid — Outlook usa el motor de Word
 *     para renderizar, y ninguno de los dos existe ahí
 *   · **estilos INLINE**, sin `<style>` en el head — Gmail lo descarta cuando
 *     recorta el mensaje, y ahí el diseño desaparece de golpe
 *   · **sin webfonts ni `background-image`** — la primera no carga, la segunda
 *     Outlook la ignora
 *   · **el isologo va como TEXTO sobre un fondo de color**, no como imagen.
 *     Gmail y Outlook bloquean imágenes remotas por default: un `<img>` sería
 *     un cuadrado roto para la mitad de la gente, justo en el encabezado
 *   · **ancho fijo de 600px con `max-width` al 100%** — es el ancho que todos
 *     los clientes muestran sin recortar, y en el teléfono baja solo
 */

import { ISOLOGO_CID, ISOLOGO_PNG_BASE64 } from './isologo'

/** La paleta, la misma de `app/globals.css` y del PDF. */
const NIGHT = '#061221'
const INK = '#0b1524'
const MUTED = '#6b7686'
const LINEA = '#e6e9ef'
const PANEL = '#f7f8fa'
const BLANCO = '#ffffff'

/**
 * La pila de fuentes.
 *
 * Sólo del sistema: en mail no hay webfonts, así que se pide lo que cada
 * plataforma ya tiene. `-apple-system` cubre iPhone —donde se abrió el primer
 * recibo— y `Segoe UI` cubre Outlook en Windows.
 */
const FUENTE =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/**
 * Cómo viaja el isologo en el `<img>`.
 *
 *   `cid`  — referencia al adjunto inline. Es lo que va en el mail de verdad:
 *            la imagen viaja ADENTRO del mensaje, así que Gmail y Outlook no
 *            la bloquean como bloquean cualquier `src="https://…"`.
 *   `data` — un data URI. Sirve para el preview del editor, que se dibuja en un
 *            iframe donde no hay adjuntos que referenciar. **No se usa para
 *            enviar**: varios clientes ignoran los data URI en mail, que es
 *            justamente el problema que el CID resuelve.
 */
export type ModoIsologo = 'cid' | 'data'

/** Un adjunto inline que el sobre necesita para dibujarse. */
export interface AdjuntoInline {
  nombre: string
  contenido: string
  cid: string
}

/** Una fila de la tarjeta de detalle: el rótulo y el valor. */
export interface DatoDestacado {
  rotulo: string
  valor: string
}

export interface DatosSobre {
  /** El mensaje ya resuelto, en HTML: los `<p>` que escribió la plantilla. */
  cuerpoHtml: string
  /**
   * Lo que se lee sin abrir el adjunto. Va en una tabla de dos columnas
   * —rótulo y valor— porque es el dato que alguien busca de un vistazo desde el
   * teléfono, y abrir un PDF en el teléfono es tres toques.
   */
  destacados: DatoDestacado[]
  /** El pie: de quién viene el mail. */
  emisor: { razonSocial: string; cuit: string }
  /** Default `cid`, que es el modo del envío real. */
  isologo?: ModoIsologo
}

/**
 * Lo que devuelve el sobre: el HTML **y los adjuntos que ese HTML necesita**.
 *
 * Los dos juntos y no sólo el HTML a propósito. El `<img src="cid:…">` y el
 * adjunto que lo resuelve son dos mitades de la misma cosa: si quien envía
 * tuviera que acordarse de adjuntar el logo por su cuenta, el día que alguien
 * escriba un envío nuevo se olvidaría y el encabezado saldría con el alt. Así
 * el diseño se lleva sus propios assets y no hay nada que recordar.
 */
export interface SobreArmado {
  html: string
  inline: AdjuntoInline[]
}

/** Escapa lo que va a viajar dentro del HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function envolver({
  cuerpoHtml,
  destacados,
  emisor,
  isologo = 'cid',
}: DatosSobre): SobreArmado {
  const filasDestacados = destacados
    .map(
      (d, i) => `
            <tr>
              <td style="padding:${i === 0 ? '0' : '8px'} 12px 0 0;font-family:${FUENTE};font-size:12px;color:${MUTED};white-space:nowrap;">${esc(d.rotulo)}</td>
              <td style="padding:${i === 0 ? '0' : '8px'} 0 0 0;font-family:${FUENTE};font-size:14px;font-weight:bold;color:${INK};text-align:right;">${esc(d.valor)}</td>
            </tr>`,
    )
    .join('')

  const srcIsologo =
    isologo === 'cid'
      ? `cid:${ISOLOGO_CID}`
      : `data:image/png;base64,${ISOLOGO_PNG_BASE64}`

  // `role="presentation"` en cada tabla de layout: le dice al lector de pantalla
  // que son andamios y no datos, así no lee "tabla de 1 por 1" antes de cada
  // párrafo.
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Campa Fútbol</title>
</head>
<body style="margin:0;padding:0;background-color:${PANEL};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${BLANCO};border-radius:8px;overflow:hidden;">

          <tr>
            <td style="background-color:${NIGHT};padding:18px 28px;">
              <!-- Tabla y no un div con gap: es la única forma de poner dos
                   cosas una al lado de la otra que Outlook respeta.
                   El valign=middle de las dos celdas las alinea sin flex. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:12px;line-height:0;">
                    <!-- El alt no es decorativo: si el cliente igual no muestra
                         la imagen, ahí queda el nombre y no un hueco mudo.
                         El alto va como atributo Y como estilo: Outlook lee el
                         atributo y el resto lee el estilo. -->
                    <img src="${srcIsologo}" width="44" height="44" alt="Campa Fútbol"
                         style="display:block;width:44px;height:44px;border:0;outline:none;text-decoration:none;">
                  </td>
                  <td valign="middle">
                    <span style="font-family:${FUENTE};font-size:19px;font-weight:bold;color:${BLANCO};letter-spacing:-0.3px;">Campa Fútbol</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:${FUENTE};font-size:14px;line-height:1.6;color:${INK};">
              ${cuerpoHtml}
            </td>
          </tr>
${
  destacados.length
    ? `
          <tr>
            <td style="padding:8px 28px 4px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};border:1px solid ${LINEA};border-radius:6px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filasDestacados}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : ''
}
          <tr>
            <td style="padding:20px 28px 28px 28px;font-family:${FUENTE};font-size:12px;line-height:1.5;color:${MUTED};">
              El comprobante va adjunto en PDF.
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid ${LINEA};padding:18px 28px;font-family:${FUENTE};font-size:11px;line-height:1.6;color:${MUTED};">
              <strong style="color:${INK};">${esc(emisor.razonSocial)}</strong><br>
              CUIT ${esc(emisor.cuit)}<br>
              <a href="mailto:info@campafutbol.com.ar" style="color:${MUTED};text-decoration:underline;">info@campafutbol.com.ar</a>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`

  return {
    html,
    // Sólo cuando el HTML lo referencia por CID: en modo `data` la imagen ya va
    // adentro del markup y adjuntarla sería mandarla dos veces.
    inline:
      isologo === 'cid'
        ? [{ nombre: 'isologo.png', contenido: ISOLOGO_PNG_BASE64, cid: ISOLOGO_CID }]
        : [],
  }
}
