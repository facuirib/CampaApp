// scripts/probar-arca-cae.ts
// ⚠️ ESTE SCRIPT EMITE UNA FACTURA REAL, IRREVERSIBLE. Solo correr una
// vez, con el monto simbólico confirmado.

import { autenticarArca } from '../lib/arca-wsaa-core.ts'
import { ultimoComprobanteAutorizado } from '../lib/arca-wsfev1-consultas.ts'
import { solicitarCAE } from '../lib/arca-fecaesolicitar.ts'

const CUIT_CAMPA = '30715502670'
const PUNTO_VENTA = 200
const TIPO_FACTURA_B = 6

async function main() {
  console.log('1. Autenticando...')
  const ticket = await autenticarArca('wsfe', true)
  console.log('   OK')
  console.log('')

  console.log('2. Consultando último comprobante autorizado (Factura B, punto 200)...')
  const ultimo = await ultimoComprobanteAutorizado(ticket, CUIT_CAMPA, PUNTO_VENTA, TIPO_FACTURA_B, true)
  const siguiente = ultimo + 1
  console.log(`   Último: ${ultimo} — Próximo a emitir: ${siguiente}`)
  console.log('')

  console.log(`3. Solicitando CAE para Factura B, número ${siguiente}, monto $1, Consumidor Final...`)
  const resultado = await solicitarCAE(
    ticket,
    {
      cuit: CUIT_CAMPA,
      montoConIva: 1,
      condicionIvaReceptorId: 5, // Consumidor Final
      docTipo: 99, // Consumidor Final sin identificar
      docNro: '0',
    },
    siguiente,
    true
  )

  console.log('')
  console.log('=== RESULTADO ===')
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
