// scripts/probar-arca-cae.ts
// ⚠️ ESTE SCRIPT PUEDE EMITIR UNA FACTURA REAL, IRREVERSIBLE, si ARCA
// aprueba. Flujo de 2 puertas, con sesión real de usuario QA finanzas.

import { createClient } from '@supabase/supabase-js'
import { autenticarArca, crearClienteAdmin } from '../lib/arca-wsaa-core.ts'
import { ultimoComprobanteAutorizado } from '../lib/arca-wsfev1-consultas.ts'
import { emitirFactura } from '../lib/arca-fecaesolicitar.ts'

const CUIT_CAMPA = '30715502670'
const PUNTO_VENTA = 200
const TIPO_FACTURA_B = 6

async function main() {
  const admin = crearClienteAdmin()

  console.log('0. Generando sesión real para el usuario QA finanzas...')
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'facuubosch+qa-admin@gmail.com',
  })
  if (linkError || !linkData) {
    throw new Error(`No se pudo generar el link: ${linkError?.message}`)
  }
  const hashedToken = linkData.properties?.hashed_token
  if (!hashedToken) {
    throw new Error('No se pudo obtener el hashed_token del link generado')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const clienteUsuario = createClient(url, anonKey)

  const { data: sessionData, error: sessionError } = await clienteUsuario.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'magiclink',
  })
  if (sessionError || !sessionData.session) {
    throw new Error(`No se pudo verificar la sesión: ${sessionError?.message}`)
  }
  console.log('   Sesión obtenida para:', sessionData.user?.email)
  console.log('')

  console.log('1. Autenticando contra ARCA...')
  const ticket = await autenticarArca('wsfe', true)
  console.log('   OK')
  console.log('')

  console.log('2. Consultando último comprobante autorizado...')
  const ultimo = await ultimoComprobanteAutorizado(ticket, CUIT_CAMPA, PUNTO_VENTA, TIPO_FACTURA_B, true)
  console.log(`   Último en ARCA: ${ultimo}`)
  console.log('')

  console.log('3. Emitiendo factura con sesión real de usuario finanzas...')
  const resultado = await emitirFactura(
    clienteUsuario, // ← con sesión real, no service_role, para que auth_rol() funcione
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
  console.log('Comprobante ID:', resultado.comprobanteId)
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
