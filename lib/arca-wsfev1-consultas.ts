import { autenticarArca } from './arca-wsaa-core.ts'

const WSFEV1_URL_PRODUCCION = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
const WSFEV1_URL_HOMOLOGACION = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'

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

export async function feDummy(produccion: boolean): Promise<{
  appServer: string
  dbServer: string
  authServer: string
}> {
  const xml = await llamarWsfev1('FEDummy', '', produccion)

  const appServer = xml.match(/<AppServer>([\s\S]*?)<\/AppServer>/)?.[1] ?? 'desconocido'
  const dbServer = xml.match(/<DbServer>([\s\S]*?)<\/DbServer>/)?.[1] ?? 'desconocido'
  const authServer = xml.match(/<AuthServer>([\s\S]*?)<\/AuthServer>/)?.[1] ?? 'desconocido'

  return { appServer, dbServer, authServer }
}

export async function ultimoComprobanteAutorizado(
  cuit: string,
  puntoVenta: number,
  tipoComprobante: number,
  produccion: boolean
): Promise<number> {
  const ticket = await autenticarArca('wsfe', produccion)

  const cuerpo = `
    <ar:Auth>
      <ar:Token>${ticket.token}</ar:Token>
      <ar:Sign>${ticket.sign}</ar:Sign>
      <ar:Cuit>${cuit}</ar:Cuit>
    </ar:Auth>
    <ar:PtoVta>${puntoVenta}</ar:PtoVta>
    <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>`

  const xml = await llamarWsfev1('FECompUltimoAutorizado', cuerpo, produccion)

  const numero = xml.match(/<CbteNro>([\s\S]*?)<\/CbteNro>/)?.[1]
  if (numero === undefined) {
    const fault = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/)
    throw new Error(
      fault
        ? `wsfev1 rechazó el pedido: ${fault[1]}`
        : `No se pudo extraer CbteNro de la respuesta: ${xml}`
    )
  }

  return parseInt(numero, 10)
}

export interface PuntoVenta {
  numero: number
  emisionTipo: string
  bloqueado: boolean
}

export async function puntosDeVentaHabilitados(
  cuit: string,
  produccion: boolean
): Promise<PuntoVenta[]> {
  const ticket = await autenticarArca('wsfe', produccion)

  const cuerpo = `
    <ar:Auth>
      <ar:Token>${ticket.token}</ar:Token>
      <ar:Sign>${ticket.sign}</ar:Sign>
      <ar:Cuit>${cuit}</ar:Cuit>
    </ar:Auth>`

  const xml = await llamarWsfev1('FEParamGetPtosVenta', cuerpo, produccion)

  const puntos: PuntoVenta[] = []
  const regexPunto = /<PtoVenta>([\s\S]*?)<\/PtoVenta>/g
  let match: RegExpExecArray | null

  while ((match = regexPunto.exec(xml)) !== null) {
    const bloque = match[1]
    const numero = bloque.match(/<Nro>([\s\S]*?)<\/Nro>/)?.[1]
    const emisionTipo = bloque.match(/<EmisionTipo>([\s\S]*?)<\/EmisionTipo>/)?.[1]
    const bloqueado = bloque.match(/<Bloqueado>([\s\S]*?)<\/Bloqueado>/)?.[1]

    if (numero) {
      puntos.push({
        numero: parseInt(numero, 10),
        emisionTipo: emisionTipo ?? 'desconocido',
        bloqueado: bloqueado === 'S',
      })
    }
  }

  return puntos
}

export interface CondicionIva {
  id: number
  descripcion: string
}

export async function condicionesIvaReceptor(
  produccion: boolean
): Promise<CondicionIva[]> {
  const ticket = await autenticarArca('wsfe', produccion)

  const cuerpo = `
    <ar:Auth>
      <ar:Token>${ticket.token}</ar:Token>
      <ar:Sign>${ticket.sign}</ar:Sign>
      <ar:Cuit>30715502670</ar:Cuit>
    </ar:Auth>`

  const xml = await llamarWsfev1('FEParamGetCondicionIvaReceptor', cuerpo, produccion)

  const condiciones: CondicionIva[] = []
  const regex = /<CondicionIvaReceptor>([\s\S]*?)<\/CondicionIvaReceptor>/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(xml)) !== null) {
    const bloque = match[1]
    const id = bloque.match(/<Id>([\s\S]*?)<\/Id>/)?.[1]
    const desc = bloque.match(/<Desc>([\s\S]*?)<\/Desc>/)?.[1]

    if (id) {
      condiciones.push({
        id: parseInt(id, 10),
        descripcion: desc ?? 'desconocido',
      })
    }
  }

  return condiciones
}
