// scripts/probar-arca-wsaa.ts
// Script de prueba AISLADO, no forma parte de la app. Solo verifica que
// la autenticación contra el WSAA de ARCA funciona con el certificado
// real. NO emite ningún comprobante — solo pide el Ticket de Acceso.
//
// Correr con: node --experimental-strip-types scripts/probar-arca-wsaa.ts
//
// Requiere ARCA_CERT_PEM y ARCA_KEY_PEM en el entorno (.env.local).

import { autenticarArca } from '../lib/arca-wsaa-core.ts'

async function main() {
  console.log('Probando autenticación contra ARCA (WSAA)...')
  console.log('Ambiente: PRODUCCIÓN (solo login, no se emite nada)')
  console.log('')

  try {
    const ticket = await autenticarArca('wsfe', true)
    console.log('✅ Autenticación exitosa')
    console.log('Token (primeros 20 caracteres):', ticket.token.slice(0, 20) + '...')
    console.log('Expira:', ticket.expirationTime.toISOString())
  } catch (err) {
    console.error('❌ Error en la autenticación:')
    console.error(err)
    process.exit(1)
  }
}

main()