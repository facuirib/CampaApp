/**
 * Los orígenes de asiento, con rótulo legible.
 *
 * Las claves son el dominio del CHECK de `asiento.origen`. Es schema, no datos
 * de un torneo, así que enumerarlas acá no choca con la regla 12: no hay torneo
 * nuevo que agregue un origen.
 *
 * Un origen que la base agregue mañana y que no esté acá cae en su propio
 * código —`rotuloOrigen` no rompe— y el filtro lo sigue ofreciendo, porque las
 * opciones salen de los datos y no de este mapa.
 */
export const ORIGENES: Record<string, string> = {
  devengo_equipo: 'Devengo de equipo',
  pago_equipo: 'Cobro de equipo',
  gasto_devengo: 'Devengo de gasto',
  gasto_pago: 'Pago de gasto',
  bar: 'Bar',
  arqueo: 'Arqueo',
  sponsor: 'Sponsor',
  socio: 'Socio',
  usd: 'Dólares',
  amortizacion: 'Amortización',
  cheque: 'Cheque',
  fondo: 'Fondo de inversión',
  ajuste: 'Ajuste',
  apertura: 'Apertura',
}

export function rotuloOrigen(codigo: string | null): string {
  if (!codigo) return '—'
  return ORIGENES[codigo] ?? codigo
}

/** Período mensual: "08/2026". Mismo formato que socios y sponsors. */
export function formatPeriodo(anio: number | null, mes: number | null): string {
  if (anio == null || mes == null) return '—'
  return `${String(mes).padStart(2, '0')}/${anio}`
}

/** Clave de período para la URL y para comparar: "2026-08". */
export function clavePeriodo(anio: number | null, mes: number | null): string {
  if (anio == null || mes == null) return ''
  return `${anio}-${String(mes).padStart(2, '0')}`
}
