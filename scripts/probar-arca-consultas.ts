import { autenticarArca } from '../lib/arca-wsaa-core.ts'
import { feDummy, puntosDeVentaHabilitados, condicionesIvaReceptor, tiposDeIva } from '../lib/arca-wsfev1-consultas.ts'

const CUIT_CAMPA = '30715502670'

async function main() {
  console.log('1. FEDummy...')
  const dummy = await feDummy(true)
  console.log('   ', dummy.appServer, dummy.dbServer, dummy.authServer)
  console.log('')

  console.log('2. Autenticando UNA VEZ (WSAA) para el resto de las consultas...')
  const ticket = await autenticarArca('wsfe', true)
  console.log('   Ticket obtenido, expira:', ticket.expirationTime.toISOString())
  console.log('')

  console.log('3. Puntos de venta...')
  const puntos = await puntosDeVentaHabilitados(ticket, CUIT_CAMPA, true)
  puntos.forEach((p) => console.log(`    Punto ${p.numero} — ${p.emisionTipo}`))
  console.log('')

  console.log('4. Condiciones de IVA receptor...')
  const condiciones = await condicionesIvaReceptor(ticket, CUIT_CAMPA, true)
  condiciones.forEach((c) => console.log(`    Id ${c.id} — ${c.descripcion}`))
  console.log('')

  console.log('5. Tipos de IVA (alícuotas)...')
  const tipos = await tiposDeIva(ticket, CUIT_CAMPA, true)
  tipos.forEach((t) => console.log(`    Id ${t.id} — ${t.descripcion}`))
}

main().catch((err) => {
  console.error('❌ Error:', err)
  process.exit(1)
})