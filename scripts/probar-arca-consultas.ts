// scripts/probar-arca-consultas.ts
// Script de prueba AISLADO. Solo CONSULTA datos de ARCA — no emite
// ningún comprobante. Seguro de correr contra producción.
//
// Correr con: node --env-file=.env.local --tls-cipher-list='DEFAULT@SECLEVEL=1' --experimental-strip-types scripts/probar-arca-consultas.ts

import { feDummy, puntosDeVentaHabilitados, condicionesIvaReceptor } from '../lib/arca-wsfev1-consultas.ts'

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
  puntos.forEach((p) => {
    console.log(`   Punto ${p.numero} — tipo: ${p.emisionTipo} — bloqueado: ${p.bloqueado}`)
  })
  console.log('')

  console.log('3. Consultando condiciones de IVA de receptor válidas...')
  const condiciones = await condicionesIvaReceptor(true)
  condiciones.forEach((c) => {
    console.log(`   Id ${c.id} — ${c.descripcion}`)
  })
}

main().catch((err) => {
  console.error('❌ Error:', err)
  process.exit(1)
})
