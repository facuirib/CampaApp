import forge from 'node-forge'
import { createClient } from '@supabase/supabase-js'

/**
 * Autenticación contra el WSAA (Web Service de Autenticación y
 * Autorización) de ARCA. Devuelve un Ticket de Acceso (token + sign)
 * válido por 12hs, que se usa para llamar al webservice de negocio
 * (wsfev1, facturación electrónica).
 *
 * Requiere ARCA_CERT_PEM y ARCA_KEY_PEM en el entorno del servidor
 * (nunca en el repo — ver .env.example).
 *
 * Referencia: manual del desarrollador WSAA de ARCA. El flujo es:
 *   1. Armar el XML "Login Ticket Request" (TRA) con un uniqueId y
 *      ventana de validez.
 *   2. Firmarlo en formato CMS/PKCS#7 (con el certificado y la clave
 *      privada).
 *   3. Enviarlo al WSAA por SOAP — devuelve el Ticket de Acceso (TA).
 */

const WSAA_URL_HOMOLOGACION = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'
const WSAA_URL_PRODUCCION = 'https://wsaa.afip.gov.ar/ws/services/LoginCms'

export interface TicketAcceso {
  token: string
  sign: string
  expirationTime: Date
}

/**
 * Arma el XML del Login Ticket Request (TRA). uniqueId debe ser único
 * por request — usamos el timestamp en segundos. La ventana de validez
 * es de 10 minutos (WSAA la exige acotada, no como el TA que dura 12hs).
 */
function armarTRA(servicio: string): string {
  const ahora = new Date()
  const expiracion = new Date(ahora.getTime() + 10 * 60 * 1000)
  const uniqueId = Math.floor(ahora.getTime() / 1000)

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${ahora.toISOString()}</generationTime>
    <expirationTime>${expiracion.toISOString()}</expirationTime>
  </header>
  <service>${servicio}</service>
</loginTicketRequest>`
}

/**
 * Firma el TRA en formato CMS/PKCS#7, usando el certificado y la clave
 * privada del entorno. Devuelve el CMS codificado en base64, listo
 * para enviar al WSAA.
 */
function firmarTRA(tra: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem)
  const privateKey = forge.pki.privateKeyFromPem(keyPem)

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(tra, 'utf8')
  p7.addCertificate(cert)
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
  })
  p7.sign({ detached: false })

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}

/**
 * Envía el CMS firmado al WSAA por SOAP. El WSAA es el único punto de
 * todo este flujo que corre directo con SOAP crudo (los webservices de
 * negocio como wsfev1 sí tienen un WSDL más manejable) — se arma el
 * sobre SOAP a mano porque es un único método simple.
 */
async function llamarWSAA(cms: string, urlWsaa: string): Promise<string> {
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`

  const respuesta = await fetch(urlWsaa, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '',
    },
    body: soapEnvelope,
  })

  if (!respuesta.ok) {
    throw new Error(
      `WSAA respondió ${respuesta.status}: ${await respuesta.text()}`
    )
  }

  const textoRespuesta = await respuesta.text()

  const match = textoRespuesta.match(/<loginCmsReturn>([\s\S]*?)<\/loginCmsReturn>/)
  if (!match) {
    const fault = textoRespuesta.match(/<faultstring>([\s\S]*?)<\/faultstring>/)
    throw new Error(
      fault
        ? `WSAA rechazó el pedido: ${fault[1]}`
        : `No se pudo extraer el Ticket de Acceso de la respuesta del WSAA`
    )
  }

  return match[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
}

/**
 * Punto de entrada: autentica contra ARCA para el servicio indicado
 * (ej. 'wsfe') y devuelve el Ticket de Acceso. produccion controla si
 * se usa el ambiente de producción o el de homologación (pruebas) —
 * arrancar SIEMPRE por homologación hasta verificar que todo el
 * circuito funciona antes de tocar producción real.
 */
export function crearClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno."
    )
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function ticketPersistido(servicio: string): Promise<TicketAcceso | null> {
  const admin = crearClienteAdmin()
  const { data, error } = await admin.rpc("arca_ticket_vigente", {
    p_servicio: servicio,
  })
  if (error) return null
  if (!data || data.length === 0) return null
  const fila = data[0]
  return {
    token: fila.token,
    sign: fila.sign,
    expirationTime: new Date(fila.expira_at),
  }
}

async function guardarTicket(servicio: string, ticket: TicketAcceso): Promise<void> {
  const admin = crearClienteAdmin()
  const { error } = await admin.rpc("arca_guardar_ticket", {
    p_servicio: servicio,
    p_token: ticket.token,
    p_sign: ticket.sign,
    p_expira_at: ticket.expirationTime.toISOString(),
  })
  if (error) console.error("No se pudo persistir el ticket de ARCA:", error)
}
export async function autenticarArca(
  servicio: string,
  produccion: boolean
): Promise<TicketAcceso> {
  const persistido = await ticketPersistido(servicio)
  if (persistido) {
    return persistido
  }

  const certPem = process.env.ARCA_CERT_PEM
  const keyPem = process.env.ARCA_KEY_PEM

  if (!certPem || !keyPem) {
    throw new Error(
      'Faltan ARCA_CERT_PEM o ARCA_KEY_PEM en el entorno. Ver .env.example.'
    )
  }

  const tra = armarTRA(servicio)
  const cms = firmarTRA(tra, certPem, keyPem)
  const urlWsaa = produccion ? WSAA_URL_PRODUCCION : WSAA_URL_HOMOLOGACION
  const taXml = await llamarWSAA(cms, urlWsaa)

  const token = taXml.match(/<token>([\s\S]*?)<\/token>/)?.[1]
  const sign = taXml.match(/<sign>([\s\S]*?)<\/sign>/)?.[1]
  const expirationTimeStr = taXml.match(
    /<expirationTime>([\s\S]*?)<\/expirationTime>/
  )?.[1]

  if (!token || !sign || !expirationTimeStr) {
    throw new Error(
      `El Ticket de Acceso de ARCA no tiene el formato esperado: ${taXml}`
    )
  }

  const ticket: TicketAcceso = {
    token,
    sign,
    expirationTime: new Date(expirationTimeStr),
  }

  await guardarTicket(servicio, ticket)

  return ticket
}