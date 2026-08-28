import { readFileSync, writeFileSync } from 'node:fs'

import { createClient } from '@supabase/supabase-js'

import { datosFacturaDesdeFila } from '../lib/pdf/desde-fila.ts'
import { generarFacturaPDF, type DatosFactura } from '../lib/pdf/factura.ts'

/**
 * Genera el PDF de un comprobante que YA está en la base.
 *
 *   node --experimental-strip-types scripts/factura-de-comprobante.ts 200 407
 *
 * Es el mapeo fila → `DatosFactura`, que es exactamente lo que va a hacer la
 * pantalla de emisión. El generador sigue siendo puro: la consulta vive acá,
 * afuera; él sólo recibe datos.
 *
 * Entra con `service_role` porque es una herramienta de línea de comandos, no
 * una pantalla. Nunca lo importe código de la app.
 */

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const [punto, numero] = process.argv.slice(2).map(Number)
if (!punto || !numero) throw new Error('Uso: … factura-de-comprobante.ts <punto> <numero>')

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

// El join sale de la foreign key: PostgREST deduce las relaciones del catálogo
// de constraints. Cuando este script se escribió, `comprobante` no tenía la FK al
// catálogo de IVA y hubo que traerlo aparte — así apareció el hallazgo. Con la FK
// puesta, el embed funciona.
const { data: c, error } = await db
  .from('comprobante')
  .select('*')
  .eq('punto_venta', punto)
  .eq('numero', numero)
  .single()
if (error || !c) throw new Error(`No encontré el comprobante ${punto}-${numero}: ${error?.message}`)

const { data: e } = await db.from('emisor').select('*').eq('id', true).single()

const { data: condiciones } = await db.from('condicion_iva_receptor').select('id, descripcion')
const descIva = (id: number | null) =>
  condiciones?.find((x) => x.id === id)?.descripcion ?? ''
if (!e) throw new Error('No hay emisor cargado.')

const datos: DatosFactura = datosFacturaDesdeFila(
  c,
  {
    razonSocial: e.razon_social,
    cuit: e.cuit,
    condicionIva: descIva(e.condicion_iva_id),
    ingresosBrutos: e.ingresos_brutos,
    inicioActividades: e.inicio_actividades,
  },
  descIva(c.condicion_iva_receptor_id),
)

const nombre = `factura-${punto}-${String(numero).padStart(8, '0')}.pdf`
const bytes = await generarFacturaPDF(datos)
writeFileSync(nombre, bytes)
console.log(`✅ ${nombre} · ${(bytes.length / 1024).toFixed(1)} KB`)
console.log(`   ${c.receptor_nombre} · CAE ${c.cae} · vto ${c.cae_vencimiento ?? '(sin dato)'}`)
console.log(`   emisor_domicilio en la fila: ${c.emisor_domicilio ?? '(vacío)'}`)
