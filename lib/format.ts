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
 *
 * `Intl` en es-AR intercala un espacio duro entre el signo y la cifra
 * ("$ 1.750.000"). El sistema de diseño lo escribe pegado —los 105
 * importes del mockup, sin una excepción— así que se quita. Se hace acá y no
 * en el componente Money para que siga habiendo un solo formateo de plata en
 * toda la app: si convivieran los dos, la misma cifra se vería distinta según
 * qué pantalla la muestre.
 */
export function formatMoney(n: number): string {
  // El separador es U+00A0 (espacio duro), no un espacio común: se escribe
  // escapado porque en el código fuente los dos se ven igual.
  return MONEDA.format(n).replace('\u00A0', '')
}

/**
 * Importe abreviado, para donde no entra la cifra completa: ejes de gráficos,
 * barras, etiquetas apretadas.
 *
 * `$2,5M` · `$850k` · `$900`. Redondea, así que NO sirve para un número que el
 * operador vaya a leer como dato: para eso está `formatMoney`. Acá el objetivo
 * es ubicar una magnitud en un eje, no informar un saldo.
 */
export function formatMoneyCorto(n: number): string {
  const signo = n < 0 ? '-' : ''
  const abs = Math.abs(n)

  if (abs >= 1_000_000) {
    return `${signo}$${(abs / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`
  }
  if (abs >= 1_000) {
    return `${signo}$${(abs / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 0 })}k`
  }
  return `${signo}$${abs.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

const ENTERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

/**
 * Un conteo: equipos, partidos, cuotas. Lleva separador de miles y NO lleva `$`.
 *
 * Vive acá y no en el componente por el mismo motivo que `formatMoney`: que
 * haya un solo lugar donde se decide cómo se escribe un número en la app.
 */
export function formatEntero(n: number): string {
  return ENTERO.format(n)
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
