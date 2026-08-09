import type { Json } from './database.types'
import type { LineaAsiento } from '@/components/ui'

/**
 * El contrato que devuelven todas las `preview_*` de la base.
 *
 * Las tres —`preview_cobro`, `preview_gasto`, `preview_pago_gasto`— devuelven
 * la misma forma, y la migración de gastos la dejó fijada para las que vengan:
 * las líneas traen `nombre` (no `cuenta_nombre`), y los totales salen sumados
 * de las líneas reales, no repetidos de una variable.
 */
export interface PreviewAsiento {
  lineas: LineaAsiento[]
  total_debe: number
  total_haber: number
  balanceado: boolean
}

/**
 * Convierte el `Json` de una `preview_*` en un asiento tipado.
 *
 * Hace falta porque PostgREST tipa todo `returns jsonb` como `Json`, que es
 * una unión de todo lo que entra en un JSON: sin narrowing no se puede leer
 * `.lineas` sin mentirle al compilador. Antes las pantallas resolvían esto
 * casteando `supabase.rpc` a mano —un `as unknown as` que además apagaba el
 * chequeo de los argumentos—, y cada una repetía su propia interfaz.
 *
 * Devuelve `null` si la forma no es la esperada, en vez de romper: una función
 * de preview que cambió de contrato tiene que dar un error en pantalla, no una
 * pantalla en blanco.
 */
export function leerPreviewAsiento(data: Json): PreviewAsiento | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null

  const { lineas, total_debe, total_haber, balanceado } = data

  if (!Array.isArray(lineas)) return null
  if (typeof total_debe !== 'number') return null
  if (typeof total_haber !== 'number') return null
  if (typeof balanceado !== 'boolean') return null

  const parseadas: LineaAsiento[] = []

  for (const linea of lineas) {
    if (typeof linea !== 'object' || linea === null || Array.isArray(linea)) return null
    if (typeof linea.cuenta !== 'string') return null

    parseadas.push({
      cuenta: linea.cuenta,
      nombre: typeof linea.nombre === 'string' ? linea.nombre : null,
      // Solo viene el lado que corresponde; el otro llega ausente.
      debe: typeof linea.debe === 'number' ? linea.debe : null,
      haber: typeof linea.haber === 'number' ? linea.haber : null,
    })
  }

  return { lineas: parseadas, total_debe, total_haber, balanceado }
}

/** Lo que muestran las pantallas cuando el `Json` no respeta el contrato. */
export const ERROR_PREVIEW_INESPERADO =
  'La función de preview devolvió una forma inesperada. El asiento no se puede mostrar.'
