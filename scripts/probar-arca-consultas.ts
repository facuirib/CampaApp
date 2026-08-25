// scripts/probar-arca-consultas.ts
// Script de prueba AISLADO. Solo CONSULTA datos de ARCA — no emite
// ningún comprobante. Seguro de correr contra producción.
//
// Correr con: node --env-file=.env.local --experimental-strip-types scripts/probar-arca-consultas.ts

import { feDummy, puntosDeVentaHabilitados } from '../lib/arca-wsfev1-consultas.ts'

const CUIT_CAMPA = '30715502670'

async function main() {
  console.log('1. Verificando que el servicio está activo (FEDummy)...')
  const dummy = await feDummy(true)
  console.log('   AppServer:', dummy.appServer)
  console.log('   DbServer:', dummy.dbServer)
  console.log('   AuthServer:', dummy.authServer)
  console.log('')

  console.log('2. Consultando puntos de venta habilitados para CAMPA SRL...')
  const puntos = await puntosDeVentaHabilitados(CUIT_CAMPA, true)
  if (puntos.length === 0) {
    console.log('   ⚠️  No hay puntos de venta habilitados para web services.')
    console.log('   Hace falta crear uno en ARCA: "Administración de puntos de venta y domicilios" > A/B/M de puntos de venta.')
  } else {
    puntos.forEach((p) => {
      console.log(`   Punto ${p.numero} — tipo: ${p.emisionTipo} — bloqueado: ${p.bloqueado}`)
    })
  }
}

main().catch((err) => {
  console.error('❌ Error:', err)
  process.exit(1)
})
