// scripts/probar-flujo-completo.ts
// ⚠️ ESTE SCRIPT CREA UN PAGO REAL ($0.01) SOBRE UN TERCERO REAL, Y
// EMITE UNA FACTURA REAL EN PRODUCCIÓN. Decisión tomada con Horacio
// 28/08, monto mínimo posible.

import { createClient } from '@supabase/supabase-js'
import { emitirFacturaCompleta } from '../lib/arca-fecaesolicitar.ts'

const CUIT_CAMPA = '30715502670'
const PUNTO_VENTA = 10
const TERCERO_ID = 'd4cec202-6495-4aae-9976-45e00c7f8be4'
const CUOTA_ID = 'f3ff3ac4-126c-4bfd-a67e-31b055f47173'
const MONTO = 1

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const password = process.env.PRUEBA_ADMIN_PASSWORD

  if (!password) {
    throw new Error('Falta PRUEBA_ADMIN_PASSWORD en el entorno.')
  }

  const cliente = createClient(url, anonKey)

  console.log('0. Iniciando sesión...')
  const { data: sessionData, error: sessionError } = await cliente.auth.signInWithPassword({
    email: 'horaciobecerra90@gmail.com',
    password,
  })
  if (sessionError || !sessionData.session) {
    throw new Error(`No se pudo iniciar sesión: ${sessionError?.message}`)
  }
  console.log('   OK:', sessionData.user?.email)
  console.log('')

  console.log('1. Registrando el cobro real ($0.01)...')
  const { data: pagoId, error: errorCobro } = await cliente.rpc('registrar_cobro', {
    p_tercero_id: TERCERO_ID,
    p_monto: MONTO,
    p_medio: 'transferencia',
    p_fecha: new Date().toISOString().slice(0, 10),
    p_imputaciones: [{ cuota_id: CUOTA_ID, monto: MONTO }],
  })
  if (errorCobro) {
    throw new Error(`No se pudo registrar el cobro: ${errorCobro.message}`)
  }
  console.log('   Pago creado:', pagoId)
  console.log('')

  console.log('2. Emitiendo factura completa (reservar + ARCA + cerrar)...')
  const resultado = await emitirFacturaCompleta(
    cliente,
    {
      cuit: CUIT_CAMPA,
      montoConIva: MONTO,
      condicionIvaReceptorId: 5,
      receptorNombre: 'Consumidor Final',
      receptorDocTipo: 99,
      receptorDocNro: '0',
      pagoId: pagoId as string,
    },
    PUNTO_VENTA,
    true
  )

  console.log('')
  console.log('=== RESULTADO ===')
  console.log('Pago ID:', pagoId)
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
