// El PDF de una factura de PATROCINIO.
//
// No toca la base ni ARCA: `datosFacturaDesdeFila` y `generarFacturaPDF` son
// puros —reciben una fila y devuelven bytes—, así que se pueden probar con la
// fila que la emisión de un sponsor va a producir, sin emitir nada.
//
// Lo que prueba: que el generador NO tiene nada específico del origen equipo.
// La única diferencia entre una factura de equipo y una de sponsor es de qué
// columna cuelga (`cuota_cobro_sponsor_id` en vez de `pago_id`), y esa columna
// ni siquiera llega al papel.
import { writeFileSync } from 'node:fs'
import { datosFacturaDesdeFila } from '../lib/pdf/desde-fila.ts'
import { generarFacturaPDF } from '../lib/pdf/factura.ts'

const MONTO = 4_000_000
const NETO = Math.round((MONTO / 1.21) * 100) / 100

// Espeja lo que `reservar_numero_comprobante` deja en la fila al facturarle a
// «Bodega Los Cerros», que no tiene datos fiscales: consumidor final, 99/0.
const fila = {
  tipo_comprobante: 6,
  punto_venta: 10,
  numero: 2,
  fecha_emision: '2026-08-30',
  receptor_nombre: 'Bodega Los Cerros',
  receptor_doc_tipo: 99,
  receptor_doc_nro: '0',
  receptor_domicilio: null,
  detalle: 'Cuota de sponsor · Bodega Los Cerros',
  monto: MONTO,
  neto: NETO,
  iva: Math.round((MONTO - NETO) * 100) / 100,
  cae: '86350000000000',
  cae_vencimiento: '2026-09-09',
  tipo_cod_aut: 'E',
  moneda: 'PES',
  cotizacion: 1,
  emisor_domicilio: 'Av. Siempre Viva 742, Córdoba',
}

const emisor = {
  razonSocial: 'CAMPA SRL',
  cuit: '30-71550267-0',
  condicionIva: 'Responsable Inscripto',
  ingresosBrutos: '901-123456-7',
  inicioActividades: '2024-01-15',
  domicilioComercial: null as string | null,
}

// En una función y no top-level: tsx compila a CJS, que no admite await suelto.
async function main() {
const datos = datosFacturaDesdeFila(fila as never, emisor as never, 'Consumidor Final')
const bytes = await generarFacturaPDF(datos)

const destino = process.argv[2] ?? 'factura-sponsor.pdf'
writeFileSync(destino, bytes)

console.log('  letra              :', datos.tipoComprobante === 6 ? 'B' : 'A', '(tipo', datos.tipoComprobante + ')')
console.log('  receptor           :', datos.receptorNombre, '· doc', datos.receptorDocTipo + '/' + datos.receptorDocNro)
console.log('  detalle            :', datos.detalle)
console.log('  neto + iva = total :', datos.neto, '+', datos.iva, '=', Math.round((datos.neto + datos.iva) * 100) / 100,
            Math.round((datos.neto + datos.iva) * 100) / 100 === datos.monto ? '✅ cierra al centavo' : '🔴 NO cierra')
console.log('  PDF                :', bytes.length, 'bytes →', destino)
}

main()
