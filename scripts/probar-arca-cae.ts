// scripts/probar-arca-cae.ts
// ⚠️ ESTE SCRIPT EMITE UNA FACTURA REAL EN PRODUCCIÓN, IRREVERSIBLE.
// Monto simbólico $1, una sola vez — decisión tomada con Horacio 28/08.
// Flujo de 2 puertas, con sesión real de usuario admin (contraseña).

import { createClient } from '@supabase/supabase-js'
import { autenticarArca } from '../lib/arca-wsaa-core.ts'
import { ultimoComprobanteAutorizado } from '../lib/arca-wsfev1-consultas.ts'
import { emitirFactura } from '../lib/arca-fecaesolicitar.ts'

const CUIT_CAMPA = '30715502670'
const PUNTO_VENTA = 10 // TORNEO AEP
const TIPO_FACTURA_B = 6

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const password = process.env.PRUEBA_ADMIN_PASSWORD

  if (!password) {
    throw new Error('Falta PRUEBA_ADMIN_PASSWORD en el entorno.')
  }

  const clienteUsuario = createClient(url, anonKey)

  console.log('0. Iniciando sesión con usuario admin real...')
  const { data: sessionData, error: sessionError } = await clienteUsuario.auth.signInWithPassword({
    email: 'horaciobecerra90@gmail.com',
    password,
  })
  if (sessionError || !sessionData.session) {
    throw new Error(`No se pudo iniciar sesión: ${sessionError?.message}`)
  }
  console.log('   Sesión obtenida para:', sessionData.user?.email)
  console.log('')

  console.log('1. Autenticando contra ARCA...')
  const ticket = await autenticarArca('wsfe', true)
  console.log('   OK')
  console.log('')

  console.log('2. Consultando último comprobante autorizado (punto', PUNTO_VENTA, ')...')
  const ultimo = await ultimoComprobanteAutorizado(ticket, CUIT_CAMPA, PUNTO_VENTA, TIPO_FACTURA_B, true)
  console.log(`   Último en ARCA: ${ultimo}`)
  console.log('')

  console.log('3. Emitiendo factura con sesión real de usuario admin...')
  const resultado = await emitirFactura(
    clienteUsuario,
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
