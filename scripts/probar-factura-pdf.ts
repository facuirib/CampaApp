import { writeFileSync } from 'node:fs'

import { generarFacturaPDF, type DatosFactura } from '../lib/pdf/factura.ts'

/**
 * Genera una Factura A y una B de ejemplo, para mirarlas.
 *
 *   node --experimental-strip-types scripts/probar-factura-pdf.ts
 *
 * Son datos inventados con la forma de una fila real de `comprobante` más el
 * emisor de la tabla `emisor`. No consulta la base: el generador es puro y esto
 * lo demuestra.
 */

const EMISOR = {
  razonSocial: 'CAMPA SRL',
  cuit: '30-71550267-0',
  // Congelado en comprobante.emisor_domicilio, del punto de venta elegido.
  domicilioComercial: 'De los Latinos y Costa Canal 0, Ciudad de Córdoba Norte',
  condicionIva: 'IVA Responsable Inscripto',
  ingresosBrutos: '270-123456-7',
  inicioActividades: '2019-03-01',
}

// El total es el dato duro; neto y IVA se derivan. 10.000 → 8.264,46 + 1.735,54
const TOTAL = 10000
const NETO = Math.round((TOTAL / 1.21) * 100) / 100
const IVA = Math.round((TOTAL - NETO) * 100) / 100

const BASE = {
  puntoVenta: 10,
  numero: 408,
  fecha: '2026-08-27',
  detalle: 'Inscripción y fechas 1 a 5 · Torneo Clausura 2026',
  monto: TOTAL,
  neto: NETO,
  iva: IVA,
  cae: '86349910665002',
  caeVencimiento: '2026-09-06',
  tipoCodAut: 'E' as const,
  moneda: 'PES',
  cotizacion: 1,
  emisor: EMISOR,
}

const FACTURA_A: DatosFactura = {
  ...BASE,
  tipoComprobante: 1,
  receptorNombre: 'Deportivo Barcelo SRL',
  receptorDocTipo: 80,
  receptorDocNro: '30-71234567-9',
  receptorCondicionIva: 'IVA Responsable Inscripto',
  receptorDomicilio: 'Av. Colón 1234, Córdoba',
}

const FACTURA_B: DatosFactura = {
  ...BASE,
  numero: 409,
  tipoComprobante: 6,
  // Con emoji a propósito: es el caso que rompía el render antes del saneo.
  receptorNombre: 'Club Atlético Los Pumas 🏆',
  receptorDocTipo: 96,
  receptorDocNro: '35123456',
  receptorCondicionIva: 'Consumidor Final',
  receptorDomicilio: null,
}

for (const [nombre, datos] of [
  ['factura-A-ejemplo.pdf', FACTURA_A],
  ['factura-B-ejemplo.pdf', FACTURA_B],
] as const) {
  const bytes = await generarFacturaPDF(datos)
  writeFileSync(nombre, bytes)
  console.log(`✅ ${nombre} · ${(bytes.length / 1024).toFixed(1)} KB`)
}
