import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const password = process.env.PRUEBA_ADMIN_PASSWORD!

  const cliente = createClient(url, anonKey)
  await cliente.auth.signInWithPassword({
    email: 'horaciobecerra90@gmail.com',
    password,
  })

  const { data, error } = await cliente.rpc('crear_proveedor', {
    p_nombre: 'Proveedor de prueba',
  })

  if (error) {
    console.error('❌ Error:', JSON.stringify(error, null, 2))
  } else {
    console.log('✅ Creado:', data)
  }
}

main()
