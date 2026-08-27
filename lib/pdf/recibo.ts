import { PDFDocument, StandardFonts } from 'pdf-lib'
// Relativo y no `@/lib/format` a propósito: sin el alias de Next, este módulo
// corre tal cual en Node —el script de prueba lo importa directo— y eso es
// parte de que sea una función pura y no una pieza atada al framework.
import { formatDate, formatMoneyExacto } from '../format.ts'
import {
  A4,
  AZUL,
  BAJADA,
  BLANCO,
  GRIS,
  ISOLOGO,
  LINEA,
  MARGEN,
  PANEL,
  TINTA,
  numeroFormateado,
  saneaWinAnsi,
  texto,
  textoDerecha,
  type Ctx,
  type DatosEmisor,
} from './comun.ts'
import { ISOLOGO_LADO, ISOLOGO_PATH } from './isologo.ts'

export type { DatosEmisor }

/**
 * El recibo interno, en PDF.
 *
 * ── Es una FUNCIÓN PURA, y eso es el punto ────────────────────────────────
 *
 * Recibe los datos y devuelve bytes. No consulta la base, no sabe de sesiones y
 * no depende de dónde la llamen. Por eso sirve igual para los tres momentos que
 * van a existir:
 *
 *   · al cobrar — cuando `registrar_cobro` cree la fila del comprobante
 *     (carril de Horacio, todavía no)
 *   · al descargarlo de nuevo desde el módulo de consulta
 *   · al mandarlo por mail, adjuntando estos mismos bytes
 *
 * Y por eso **no hace falta guardar el PDF en ningún lado**: la fila de
 * `comprobante` tiene el receptor y el detalle CONGELADOS, así que este render
 * se puede repetir dentro de cinco años y sale idéntico. El PDF no es el
 * documento: la fila lo es.
 *
 * ── Lo que este recibo NO es ──────────────────────────────────────────────
 *
 * No es fiscal. No lleva CAE, ni QR, ni punto de venta —esos son de la Factura
 * A/B, que emite ARCA— y lleva en cambio una leyenda que lo dice con todas las
 * letras. Si alguien confunde este papel con una factura, el problema no es del
 * equipo que lo recibe: es del club que se lo dio.
 */

/** Los datos que viajan a la hoja. Espejan la fila congelada de `comprobante`. */
export interface DatosRecibo {
  /** El correlativo interno. Sale de `comprobante_recibo_numero_seq`. */
  numero: number
  /** `fecha_emision` de la fila, no la de hoy. */
  fecha: string
  /** `receptor_nombre` congelado: con el que se emitió, no el de ahora. */
  receptorNombre: string
  receptorDocumento?: string | null
  receptorCondicionIva?: string | null
  receptorDomicilio?: string | null
  /** `detalle` congelado — «Cuotas 3 y 4 · Clausura 2026». */
  detalle: string
  /** El total. El recibo no discrimina IVA: no es un comprobante fiscal. */
  monto: number
  /** Quién lo emitió, para el pie. Opcional: puede no saberse el nombre. */
  emitidoPor?: string | null
  /**
   * El emisor, traído de la tabla `emisor` por quien llama.
   *
   * Entra por parámetro y no se lee acá: el generador no consulta la base, y
   * así el día que la razón social cambie en Configuración este módulo no se
   * entera —ni tiene por qué—.
   */
  emisor: DatosEmisor
}


/**
 * Lo único del emisor que no sale de la base: el subtítulo de marca.
 *
 * **El recibo no lleva domicilio, y ahora hay una razón mejor que «no hace
 * falta»:** el domicilio pertenece al PUNTO DE VENTA —es el que determina
 * Comercio e Industria— y el recibo interno **no tiene punto** (usa 0). Un
 * recibo con dirección estaría afirmando algo sobre C&I que no le corresponde.
 */
export async function generarReciboPDF(datos: DatosRecibo): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()

  pdf.setTitle(`Recibo ${numeroFormateado(datos.numero, 0)} · ${datos.emisor.razonSocial}`)
  pdf.setSubject('Recibo interno — no válido como factura')
  pdf.setProducer('CAMPA')

  const page = pdf.addPage([A4.ancho, A4.alto])
  const ctx: Ctx = {
    page,
    // Helvetica es una de las 14 estándar del formato: no se embebe, así que el
    // PDF pesa 3 KB y abre en cualquier lado. La tipografía de marca obligaría
    // a embeber el archivo y a que este módulo dependa de un asset.
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    negrita: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  const { regular, negrita } = ctx
  const derecha = A4.ancho - MARGEN

  // ── Encabezado ───────────────────────────────────────────────────────────
  let y = A4.alto - MARGEN

  // El isologo, en vector. `drawSvgPath` toma (x, y) como la esquina SUPERIOR
  // izquierda y dibuja hacia abajo, al revés que el resto de pdf-lib: por eso
  // este `y` es el tope del bloque y no su base.
  page.drawSvgPath(ISOLOGO_PATH, {
    x: MARGEN,
    y: y,
    scale: ISOLOGO / ISOLOGO_LADO,
    color: TINTA,
  })

  // El nombre arranca después del isologo, con el aire que usa el sidebar.
  const xTexto = MARGEN + ISOLOGO + 12

  texto(ctx, datos.emisor.razonSocial, xTexto, y - 18, { font: negrita, size: 22 })
  texto(ctx, BAJADA.toUpperCase(), xTexto, y - 30, {
    font: regular,
    size: 7.5,
    color: GRIS,
  })
  texto(ctx, `CUIT ${datos.emisor.cuit}`, xTexto, y - 46, { font: regular, size: 9, color: GRIS })

  // El bloque del documento, a la derecha: lo primero que se busca al recibirlo.
  textoDerecha(ctx, 'RECIBO', derecha, y - 18, { font: negrita, size: 22, color: AZUL })
  textoDerecha(ctx, `N° ${numeroFormateado(datos.numero, 0)}`, derecha, y - 34, {
    font: negrita,
    size: 11,
  })
  textoDerecha(ctx, formatDate(datos.fecha), derecha, y - 48, {
    font: regular,
    size: 9,
    color: GRIS,
  })

  y -= 70
  page.drawLine({
    start: { x: MARGEN, y },
    end: { x: derecha, y },
    thickness: 1,
    color: LINEA,
  })

  // ── 🔴 La leyenda ────────────────────────────────────────────────────────
  //
  // Va arriba de todo el contenido, no al pie: es lo que define qué es este
  // papel, y al pie se lee después de haberlo tomado por otra cosa.
  //
  // Lleva **borde y negrita**, no sólo fondo de color. Un recibo se imprime, y
  // muchas impresoras del club van a ser blanco y negro: si la distinción
  // dependiera del color, en papel desaparecería justo donde más importa.
  y -= 28
  const altoBanda = 34
  page.drawRectangle({
    x: MARGEN,
    y: y - altoBanda + 10,
    width: derecha - MARGEN,
    height: altoBanda,
    color: BLANCO,
    borderColor: TINTA,
    borderWidth: 1.5,
  })
  const leyenda = 'RECIBO — NO VÁLIDO COMO FACTURA'
  const anchoLeyenda = negrita.widthOfTextAtSize(saneaWinAnsi(leyenda), 13)
  texto(ctx, leyenda, MARGEN + (derecha - MARGEN - anchoLeyenda) / 2, y - 8, {
    font: negrita,
    size: 13,
  })

  y -= altoBanda + 16
  texto(
    ctx,
    'Comprobante interno de pago. No tiene validez fiscal y no reemplaza a una factura.',
    MARGEN,
    y,
    { font: regular, size: 8.5, color: GRIS },
  )

  // ── Recibimos de ─────────────────────────────────────────────────────────
  y -= 38
  texto(ctx, 'RECIBIMOS DE', MARGEN, y, { font: negrita, size: 8, color: GRIS })
  y -= 18
  texto(ctx, datos.receptorNombre, MARGEN, y, { font: negrita, size: 13 })

  // Los datos del receptor sólo se imprimen si están: el recibo no los exige
  // —eso es de la Factura A— y una línea con un guion no informa nada.
  const datosReceptor = [
    datos.receptorDocumento ? `Documento: ${datos.receptorDocumento}` : null,
    datos.receptorCondicionIva,
    datos.receptorDomicilio,
  ].filter(Boolean) as string[]

  for (const linea of datosReceptor) {
    y -= 13
    texto(ctx, linea, MARGEN, y, { font: regular, size: 9, color: GRIS })
  }

  // ── El concepto y el importe ─────────────────────────────────────────────
  y -= 40
  page.drawRectangle({
    x: MARGEN,
    y: y - 4,
    width: derecha - MARGEN,
    height: 22,
    color: PANEL,
  })
  texto(ctx, 'EN CONCEPTO DE', MARGEN + 10, y + 3, { font: negrita, size: 8, color: GRIS })
  textoDerecha(ctx, 'IMPORTE', derecha - 10, y + 3, { font: negrita, size: 8, color: GRIS })

  y -= 26
  texto(ctx, datos.detalle, MARGEN + 10, y, { font: regular, size: 10.5 })
  textoDerecha(ctx, formatMoneyExacto(datos.monto), derecha - 10, y, { font: regular, size: 10.5 })

  y -= 18
  page.drawLine({ start: { x: MARGEN, y }, end: { x: derecha, y }, thickness: 0.5, color: LINEA })

  // El total, grande: es el número por el que se firma el recibo.
  y -= 26
  textoDerecha(ctx, 'TOTAL', derecha - 130, y, { font: negrita, size: 10, color: GRIS })
  textoDerecha(ctx, formatMoneyExacto(datos.monto), derecha, y, { font: negrita, size: 18 })

  // ── Pie ──────────────────────────────────────────────────────────────────
  const yPie = MARGEN + 40
  page.drawLine({
    start: { x: MARGEN, y: yPie + 18 },
    end: { x: derecha, y: yPie + 18 },
    thickness: 0.5,
    color: LINEA,
  })
  texto(ctx, `Emitido el ${formatDate(datos.fecha)}`, MARGEN, yPie, {
    font: regular,
    size: 8,
    color: GRIS,
  })
  if (datos.emitidoPor) {
    texto(ctx, `por ${datos.emitidoPor}`, MARGEN, yPie - 11, {
      font: regular,
      size: 8,
      color: GRIS,
    })
  }
  textoDerecha(ctx, `${datos.emisor.razonSocial} · CUIT ${datos.emisor.cuit}`, derecha, yPie, {
    font: regular,
    size: 8,
    color: GRIS,
  })

  return pdf.save()
}
