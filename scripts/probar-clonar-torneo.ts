// scripts/probar-clonar-torneo.ts
// Prueba clonar_torneo con sesión real. Crea un torneo real de prueba
// (no hay rollback disponible desde un script).

import { createClient } from '@supabase/supabase-js'

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

  console.log('Clonando torneo "Clausura 2026"...')
  const { data, error } = await cliente.rpc('clonar_torneo', {
    p_torneo_origen_id: '826f8fd6-c3b8-48c8-946d-8001cc3c7f49',
    p_nombre_nuevo: 'Prueba Clon Clausura 2027',
    p_anio: 2027,
    p_temporada: 'clausura',
    p_ejercicio_id: '9a06fcec-2bbb-4cbc-bffe-1a8f3a27aada',
  })

  if (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }

  console.log('✅ Torneo nuevo creado:', data)
}

main().catch((err) => {
  console.error('❌ Error general:', err)
  process.exit(1)
})
