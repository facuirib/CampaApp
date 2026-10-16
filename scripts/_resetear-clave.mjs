// USO (en tu terminal, desde la raíz del repo):
//
//   NUEVA_CLAVE='TuClaveNueva' node scripts/_resetear-clave.mjs facuubosch@gmail.com
//
// La clave viaja por variable de entorno de TU terminal: no queda en el chat,
// ni en el historial de git (este archivo se borra después de usarlo).
// Usa la service_role de .env.local — la misma que ya usa la pantalla de
// usuarios — contra la API de admin de Supabase.
//
// 🗑 BORRAME después de usarme: rm scripts/_resetear-clave.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const email = process.argv[2]
const clave = process.env.NUEVA_CLAVE
if (!email || !clave) {
  console.error("Falta algo. Uso: NUEVA_CLAVE='...' node scripts/_resetear-clave.mjs <email>")
  process.exit(1)
}
if (clave.length < 8) {
  console.error('La clave tiene que tener al menos 8 caracteres.')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await admin.auth.admin.listUsers()
if (error) { console.error('No pude listar usuarios:', error.message); process.exit(1) }
const user = data.users.find((u) => u.email === email)
if (!user) { console.error(`No existe ningún usuario con email ${email}`); process.exit(1) }

const { error: e2 } = await admin.auth.admin.updateUserById(user.id, { password: clave })
if (e2) { console.error('No se pudo cambiar:', e2.message); process.exit(1) }

console.log(`✔ Clave cambiada para ${email}. Ya podés entrar con la nueva.`)
console.log('🗑 Ahora borrá este archivo: rm scripts/_resetear-clave.mjs')
