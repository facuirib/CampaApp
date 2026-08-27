import qrcode from 'qrcode-generator'

/**
 * El código QR que ARCA exige en los comprobantes electrónicos (RG 4892).
 *
 * Módulo **puro**: recibe los datos, devuelve la URL y la geometría del QR. No
 * consulta la base ni sabe de PDFs. El que dibuja es `factura.ts`.
 *
 * ── Qué es el QR ──────────────────────────────────────────────────────────
 *
 * Un texto con esta forma:
 *
 *     https://www.afip.gob.ar/fe/qr/?p=<base64 de un JSON de 13 campos>
 *
 * Quien lo escanea llega al validador del organismo, que compara esos 13
 * campos contra lo que ARCA tiene registrado. O sea que **el QR no es un
 * adorno: es el comprobante afirmando su propio contenido**, y un campo mal
 * puesto no se ve mal — se ve como una factura que el validador da por
 * inválida.
 *
 * Por eso todos los valores salen de la fila congelada y ninguno se recalcula
 * acá.
 */

/**
 * La URL base, en un solo lugar.
 *
 * Hay una ambigüedad heredada del renombre AFIP → ARCA: el texto de la
 * especificación vigente menciona `arca.gob.ar`, pero lo que está impreso en
 * millones de comprobantes es `afip.gob.ar`, y la propia página de ARCA remite
 * a `serviciosweb.afip.gob.ar` para validar. Los dos dominios son del
 * organismo y resuelven al mismo validador.
 *
 * Se usa `afip.gob.ar` por ser el desplegado. Está acá, solo, para que
 * cambiarlo el día que ARCA lo defina sea una línea y no una búsqueda.
 */
export const URL_QR_ARCA = 'https://www.afip.gob.ar/fe/qr/'

/** `E` = CAE · `A` = CAEA (anticipado, contingencia). */
export type TipoCodAut = 'E' | 'A'

/** Los 13 campos, tal como salen de `comprobante` + `emisor`. */
export interface DatosQR {
  /** `fecha_emision`, en `AAAA-MM-DD` (full-date de RFC3339). */
  fecha: string
  /** CUIT del emisor. Se aceptan guiones y puntos: se limpian acá. */
  cuitEmisor: string
  puntoVenta: number
  tipoComprobante: number
  numero: number
  /** El TOTAL del comprobante. */
  importe: number
  /** Código de moneda de ARCA, 3 letras. `PES`. */
  moneda: string
  /** Cotización a pesos. 1 para PES. */
  cotizacion: number
  receptorDocTipo: number
  /** Viene como texto de la fila; acá se valida y se convierte. */
  receptorDocNro: string
  tipoCodAut: TipoCodAut
  /** El CAE, 14 dígitos. También texto en la fila. */
  cae: string
}

/** El JSON, con los nombres EXACTOS de la especificación. */
export interface JsonQR {
  ver: number
  fecha: string
  cuit: number
  ptoVta: number
  tipoCmp: number
  nroCmp: number
  importe: number
  moneda: string
  ctz: number
  tipoDocRec: number
  nroDocRec: number
  tipoCodAut: TipoCodAut
  codAut: number
}

export class ErrorQR extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorQR'
  }
}

const soloDigitos = (s: string): string => (s ?? '').replace(/[^0-9]/g, '')

/**
 * Pasa un campo de texto a número, para los que la especificación define como
 * numéricos y nosotros guardamos como `text`.
 *
 * **Acá está el riesgo que hay que atajar.** La especificación admite
 * `nroDocRec` de hasta 20 dígitos, y un entero de 20 dígitos **no entra en un
 * `number` de JavaScript**: arriba de 2^53 los enteros dejan de ser exactos y
 * el valor se redondea en silencio. Un documento que se convierte en otro
 * documento parecido es exactamente el tipo de error que nadie ve hasta que
 * alguien escanea el QR.
 *
 * En Argentina no pasa —un CUIT tiene 11 dígitos y un CAE 14, los dos bien
 * abajo del límite—, pero eso es una propiedad de los datos, no del código. Se
 * valida en vez de confiar: si algún día entra un documento de otro país por
 * `nroDocRec`, tiene que fallar acá y no imprimir un QR con un número
 * equivocado.
 */
function aNumeroExacto(valor: string, campo: string, maxDigitos: number): number {
  const digitos = soloDigitos(valor)

  if (digitos === '') {
    throw new ErrorQR(`El QR necesita «${campo}» y llegó vacío (valor recibido: ${JSON.stringify(valor)}).`)
  }
  if (digitos.length > maxDigitos) {
    throw new ErrorQR(
      `«${campo}» tiene ${digitos.length} dígitos y la especificación admite hasta ${maxDigitos}.`,
    )
  }

  const n = Number(digitos)
  if (!Number.isSafeInteger(n)) {
    throw new ErrorQR(
      `«${campo}» (${digitos}) no entra exacto en un número de JavaScript. ` +
        'Codificarlo redondearía el valor y el QR quedaría afirmando otro número.',
    )
  }
  return n
}

/** Arma el JSON de los 13 campos, en el orden de la especificación. */
export function jsonQrArca(d: DatosQR): JsonQR {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) {
    throw new ErrorQR(`La fecha del QR va en AAAA-MM-DD y llegó «${d.fecha}».`)
  }
  if (!/^[A-Z]{3}$/.test(d.moneda)) {
    throw new ErrorQR(`La moneda del QR son 3 letras mayúsculas y llegó «${d.moneda}».`)
  }
  if (d.tipoCodAut !== 'E' && d.tipoCodAut !== 'A') {
    throw new ErrorQR(`tipoCodAut sólo puede ser E (CAE) o A (CAEA), y llegó «${d.tipoCodAut}».`)
  }

  return {
    ver: 1,
    fecha: d.fecha,
    cuit: aNumeroExacto(d.cuitEmisor, 'cuit', 11),
    ptoVta: d.puntoVenta,
    tipoCmp: d.tipoComprobante,
    nroCmp: d.numero,
    importe: d.importe,
    moneda: d.moneda,
    ctz: d.cotizacion,
    tipoDocRec: d.receptorDocTipo,
    nroDocRec: aNumeroExacto(d.receptorDocNro, 'nroDocRec', 20),
    tipoCodAut: d.tipoCodAut,
    codAut: aNumeroExacto(d.cae, 'codAut', 14),
  }
}

/** base64 del JSON. Portable: `btoa` donde exista, `Buffer` en Node viejo. */
function aBase64(s: string): string {
  // El JSON es ASCII por construcción —números, fechas, `PES`, `E`— y eso lo
  // garantizan las validaciones de arriba. Se comprueba igual, porque `btoa`
  // con un carácter fuera de Latin-1 tira una excepción poco clara.
  if (/[^\x00-\x7F]/.test(s)) {
    throw new ErrorQR('El JSON del QR tiene caracteres no ASCII; alguno de los campos no se validó.')
  }
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')
}

/** El texto completo que se codifica en el QR. */
export function urlQrArca(d: DatosQR): string {
  return `${URL_QR_ARCA}?p=${aBase64(JSON.stringify(jsonQrArca(d)))}`
}

/**
 * El QR como **path SVG**, para `page.drawSvgPath` de pdf-lib.
 *
 * Vector y no PNG, por la misma razón que el isologo: un QR es geometría pura,
 * y en vector escala perfecto a cualquier tamaño o impresora. Un PNG se ve bien
 * en pantalla y peor en papel — y este QR está para escanearse **desde papel**.
 * De paso el PDF sigue pesando kilobytes y no entra un encoder de imágenes al
 * bundle.
 *
 * Los módulos oscuros de cada fila se juntan en tiras horizontales antes de
 * dibujarse: un QR de 45×45 tiene ~1000 módulos oscuros y agrupándolos quedan
 * unas pocas centenas de rectángulos, con el mismo resultado visual.
 *
 * Devuelve el path en un cuadrado de `lado × lado` unidades (una por módulo),
 * para que el que dibuja escale con `escala = tamañoDeseado / lado`.
 */
export function pathQrArca(texto: string): { path: string; lado: number } {
  // typeNumber 0 = que elija el tamaño mínimo que entre. Nivel M (~15% de
  // corrección), el habitual para estos comprobantes: aguanta un doblez o una
  // mancha sin volverse ilegible, sin agrandar el QR de más.
  const qr = qrcode(0, 'M')
  qr.addData(texto)
  qr.make()

  const lado = qr.getModuleCount()
  const partes: string[] = []

  for (let fila = 0; fila < lado; fila++) {
    let desde: number | null = null
    for (let col = 0; col <= lado; col++) {
      const oscuro = col < lado && qr.isDark(fila, col)
      if (oscuro && desde === null) desde = col
      if (!oscuro && desde !== null) {
        const ancho = col - desde
        // `drawSvgPath` toma (x, y) como esquina SUPERIOR izquierda y dibuja
        // hacia abajo, igual que el isologo.
        partes.push(`M ${desde} ${fila} h ${ancho} v 1 h ${-ancho} Z`)
        desde = null
      }
    }
  }

  return { path: partes.join(' '), lado }
}
