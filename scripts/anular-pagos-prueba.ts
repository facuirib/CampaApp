// scripts/anular-pagos-prueba.ts
// Anula los 2 pagos de prueba SIN factura fiscal real (f0e252bd y el
// de Facu si corresponde). El de cc7fcc49 (con factura ARCA) NO se
// puede anular con esta función — necesita nota de crédito.

import { createClient } from '@supabase/supabase-js'

const PAGOS_A_ANULAR = [
  'f0e252bd-36ec-42df-be9c-cebe6d9024ea', // $1000, sin comprobante
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const password = process.env.PRUEBA_ADMIN_PASSWORD

  if (!password) {
    throw new Error('Falta PRUEBA_ADMIN_PASSWORD en el entorno.')
  }

  const cliente = createClient(url, anonKey)

  console.log('Iniciando sesión...')
  const { data: sessionData, error: sessionError } = await cliente.auth.signInWithPassword({
    email: 'horaciobecerra90@gmail.com',
    password,
  })
  if (sessionError || !sessionData.session) {
    throw new Error(`No se pudo iniciar sesión: ${sessionError?.message}`)
  }
  console.log('OK:', sessionData.user?.email)
  console.log('')

  for (const pagoId of PAGOS_A_ANULAR) {
    console.log(`Anulando pago ${pagoId}...`)
    const { data, error } = await cliente.rpc('anular_pago', {
      p_pago_id: pagoId,
      p_motivo: 'Cobro de prueba, limpieza de datos de testing',
    })
    if (error) {
      console.error(`  ❌ Error: ${error.message}`)
    } else {
      console.log(`  ✅ Anulado, nuevo asiento (contraasiento): ${data}`)
    }
  }
}

main().catch((err) => {
  console.error('❌ Error general:', err)
  process.exit(1)
})
