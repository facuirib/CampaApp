import { rgb, type PDFFont, type PDFPage } from 'pdf-lib'

/**
 * Lo que comparten el recibo y la factura.
 *
 * Existe porque los dos documentos son el mismo papel con distinto contenido:
 * misma hoja, misma paleta, mismo isologo, mismo saneo de caracteres. Tenerlo
 * dos veces significaría que el día que cambie una leyenda fiscal o el ancho
 * del margen haya que acordarse de los dos archivos — y el disparador de esos
 * cambios suele ser normativo, o sea que afecta a los dos por igual.
 */

export const BAJADA = 'Gestión administrativa'

// La paleta del sistema, para que el papel se parezca a la pantalla.
export const TINTA = rgb(0.043, 0.082, 0.141) //  --ink   #0b1524
export const GRIS = rgb(0.42, 0.463, 0.525) //   --muted #6b7686
export const LINEA = rgb(0.906, 0.918, 0.941) // --line  #e7eaf0
export const AZUL = rgb(0.078, 0.408, 0.984) //  --blue  #1468fb
export const BLANCO = rgb(1, 1, 1)
export const PANEL = rgb(0.965, 0.973, 0.984)

export const A4 = { ancho: 595.28, alto: 841.89 }
export const MARGEN = 48

/** El lado del isologo en el encabezado, en puntos. */
export const ISOLOGO = 34

/**
 * Los caracteres que WinAnsi agrega arriba de Latin-1 (comillas curvas, guion
 * largo, €, …). Todo lo demás por encima de 0xFF no se puede encodear.
 */
const EXTRA_WINANSI = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split('').map((c) => c.codePointAt(0)!),
)

/**
 * Deja el texto en lo que las fuentes estándar del PDF pueden escribir.
 *
 * **Esto no es cosmética: sin esto el comprobante no se genera.** Las 14
 * fuentes estándar encodean WinAnsi, y `drawText` con un carácter afuera —un
 * emoji, una flecha— **tira una excepción**. Un equipo que se llame «Barcelo 🏆»
 * es perfectamente posible, y el error aparecería recién al cobrarle, con el
 * operador y el equipo esperando el papel.
 *
 * Se descarta el carácter en vez de fallar, y esa es la decisión: un
 * comprobante impreso sin el emoji del nombre sirve; uno que no se imprime, no.
 * Lo que se guarda en `comprobante.receptor_nombre` queda intacto — esto sólo
 * afecta al render.
 */
export function saneaWinAnsi(s: string): string {
  return Array.from(s.normalize('NFC'))
    .filter((c) => {
      const cp = c.codePointAt(0)!
      return cp < 0x100 || EXTRA_WINANSI.has(cp)
    })
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * `0010-00000408`, como numera ARCA: punto de venta y número.
 *
 * El recibo interno usa punto 0 y sale `0000-00000123`, que es exactamente lo
 * que corresponde — su punto de venta ES 0, no «ninguno». Ver la migración de
 * `comprobante`: el 0 explícito es lo que mete al recibo en el mismo único que
 * las facturas.
 */
export function numeroFormateado(numero: number, puntoVenta = 0): string {
  return `${puntoVenta.toString().padStart(4, '0')}-${numero.toString().padStart(8, '0')}`
}

export interface Ctx {
  page: PDFPage
  regular: PDFFont
  negrita: PDFFont
}

export interface OpcionesTexto {
  font: PDFFont
  size: number
  color?: ReturnType<typeof rgb>
}

export function texto({ page }: Ctx, s: string, x: number, y: number, opciones: OpcionesTexto) {
  // El saneo va acá, en el único lugar por donde pasa TODO el texto de la hoja:
  // así no depende de que cada llamada se acuerde.
  page.drawText(saneaWinAnsi(s), {
    x,
    y,
    size: opciones.size,
    font: opciones.font,
    color: opciones.color ?? TINTA,
  })
}

/** Alineado a la derecha: los importes se leen por la unidad, no por el inicio. */
export function textoDerecha(
  ctx: Ctx,
  s: string,
  xDerecha: number,
  y: number,
  opciones: OpcionesTexto,
) {
  // Se mide el texto YA saneado: si se midiera el original, un nombre con emoji
  // quedaría corrido respecto del borde.
  const ancho = opciones.font.widthOfTextAtSize(saneaWinAnsi(s), opciones.size)
  texto(ctx, s, xDerecha - ancho, y, opciones)
}

/** Centrado en un rango horizontal. */
export function textoCentrado(
  ctx: Ctx,
  s: string,
  xIzq: number,
  xDer: number,
  y: number,
  opciones: OpcionesTexto,
) {
  const ancho = opciones.font.widthOfTextAtSize(saneaWinAnsi(s), opciones.size)
  texto(ctx, s, xIzq + (xDer - xIzq - ancho) / 2, y, opciones)
}

/** El emisor, tal como sale de la tabla `emisor` y de la fila del comprobante. */
export interface DatosEmisor {
  razonSocial: string
  cuit: string
  /**
   * El domicilio del PUNTO DE VENTA, congelado en `comprobante.emisor_domicilio`.
   * Opcional porque el recibo no tiene punto de venta y por lo tanto no tiene
   * domicilio que mostrar.
   */
  domicilioComercial?: string | null
  ingresosBrutos?: string | null
  inicioActividades?: string | null
  condicionIva?: string | null
}
