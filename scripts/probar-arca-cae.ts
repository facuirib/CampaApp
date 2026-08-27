// scripts/probar-arca-cae.ts
// ⚠️ ESTE SCRIPT PUEDE EMITIR UNA FACTURA REAL, IRREVERSIBLE, si ARCA
// aprueba. Flujo nuevo de 2 puertas (reservar + cerrar).

import { autenticarArca, crearClienteAdmin } from '../lib/arca-wsaa-core.ts'
import { ultimoComprobanteAutorizado } from '../lib/arca-wsfev1-consultas.ts'
import { emitirFactura } from '../lib/arca-fecaesolicitar.ts'

const CUIT_CAMPA = '30715502670'
const PUNTO_VENTA = 200
const TIPO_FACTURA_B = 6

async function main() {
  const admin = crearClienteAdmin()

  console.log('1. Autenticando...')
  const ticket = await autenticarArca('wsfe', true)
  console.log('   OK')
  console.log('')

  console.log('2. Consultando último comprobante autorizado (Factura B, punto 200)...')
  const ultimo = await ultimoComprobanteAutorizado(ticket, CUIT_CAMPA, PUNTO_VENTA, TIPO_FACTURA_B, true)
  console.log(`   Último en ARCA: ${ultimo}`)
  console.log('')

  console.log('3. Emitiendo factura (reservar + ARCA + cerrar), monto $1, Consumidor Final...')
  const resultado = await emitirFactura(
    admin,
    ticket,
    {
      cuit: CUIT_CAMPA,
      montoConIva: 1,
      condicionIvaReceptorId: 5,
      receptorNombre: 'Consumidor Final',
      receptorDocTipo: 99,
      receptorDocNro: '0',
    },
    PUNTO_VENTA,
    ultimo,
    true
  )

  console.log('')
  console.log('=== RESULTADO ===')
  console.log('Comprobante ID (nuestra base):', resultado.comprobanteId)
  console.log('Aprobado:', resultado.aprobado)
  console.log('CAE:', resultado.cae)
  console.log('Vencimiento CAE:', resultado.caeVencimiento)
  console.log('Número:', resultado.numero)
  console.log('Observaciones:', resultado.observaciones)
  console.log('Error:', resultado.errorMensaje)
}

main().catch((err) => {
  console.error('❌ Error:', err)
  process.exit(1)
})
