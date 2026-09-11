/**
 * El medio de pago, con su nombre visible. UNA tabla para todas las pantallas.
 *
 * Es el vocabulario de la regla 5 —«Efectivo» y «Transferencia», nunca otra
 * terminología— y estaba escrito a mano en siete lugares, con órdenes y
 * conjuntos distintos. La etiqueta vive acá; cada pantalla ELIGE su subconjunto
 * con `mediosPago(...)`, porque el conjunto sí es de la pantalla: un retiro de
 * socio sale de la caja central, un cobro en la cancha puede ser un cheque, y
 * la ficha sólo congela efectivo o transferencia.
 *
 * `clave` es el valor en la base (checks de `pago.medio_pago`,
 * `gasto.medio_pago`, `cuota.medio_previsto`). No se renombra.
 */

export interface MedioPago {
  clave: string
  label: string
}

/** El orden canónico: como se cobran las cuotas — efectivo primero. */
export const MEDIOS_PAGO: readonly MedioPago[] = [
  { clave: 'efectivo', label: 'Efectivo' },
  { clave: 'transferencia', label: 'Transferencia' },
  { clave: 'cheque', label: 'Cheque' },
  { clave: 'efectivo_transito', label: 'Efectivo en tránsito' },
  { clave: 'central', label: 'Caja central' },
] as const

/**
 * El subconjunto de una pantalla, en el orden canónico. Genérico sobre las
 * claves para que `(typeof MEDIOS)[number]['clave']` siga siendo la unión
 * literal — un `setMedio('centrall')` con typo no compila.
 */
export function mediosPago<K extends string>(
  claves: readonly K[],
): readonly { clave: K; label: string }[] {
  return MEDIOS_PAGO.filter((m): m is MedioPago & { clave: K } =>
    (claves as readonly string[]).includes(m.clave),
  )
}

/** La etiqueta de un medio. Clave desconocida → la clave cruda, que delata. */
export function etiquetaMedio(clave: string | null): string {
  return MEDIOS_PAGO.find((m) => m.clave === clave)?.label ?? clave ?? '—'
}
