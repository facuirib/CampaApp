/**
 * Los parámetros de `/gastos` y cómo se combinan.
 *
 * Vive acá y no en cada componente porque los construyen tres lugares —las
 * tarjetas de naturaleza, el toggle de impagos y los enlaces de la tabla— y
 * todos tienen que **conservar los demás filtros**. Un `href` armado a mano en
 * cada lado es cómo se pierde el período al tocar una tarjeta.
 */

export interface ParamsGastos {
  anio?: string
  mes?: string
  naturaleza?: string
  /** '1' = ver sólo impagos, ignorando el período. */
  impagos?: string
}

/**
 * El href de `/gastos` con algunos parámetros cambiados y el resto intacto.
 *
 * `null` en un cambio BORRA ese parámetro — es lo que usa una tarjeta ya
 * activa para volver a «todas», y el toggle para apagarse.
 */
export function hrefGastos(
  actuales: ParamsGastos,
  cambios: Partial<Record<keyof ParamsGastos, string | null>>,
): string {
  const q = new URLSearchParams()

  for (const [clave, valor] of Object.entries({ ...actuales, ...cambios })) {
    if (valor) q.set(clave, valor)
  }

  const s = q.toString()
  return s ? `/gastos?${s}` : '/gastos'
}

/**
 * El rango de fechas del período, como `[desde, hasta)`.
 *
 * El tope es EXCLUSIVO y por eso se compara con `lt` y no con `lte`: el último
 * día del mes con hora distinta de cero quedaría afuera de un `lte`. Es el
 * mismo motivo por el que el mes que viene se calcula sumando uno y no
 * restando un día.
 */
export function rangoPeriodo(anio: number, mes: number | null): [string, string] {
  const dosDigitos = (n: number) => String(n).padStart(2, '0')

  if (mes == null) return [`${anio}-01-01`, `${anio + 1}-01-01`]

  const anioSiguiente = mes === 12 ? anio + 1 : anio
  const mesSiguiente = mes === 12 ? 1 : mes + 1

  return [`${anio}-${dosDigitos(mes)}-01`, `${anioSiguiente}-${dosDigitos(mesSiguiente)}-01`]
}
