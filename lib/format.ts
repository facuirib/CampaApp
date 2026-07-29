const MONEDA = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

/**
 * Importe en pesos, redondeado a peso entero.
 *
 * Cada importe se redondea por separado, así que una columna de filas puede no
 * sumar exactamente el total que se muestra abajo. No es un descuadre: cada
 * número sale de su propia vista SQL, con los centavos completos.
 */
export function formatMoney(n: number): string {
  return MONEDA.format(n)
}

/** El torneo es en Córdoba: las fechas con hora se muestran en esa zona. */
const FECHA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Cordoba',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** Lo que se muestra cuando no hay fecha. */
const SIN_DATO = '—'

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Fecha en formato es-AR: dd/mm/aaaa.
 *
 * Acepta lo que devuelve Supabase para una columna `date` ('2026-07-29') y
 * también `Date` o timestamps ISO. Sin fecha devuelve '—'.
 *
 * Una columna `date` se formatea a partir del string, sin construir un `Date`:
 * `new Date('2026-07-29')` es medianoche UTC y en Córdoba (UTC-3) se muestra
 * como 28/07/2026. Los vencimientos de cuota se correrían un día para atrás.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return SIN_DATO

  if (typeof value === 'string') {
    const soloFecha = SOLO_FECHA.exec(value)
    if (soloFecha) {
      const [, aaaa, mm, dd] = soloFecha
      return `${dd}/${mm}/${aaaa}`
    }
  }

  const fecha = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(fecha.getTime())) return SIN_DATO

  return FECHA.format(fecha)
}
