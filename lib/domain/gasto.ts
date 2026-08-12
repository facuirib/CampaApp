import type { CeldaBadge } from '@/components/ui'

/**
 * Las cuatro naturalezas de `cat_gasto`, con su etiqueta y su orden.
 *
 * Vive acá y no en la pantalla porque lo usan las tarjetas, el filtro, la
 * tabla y los gráficos. `recurrente` se muestra como **«Fijo»**: es la palabra
 * que se usa en voz alta, y `recurrente` es el nombre de la columna.
 *
 * El orden es de mayor a menor frecuencia esperada, no alfabético: primero lo
 * que se carga todas las fechas.
 */
export const NATURALEZAS = [
  { valor: 'por_fecha', label: 'Por fecha', ayuda: 'Se cargan con cada jornada' },
  { valor: 'recurrente', label: 'Fijo', ayuda: 'Todos los meses, haya o no torneo' },
  { valor: 'eventual', label: 'Eventual', ayuda: 'Una vez, sin repetirse' },
  { valor: 'inversion', label: 'Inversión', ayuda: 'Se amortiza, no se consume' },
] as const

export type Naturaleza = (typeof NATURALEZAS)[number]['valor']

export function naturalezaLabel(n: string | null): string {
  if (n === null) return '—'
  return NATURALEZAS.find((x) => x.valor === n)?.label ?? n
}

/** Las cuatro áreas de `cat_gasto`: a qué parte del negocio se imputa. */
export const AREA_LABEL: Record<string, string> = {
  torneo: 'Torneo',
  predio: 'Predio',
  bar: 'Bar',
  administracion: 'Administración',
}

export function areaLabel(a: string | null): string {
  if (a === null) return '—'
  return AREA_LABEL[a] ?? a
}

/**
 * El estado de pago de un gasto.
 *
 * Son tres y no cuatro: **no existe «parcial»**. `gasto.pagado_at` es un
 * timestamp único, así que un gasto está pagado o no lo está — a diferencia de
 * las cuotas de equipo, que sí admiten imputación parcial. Un cuarto estado
 * exigiría cambiar el modelo, y está encolado.
 *
 * `devengado` se muestra como **«Debe»**: en la pantalla la pregunta es si hay
 * que pagarlo, no en qué momento contable está.
 *
 * `anulado` va en gris y no en rojo: el gasto no está mal, está dado de baja.
 * El rojo es para lo que reclama atención, y un gasto anulado ya no reclama
 * nada — sólo tiene que quedar visible para que no parezca que nunca se cargó.
 */
const ESTADOS: Record<string, CeldaBadge> = {
  pagado: { estado: 'ok', label: 'Pagado' },
  devengado: { estado: 'porVencer', label: 'Debe' },
  anulado: { estado: 'neutro', label: 'Anulado' },
}

export function estadoGasto(codigo: string | null): CeldaBadge {
  return ESTADOS[codigo ?? ''] ?? { estado: 'neutro', label: codigo ?? '—' }
}
