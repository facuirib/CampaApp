import type { TicketAcceso } from './arca-wsaa-core.ts'

/**
 * FECAESolicitar — pedido de CAE, orquestado con el modelo de DOS
 * PUERTAS de Facu (27/08): reservar_numero_comprobante() antes de
 * llamar a ARCA (advisory lock adentro, evita que dos requests
 * simultáneos reserven el mismo número), y cerrar_comprobante() o
 * marcar_error_comprobante() después, según el resultado real.
 * Reemplaza registrar_factura_emitida (ya no existe).
 */

const WSFEV1_URL_PRODUCCION = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
const WSFEV1_URL_HOMOLOGACION = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'

const ALICUOTA_ID_21_PORCIENTO = 5
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
  receptorNombre: string
  receptorDocTipo: number
  receptorDocNro: string
  pagoId?: string
  cuotaCobroSponsorId?: string
}

export interface ResultadoFactura {
  comprobanteId: string
  aprobado: boolean
  cae: string | null
  caeVencimiento: string | null
  numero: number
  tipoComprobante: number
  observaciones: string[]
  errorMensaje: string | null
}

export async function emitirFactura(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  ticket: TicketAcceso,
  datos: DatosFactura,
  puntoVenta: number,
  ultimoNumeroArca: number,
  produccion: boolean
): Promise<ResultadoFactura> {
  const esResponsableInscripto =
    datos.condicionIvaReceptorId === CONDICION_IVA_RESPONSABLE_INSCRIPTO
  const tipoComprobante = esResponsableInscripto
    ? TIPO_COMPROBANTE_FACTURA_A
    : TIPO_COMPROBANTE_FACTURA_B

  const impNeto = Math.round((datos.montoConIva / 1.21) * 100) / 100
  const impIva = Math.round((datos.montoConIva - impNeto) * 100) / 100

  const { data: reserva, error: errorReserva } = await admin.rpc(
    'reservar_numero_comprobante',
    {
      p_punto_venta: puntoVenta,
      p_tipo_comprobante: tipoComprobante,
      p_condicion_iva_receptor_id: datos.condicionIvaReceptorId,
      p_monto: datos.montoConIva,
      p_receptor_nombre: datos.receptorNombre,
      p_receptor_doc_tipo: datos.receptorDocTipo,
      p_receptor_doc_nro: datos.receptorDocNro,
      p_pago_id: datos.pagoId ?? null,
      p_cuota_cobro_sponsor_id: datos.cuotaCobroSponsorId ?? null,
      p_neto: impNeto,
      p_iva: impIva,
      p_ultimo_numero_arca: ultimoNumeroArca,
    }
  )

  if (errorReserva || !reserva || reserva.length === 0) {
    throw new Error(
      `No se pudo reservar el número de comprobante: ${errorReserva?.message ?? 'sin filas'}`
    )
  }

  const { id: comprobanteId, numero: numeroComprobante } = reserva[0]

  const bloqueIva = `
      <ar:Iva>
        <ar:AlicIva>
          <ar:Id>${ALICUOTA_ID_21_PORCIENTO}</ar:Id>
          <ar:BaseImp>${impNeto.toFixed(2)}</ar:BaseImp>
          <ar:Importe>${impIva.toFixed(2)}</ar:Importe>
        </ar:AlicIva>
      </ar:Iva>`

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
        <ar:PtoVta>${puntoVenta}</ar:PtoVta>
        <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
      </ar:FeCabReq>
      <ar:FeDetReq>
        <ar:FECAEDetRequest>
          <ar:Concepto>${CONCEPTO_SERVICIO}</ar:Concepto>
          <ar:DocTipo>${datos.receptorDocTipo}</ar:DocTipo>
          <ar:DocNro>${datos.receptorDocNro}</ar:DocNro>
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

  if (resultado !== 'A' || !cae) {
    const detalle = observaciones.join(' | ') || 'ARCA rechazó el comprobante sin detalle'
    await admin.rpc('marcar_error_comprobante', {
      p_id: comprobanteId,
      p_detalle: detalle,
    })
    return {
      comprobanteId,
      aprobado: false,
      cae: null,
      caeVencimiento: null,
      numero: numeroComprobante,
      tipoComprobante,
      observaciones: [],
      errorMensaje: detalle,
    }
  }

  const caeVencimientoFormateado = caeFchVto
    ? `${caeFchVto.slice(0, 4)}-${caeFchVto.slice(4, 6)}-${caeFchVto.slice(6, 8)}`
    : null

  await admin.rpc('cerrar_comprobante', {
    p_id: comprobanteId,
    p_cae: cae,
    p_cae_vencimiento: caeVencimientoFormateado,
  })

  return {
    comprobanteId,
    aprobado: true,
    cae,
    caeVencimiento: caeVencimientoFormateado,
    numero: numeroComprobante,
    tipoComprobante,
    observaciones,
    errorMensaje: null,
  }
}

/**
 * Punto de entrada único para el front (pedido de Facu, 28/08): recibe
 * solo el punto y los datos del comprobante, orquesta internamente
 * autenticar → preguntar el último número → emitir. Así la pantalla de
 * emisión llama una sola función, sin manejar tickets ni consultas
 * previas — esa orquestación queda de este lado (motor), no del front.
 */
export async function emitirFacturaCompleta(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  datos: DatosFactura,
  puntoVenta: number,
  produccion: boolean
): Promise<ResultadoFactura> {
  const { autenticarArca } = await import('./arca-wsaa-core.ts')
  const { ultimoComprobanteAutorizado } = await import('./arca-wsfev1-consultas.ts')

  const ticket = await autenticarArca('wsfe', produccion)

  const esResponsableInscripto =
    datos.condicionIvaReceptorId === CONDICION_IVA_RESPONSABLE_INSCRIPTO
  const tipoComprobante = esResponsableInscripto
    ? TIPO_COMPROBANTE_FACTURA_A
    : TIPO_COMPROBANTE_FACTURA_B

  const ultimoNumeroArca = await ultimoComprobanteAutorizado(
    ticket,
    datos.cuit,
    puntoVenta,
    tipoComprobante,
    produccion
  )

  return emitirFactura(admin, ticket, datos, puntoVenta, ultimoNumeroArca, produccion)
}
