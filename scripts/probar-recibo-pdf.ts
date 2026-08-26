/**
 * Genera un recibo de EJEMPLO para revisar el layout.
 *
 *   npm run probar:recibo
 *
 * Lo ficticio es el dato, no el generador: `generarReciboPDF` es el mismo que
 * después va a recibir una fila real de `comprobante`. Este script existe
 * porque la base no tiene comprobantes todavía y **no se toca `registrar_cobro`
 * para conseguir uno** — esa integración es del carril de Horacio.
 */

import { writeFileSync } from 'node:fs'
import { generarReciboPDF } from '../lib/pdf/recibo.ts'

const salida = process.argv[2] ?? 'recibo-ejemplo.pdf'

const bytes = await generarReciboPDF({
  numero: 123,
  fecha: '2026-08-26',
  receptorNombre: 'Barcelo Fem',
  receptorDocumento: 'DNI 35.123.456',
  receptorCondicionIva: 'Consumidor Final',
  receptorDomicilio: null,
  detalle: 'Cuota 3 · Clausura 2026',
  monto: 130000,
  emitidoPor: 'Facundo Bosch',
})

writeFileSync(salida, bytes)
console.log(`✅ ${salida} · ${(bytes.length / 1024).toFixed(1)} KB`)
