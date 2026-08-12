/**
 * Los meses del P&L, en su orden.
 *
 * Vive acá y no en la pantalla porque lo usan la matriz —doce columnas— y
 * cualquier cosa que después muestre un mes suelto. Índice 0 = enero.
 */
export const MESES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
] as const

/** «Julio» completo, para los subtítulos donde la abreviatura queda pobre. */
export const MESES_LARGO = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

/** Los tres bloques de la matriz, en el orden en que se leen. */
export type BloquePL = 'ingreso' | 'egreso' | 'financiero'

export const TITULO_BLOQUE: Record<BloquePL, string> = {
  ingreso: 'Ingresos',
  egreso: 'Egresos',
  financiero: 'Resultado financiero',
}
