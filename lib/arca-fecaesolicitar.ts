import 'server-only'
import type { TicketAcceso } from './arca-wsaa'

const WSFEV1_URL_PRODUCCION = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
const WSFEV1_URL_HOMOLOGACION = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'

const ALICUOTA_ID_21_PORCIENTO = 5
const PUNTO_VENTA = 200
const CONCEPTO_SERVICIO = 2
const CONDICION_IVA_RESPONSABLE_INSCRIPTO = 1
const TIPO_COMPROBANTE_FACTURA_A = 1
const TIPO_COMPROBANTE_FACTURA_B = 6

async function llamarWsfev1(
  metodo: string,
  cuerpoInterno: string,
  produccion: boolean
): Promise<string> {
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:${metodo}>
      ${cuerpoInterno}
    </ar:${metodo}>
  </soapenv:Body>
</soapenv:Envelope>`

  const url = produccion ? WSFEV1_URL_PRODUCCION : WSFEV1_URL_HOMOLOGACION

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `http://ar.gov.afip.dif.FEV1/${metodo}`,
    },
    body: soapEnvelope,
  })

  if (!respuesta.ok) {
    throw new Error(
      `wsfev1 (${metodo}) respondió ${respuesta.status}: ${await respuesta.text()}`
    )
  }

  return respuesta.text()
}

export interface DatosFactura {
  cuit: string
  montoConIva: number
  condicionIvaReceptorId: number
  docTipo: number
  docNro: string
}

export interface ResultadoFactura {
  aprobado: boolean
  cae: string | null
  caeVencimiento: string | null
  numero: number
  tipoComprobante: number
  observaciones: string[]
  errorMensaje: string | null
}

export async function solicitarCAE(
  ticket: TicketAcceso,
  datos: DatosFactura,
  numeroComprobante: number,
  produccion: boolean
): Promise<ResultadoFactura> {
  const esResponsableInscripto =
    datos.condicionIvaReceptorId === CONDICION_IVA_RESPONSABLE_INSCRIPTO
  const tipoComprobante = esResponsableInscripto
    ? TIPO_COMPROBANTE_FACTURA_A
    : TIPO_COMPROBANTE_FACTURA_B

  let impNeto: number
  let impIva: number
  let bloqueIva = ''

  if (esResponsableInscripto) {
    impNeto = Math.round((datos.montoConIva / 1.21) * 100) / 100
    impIva = Math.round((datos.montoConIva - impNeto) * 100) / 100
    bloqueIva = `
      <ar:Iva>
        <ar:AlicIva>
          <ar:Id>${ALICUOTA_ID_21_PORCIENTO}</ar:Id>
          <ar:BaseImp>${impNeto.toFixed(2)}</ar:BaseImp>
          <ar:Importe>${impIva.toFixed(2)}</ar:Importe>
        </ar:AlicIva>
      </ar:Iva>`
  } else {
    impNeto = datos.montoConIva
    impIva = 0
  }

  const fechaHoy = new Date()
  const cbteFch =
    fechaHoy.getFullYear().toString() +
    (fechaHoy.getMonth() + 1).toString().padStart(2, '0') +
    fechaHoy.getDate().toString().padStart(2, '0')

  const cuerpo = `
    <ar:Auth>
      <ar:Token>${ticket.token}</ar:Token>
      <ar:Sign>${ticket.sign}</ar:Sign>
      <ar:Cuit>${datos.cuit}</ar:Cuit>
    </ar:Auth>
    <ar:FeCAEReq>
      <ar:FeCabReq>
        <ar:CantReg>1</ar:CantReg>
        <ar:PtoVta>${PUNTO_VENTA}</ar:PtoVta>
        <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
      </ar:FeCabReq>
      <ar:FeDetReq>
        <ar:FECAEDetRequest>
          <ar:Concepto>${CONCEPTO_SERVICIO}</ar:Concepto>
          <ar:DocTipo>${datos.docTipo}</ar:DocTipo>
          <ar:DocNro>${datos.docNro}</ar:DocNro>
          <ar:CbteDesde>${numeroComprobante}</ar:CbteDesde>
          <ar:CbteHasta>${numeroComprobante}</ar:CbteHasta>
          <ar:CbteFch>${cbteFch}</ar:CbteFch>
          <ar:ImpTotal>${datos.montoConIva.toFixed(2)}</ar:ImpTotal>
          <ar:ImpTotConc>0.00</ar:ImpTotConc>
          <ar:ImpNeto>${impNeto.toFixed(2)}</ar:ImpNeto>
          <ar:ImpOpEx>0.00</ar:ImpOpEx>
          <ar:ImpTrib>0.00</ar:ImpTrib>
          <ar:ImpIVA>${impIva.toFixed(2)}</ar:ImpIVA>
          <ar:FchServDesde>${cbteFch}</ar:FchServDesde>
          <ar:FchServHasta>${cbteFch}</ar:FchServHasta>
          <ar:FchVtoPago>${cbteFch}</ar:FchVtoPago>
          <ar:MonId>PES</ar:MonId>
          <ar:MonCotiz>1</ar:MonCotiz>
          <ar:CondicionIVAReceptorId>${datos.condicionIvaReceptorId}</ar:CondicionIVAReceptorId>${bloqueIva}
        </ar:FECAEDetRequest>
      </ar:FeDetReq>
    </ar:FeCAEReq>`

  const xml = await llamarWsfev1('FECAESolicitar', cuerpo, produccion)

  const resultado = xml.match(/<Resultado>([\s\S]*?)<\/Resultado>/)?.[1]
  const cae = xml.match(/<CAE>([\s\S]*?)<\/CAE>/)?.[1] ?? null
  const caeFchVto = xml.match(/<CAEFchVto>([\s\S]*?)<\/CAEFchVto>/)?.[1] ?? null

  const observaciones: string[] = []
  const regexObs = /<Msg>([\s\S]*?)<\/Msg>/g
  let matchObs: RegExpExecArray | null
  while ((matchObs = regexObs.exec(xml)) !== null) {
    observaciones.push(matchObs[1])
  }

  if (resultado !== 'A') {
    return {
      aprobado: false,
      cae: null,
      caeVencimiento: null,
      numero: numeroComprobante,
      tipoComprobante,
      observaciones: [],
      errorMensaje: observaciones.join(' | ') || 'ARCA rechazó el comprobante sin detalle',
    }
  }

  return {
    aprobado: true,
    cae,
    caeVencimiento: caeFchVto,
    numero: numeroComprobante,
    tipoComprobante,
    observaciones,
    errorMensaje: null,
  }
}
