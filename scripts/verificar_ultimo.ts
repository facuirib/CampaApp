import { autenticarArca } from '../lib/arca-wsaa-core.ts'
import { ultimoComprobanteAutorizado } from '../lib/arca-wsfev1-consultas.ts'

const ticket = await autenticarArca('wsfe', true)
const ultimo = await ultimoComprobanteAutorizado(ticket, '30715502670', 200, 6, true)
console.log('Último comprobante autorizado (Factura B, punto 200):', ultimo)
