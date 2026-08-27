import { PDFDocument, StandardFonts } from 'pdf-lib'

import { formatDate, formatMoneyExacto } from '../format.ts'
import {
  A4,
  BLANCO,
  GRIS,
  ISOLOGO,
  LINEA,
  MARGEN,
  PANEL,
  TINTA,
  numeroFormateado,
  texto,
  textoCentrado,
  textoDerecha,
  type Ctx,
  type DatosEmisor,
} from './comun.ts'
import { ISOLOGO_LADO, ISOLOGO_PATH } from './isologo.ts'
import { pathQrArca, urlQrArca, type DatosQR, type TipoCodAut } from './qr-arca.ts'

/**
 * La factura electrónica: el gemelo fiscal del recibo.
 *
 * **Función pura, igual que el recibo.** Recibe la fila congelada y el emisor,
 * devuelve bytes. No consulta la base. Eso es lo que la hace regenerable: una
 * factura de hace tres años se vuelve a imprimir idéntica porque todo lo que
 * necesita está en su fila, no en el estado de hoy.
 *
 * ── Un solo generador para A y B ──────────────────────────────────────────
 *
 * La diferencia entre una Factura A y una B es chica y está en dos bloques:
 * los totales (la A discrimina neto e IVA; la B muestra sólo el total) y los
 * datos del receptor. Todo el resto —encabezado, letra, emisor, detalle, CAE,
 * QR, leyendas— es el mismo documento.
 *
 * Dos archivos serían dos copias del 85%, y la copia se despega. Peor todavía
 * acá, porque lo que dispara los cambios en una factura es normativo: cuando
 * ARCA agregue un dato obligatorio, lo agrega para las dos, y el riesgo real es
 * corregir una y olvidarse de la otra.
 *
 * Las dos guardan `neto` e `iva` en la fila —el constraint los exige siempre—,
 * así que la B **tiene** el dato y simplemente no lo imprime. La condición es
 * de presentación, no de datos.
 */

/** Los tipos de comprobante de ARCA que emitimos, y su letra. */
const LETRA: Record<number, { letra: string; codigo: string; nombre: string; discrimina: boolean }> = {
  1: { letra: 'A', codigo: '01', nombre: 'FACTURA A', discrimina: true },
  2: { letra: 'A', codigo: '02', nombre: 'NOTA DE DÉBITO A', discrimina: true },
  3: { letra: 'A', codigo: '03', nombre: 'NOTA DE CRÉDITO A', discrimina: true },
  6: { letra: 'B', codigo: '06', nombre: 'FACTURA B', discrimina: false },
  7: { letra: 'B', codigo: '07', nombre: 'NOTA DE DÉBITO B', discrimina: false },
  8: { letra: 'B', codigo: '08', nombre: 'NOTA DE CRÉDITO B', discrimina: false },
}

export interface DatosFactura {
  /** `tipo_comprobante` de ARCA: 1 = Factura A, 6 = Factura B, … */
  tipoComprobante: number
  puntoVenta: number
  numero: number
  /** `fecha_emision` en `AAAA-MM-DD`. La de la fila, no la de hoy. */
  fecha: string

  /** Congelados en la fila: con lo que se emitió, no con lo de ahora. */
  receptorNombre: string
  receptorDocTipo: number
  receptorDocNro: string
  /** Descripción de `condicion_iva_receptor`. Obligatoria desde la RG 5616. */
  receptorCondicionIva: string
  receptorDomicilio?: string | null

  detalle: string
  /** El total, con IVA incluido. Es lo que se cobró: el dato duro. */
  monto: number
  /** `round(monto / 1.21, 2)`. */
  neto: number
  /** `monto - neto`. La diferencia, no un redondeo aparte. */
  iva: number

  cae: string
  caeVencimiento: string
  /** `E` = CAE · `A` = CAEA. De la fila, no una constante. */
  tipoCodAut: TipoCodAut
  moneda: string
  cotizacion: number

  /**
   * El emisor. `domicilioComercial` sale de `comprobante.emisor_domicilio`
   * —congelado del punto de venta elegido—, no de la tabla `punto_venta`: es el
   * domicilio que define Comercio e Industria y tiene que ser el de la emisión.
   */
  emisor: DatosEmisor
}

/** El QR sale enteramente de la fila. Nada se recalcula acá. */
function datosQrDe(d: DatosFactura): DatosQR {
  return {
    fecha: d.fecha,
    cuitEmisor: d.emisor.cuit,
    puntoVenta: d.puntoVenta,
    tipoComprobante: d.tipoComprobante,
    numero: d.numero,
    importe: d.monto,
    moneda: d.moneda,
    cotizacion: d.cotizacion,
    receptorDocTipo: d.receptorDocTipo,
    receptorDocNro: d.receptorDocNro,
    tipoCodAut: d.tipoCodAut,
    cae: d.cae,
  }
}

/** 80 = CUIT · 96 = DNI · 99 = consumidor final sin identificar. */
function etiquetaDocumento(tipo: number): string {
  if (tipo === 80) return 'CUIT'
  if (tipo === 86) return 'CUIL'
  if (tipo === 96) return 'DNI'
  if (tipo === 99) return 'Doc.'
  return 'Doc.'
}

export async function generarFacturaPDF(datos: DatosFactura): Promise<Uint8Array> {
  const tipo = LETRA[datos.tipoComprobante]
  if (!tipo) {
    throw new Error(
      `No sé dibujar el tipo de comprobante ${datos.tipoComprobante}. ` +
        `Los que conozco son: ${Object.keys(LETRA).join(', ')}.`,
    )
  }

  const nro = numeroFormateado(datos.numero, datos.puntoVenta)
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${tipo.nombre} ${nro} · ${datos.emisor.razonSocial}`)
  pdf.setSubject(`Comprobante autorizado por ARCA · CAE ${datos.cae}`)
  pdf.setProducer('CAMPA')

  const page = pdf.addPage([A4.ancho, A4.alto])
  const ctx: Ctx = {
    page,
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    negrita: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  const { regular, negrita } = ctx
  const derecha = A4.ancho - MARGEN
  const medio = A4.ancho / 2

  // ── El recuadro de la letra ──────────────────────────────────────────────
  //
  // Va primero y al centro porque es lo que la norma exige que se vea: la letra
  // define el tratamiento fiscal del comprobante para quien lo recibe. Se
  // dibuja como un recuadro que corta la línea del encabezado, que es la forma
  // en que se imprime desde siempre y por la que el ojo la busca ahí.
  let y = A4.alto - MARGEN

  const LADO_LETRA = 46
  const xLetra = medio - LADO_LETRA / 2
  const yLetra = y - LADO_LETRA + 6

  page.drawRectangle({
    x: xLetra,
    y: yLetra,
    width: LADO_LETRA,
    height: LADO_LETRA,
    color: BLANCO,
    borderColor: TINTA,
    borderWidth: 1.5,
  })
  textoCentrado(ctx, tipo.letra, xLetra, xLetra + LADO_LETRA, yLetra + 16, {
    font: negrita,
    size: 28,
  })
  textoCentrado(ctx, `COD. ${tipo.codigo}`, xLetra, xLetra + LADO_LETRA, yLetra + 5, {
    font: regular,
    size: 6.5,
    color: GRIS,
  })

  // ── Emisor (izquierda) ───────────────────────────────────────────────────
  page.drawSvgPath(ISOLOGO_PATH, {
    x: MARGEN,
    y: y,
    scale: ISOLOGO / ISOLOGO_LADO,
    color: TINTA,
  })
  const xTexto = MARGEN + ISOLOGO + 12
  texto(ctx, datos.emisor.razonSocial, xTexto, y - 18, { font: negrita, size: 18 })

  let yEmisor = y - 42
  const lineaEmisor = (s: string) => {
    texto(ctx, s, MARGEN, yEmisor, { font: regular, size: 8, color: GRIS })
    yEmisor -= 11
  }
  lineaEmisor(`CUIT ${datos.emisor.cuit}`)
  if (datos.emisor.domicilioComercial) lineaEmisor(datos.emisor.domicilioComercial)
  if (datos.emisor.condicionIva) lineaEmisor(datos.emisor.condicionIva)
  if (datos.emisor.ingresosBrutos) lineaEmisor(`Ingresos brutos: ${datos.emisor.ingresosBrutos}`)
  if (datos.emisor.inicioActividades) {
    lineaEmisor(`Inicio de actividades: ${formatDate(datos.emisor.inicioActividades)}`)
  }

  // ── Comprobante (derecha) ────────────────────────────────────────────────
  textoDerecha(ctx, tipo.nombre, derecha, y - 18, { font: negrita, size: 15 })
  textoDerecha(ctx, `N° ${nro}`, derecha, y - 36, { font: negrita, size: 12 })
  textoDerecha(ctx, `Fecha de emisión: ${formatDate(datos.fecha)}`, derecha, y - 52, {
    font: regular,
    size: 8.5,
    color: GRIS,
  })

  y = Math.min(yEmisor, y - 66) - 8
  page.drawLine({ start: { x: MARGEN, y }, end: { x: derecha, y }, thickness: 1, color: LINEA })

  // ── Receptor ─────────────────────────────────────────────────────────────
  y -= 24
  texto(ctx, 'RECEPTOR', MARGEN, y, { font: negrita, size: 8, color: GRIS })
  y -= 16
  texto(ctx, datos.receptorNombre, MARGEN, y, { font: negrita, size: 12 })
  y -= 14
  texto(
    ctx,
    `${etiquetaDocumento(datos.receptorDocTipo)} ${datos.receptorDocNro}`,
    MARGEN,
    y,
    { font: regular, size: 9, color: GRIS },
  )
  y -= 12
  // Obligatoria desde la RG 5616/2024: la condición del receptor frente al IVA
  // se informa a ARCA y se imprime.
  texto(ctx, `Condición frente al IVA: ${datos.receptorCondicionIva}`, MARGEN, y, {
    font: regular,
    size: 9,
    color: GRIS,
  })
  if (datos.receptorDomicilio) {
    y -= 12
    texto(ctx, datos.receptorDomicilio, MARGEN, y, { font: regular, size: 9, color: GRIS })
  }

  // ── Detalle ──────────────────────────────────────────────────────────────
  y -= 34
  page.drawRectangle({
    x: MARGEN,
    y: y - 4,
    width: derecha - MARGEN,
    height: 22,
    color: PANEL,
  })
  texto(ctx, 'DESCRIPCIÓN', MARGEN + 10, y + 3, { font: negrita, size: 8, color: GRIS })
  textoDerecha(ctx, 'IMPORTE', derecha - 10, y + 3, { font: negrita, size: 8, color: GRIS })

  y -= 26
  texto(ctx, datos.detalle, MARGEN + 10, y, { font: regular, size: 10.5 })
  textoDerecha(ctx, formatMoneyExacto(datos.monto), derecha - 10, y, { font: regular, size: 10.5 })

  y -= 16
  page.drawLine({ start: { x: MARGEN, y }, end: { x: derecha, y }, thickness: 0.5, color: LINEA })

  // ── Totales ──────────────────────────────────────────────────────────────
  //
  // El único bloque que cambia entre A y B, y la razón es de fondo: la A se le
  // emite a un Responsable Inscripto, que toma el IVA como crédito fiscal y por
  // eso necesita verlo desagregado. Al consumidor final de la B el precio le
  // llega con el impuesto adentro y discriminárselo no le sirve de nada — la
  // norma directamente no lo permite.
  const xEtiqueta = derecha - 150

  if (tipo.discrimina) {
    y -= 22
    textoDerecha(ctx, 'Neto gravado', xEtiqueta, y, { font: regular, size: 9.5, color: GRIS })
    textoDerecha(ctx, formatMoneyExacto(datos.neto), derecha, y, { font: regular, size: 9.5 })
    y -= 15
    textoDerecha(ctx, 'IVA 21%', xEtiqueta, y, { font: regular, size: 9.5, color: GRIS })
    textoDerecha(ctx, formatMoneyExacto(datos.iva), derecha, y, { font: regular, size: 9.5 })
    y -= 8
    page.drawLine({
      start: { x: xEtiqueta - 40, y },
      end: { x: derecha, y },
      thickness: 0.5,
      color: LINEA,
    })
  }

  y -= 26
  textoDerecha(ctx, 'TOTAL', xEtiqueta, y, { font: negrita, size: 10, color: GRIS })
  textoDerecha(ctx, formatMoneyExacto(datos.monto), derecha, y, { font: negrita, size: 18 })

  // ── Pie fiscal: el QR y el CAE ───────────────────────────────────────────
  //
  // Van juntos y al pie porque son lo mismo: la prueba de que ARCA autorizó
  // este comprobante. El QR lleva adentro el CAE que está impreso al lado, así
  // que quien escanea puede contrastar lo que ve con lo que el organismo tiene.
  const yPie = MARGEN + 24
  const LADO_QR = 92

  const { path, lado } = pathQrArca(urlQrArca(datosQrDe(datos)))
  page.drawSvgPath(path, {
    x: MARGEN,
    y: yPie + LADO_QR,
    scale: LADO_QR / lado,
    color: TINTA,
  })

  const xFiscal = MARGEN + LADO_QR + 18
  let yFiscal = yPie + LADO_QR - 14

  texto(ctx, 'COMPROBANTE AUTORIZADO', xFiscal, yFiscal, { font: negrita, size: 9 })
  yFiscal -= 18
  texto(ctx, `CAE N°: ${datos.cae}`, xFiscal, yFiscal, { font: negrita, size: 10 })
  yFiscal -= 14
  texto(ctx, `Vencimiento del CAE: ${formatDate(datos.caeVencimiento)}`, xFiscal, yFiscal, {
    font: regular,
    size: 9,
    color: GRIS,
  })

  if (!tipo.discrimina) {
    yFiscal -= 16
    texto(ctx, 'El IVA se encuentra incluido en el precio.', xFiscal, yFiscal, {
      font: regular,
      size: 7.5,
      color: GRIS,
    })
  }

  textoDerecha(ctx, `${datos.emisor.razonSocial} · CUIT ${datos.emisor.cuit}`, derecha, yPie, {
    font: regular,
    size: 7.5,
    color: GRIS,
  })

  return pdf.save()
}
