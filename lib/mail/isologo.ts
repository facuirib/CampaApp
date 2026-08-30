/**
 * El isologo, en PNG y en base64, para el encabezado del mail.
 *
 * ── Por qué PNG acá y vector en el PDF ────────────────────────────────────
 *
 * `lib/pdf/isologo.ts` guarda el mismo símbolo como path vectorial, y ahí está
 * bien: `drawSvgPath` lo dibuja nítido a cualquier tamaño y pesa lo que ocupa
 * el texto. En un mail eso no sirve — **ningún cliente renderiza SVG inline**:
 * Gmail lo descarta entero y Outlook muestra el markup o nada. La única imagen
 * que se ve en todos lados es un PNG.
 *
 * ── Por qué embebido y no leído de `public/` ──────────────────────────────
 *
 * Mismo motivo que el path del PDF: `public/` no viaja al bundle de una función
 * serverless, así que un `readFile` andaría en local y fallaría en Vercel —
 * justo donde nadie lo estaría mirando. Va como constante y el módulo queda
 * puro: sin disco, sin rutas, sin entorno.
 *
 * ── Cómo se generó ────────────────────────────────────────────────────────
 *
 * `sips -Z 88 public/brand/campa-isologo-white.png`, o sea 2x del alto de 44px
 * con el que se muestra, para que se vea nítido en pantallas retina. Son 3,9 KB
 * — 5,2 KB ya en base64.
 *
 * La versión BLANCA y con transparencia (`hasAlpha: yes`), porque va sobre el
 * navy del encabezado: el fondo se ve através y no hay que hacer coincidir
 * ningún color.
 *
 * Si el isologo cambia, se regenera con ese mismo comando desde
 * `public/brand/campa-isologo-white.png`.
 */

export const ISOLOGO_PNG_BASE64 =
  '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' +
  'QmCC'

/** El Content-ID con el que viaja adentro del mail y lo referencia el HTML. */
export const ISOLOGO_CID = 'isologo-campa'
