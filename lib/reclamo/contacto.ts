/**
 * El teléfono, sacado del campo `tercero.telefono`.
 *
 * `tercero.telefono` es texto libre — "Juan 351 555-1234", "cel 0351 15 5551234",
 * "+54 9 351 5551234"— y WhatsApp necesita un número internacional sin `+` ni
 * separadores. Esto es lo que hay en el medio.
 *
 * **Devuelve `null` ante la menor duda, y eso es la funcionalidad, no una
 * limitación.** Un `wa.me` armado con un número mal interpretado abre WhatsApp
 * con un contacto inexistente —o peor, con el de otra persona— y el operador se
 * entera cuando ya mandó el mensaje. Preferir el botón deshabilitado con un
 * "no se pudo interpretar el número" es la única opción honesta.
 *
 * Dos caminos, según lo que haya escrito quien cargó el contacto:
 *
 *   · **Con `+`** — el número ya viene en forma internacional y se toma tal
 *     cual. El `+` no es decoración: es la persona diciendo "esto incluye el
 *     código de país". Sirve para cualquier país sin que el módulo tenga que
 *     conocerlos.
 *
 *   · **Sin `+`** — se asume numeración **argentina**, que es donde corre el
 *     torneo: código 54, el 9 que WhatsApp exige para móviles, y diez dígitos
 *     de área + abonado.
 */

/** Rango de E.164: ningún número de teléfono del mundo sale de acá. */
const LARGO_E164_MIN = 8
const LARGO_E164_MAX = 15

/** El formato que espera wa.me: 54 9 + área + abonado, sin signos. */
const PREFIJO_MOVIL_AR = '549'

/** Área + abonado, siempre diez dígitos en Argentina. */
const LARGO_NACIONAL = 10

export interface TelefonoParseado {
  /** Listo para `wa.me`, o null si no se pudo interpretar con certeza. */
  numero: string | null
  /** Por qué no se pudo. Se muestra al lado del botón deshabilitado. */
  motivo?: string
}

export function parsearTelefono(contacto: string | null | undefined): TelefonoParseado {
  if (!contacto || !contacto.trim()) {
    return { numero: null, motivo: 'Sin contacto cargado' }
  }

  const digitos = contacto.replace(/\D/g, '')

  if (digitos.length === 0) {
    return { numero: null, motivo: 'El contacto no tiene ningún número' }
  }

  // ── Internacional explícito ──────────────────────────────────────────────
  //
  // Si escribieron el `+`, ya dijeron cuál es el país: no hay nada que inferir
  // y no hay por qué limitarlo a Argentina. Sólo se comprueba que el largo
  // entre en E.164, para no armar un wa.me con cuatro dígitos.
  if (contacto.includes('+')) {
    if (digitos.length < LARGO_E164_MIN || digitos.length > LARGO_E164_MAX) {
      return {
        numero: null,
        motivo: `El número internacional tiene ${digitos.length} dígitos y no es un largo posible`,
      }
    }
    return { numero: digitos }
  }

  // ── Sin `+`: se asume Argentina ──────────────────────────────────────────

  // Ya viene completo: 549 + diez.
  if (digitos.length === 3 + LARGO_NACIONAL && digitos.startsWith(PREFIJO_MOVIL_AR)) {
    return { numero: digitos }
  }

  // Con país pero sin el 9 de móvil: 54 + diez. WhatsApp lo exige, se agrega.
  if (digitos.length === 2 + LARGO_NACIONAL && digitos.startsWith('54')) {
    return { numero: PREFIJO_MOVIL_AR + digitos.slice(2) }
  }

  // Nacional pelado: área + abonado.
  if (digitos.length === LARGO_NACIONAL) {
    return { numero: PREFIJO_MOVIL_AR + digitos }
  }

  // Con el 0 de larga distancia: 0 + área + abonado.
  if (digitos.length === 1 + LARGO_NACIONAL && digitos.startsWith('0')) {
    return { numero: PREFIJO_MOVIL_AR + digitos.slice(1) }
  }

  // La forma en que se escribe un celular acá: 0 + área + 15 + abonado.
  //
  // Trece dígitos empezando en 0 sólo cierran si el 15 está: área + abonado son
  // diez, más el 0 son once, y los dos que sobran son el 15. Se lo busca dentro
  // de las primeras posiciones porque el área tiene entre dos y cuatro dígitos,
  // y se acepta únicamente si al sacarlo quedan los diez exactos.
  if (digitos.length === 3 + LARGO_NACIONAL && digitos.startsWith('0')) {
    const sinCero = digitos.slice(1)
    for (let i = 2; i <= 4; i++) {
      if (sinCero.slice(i, i + 2) === '15') {
        const nacional = sinCero.slice(0, i) + sinCero.slice(i + 2)
        if (nacional.length === LARGO_NACIONAL) {
          return { numero: PREFIJO_MOVIL_AR + nacional }
        }
      }
    }
  }

  // ── Todo lo demás no se interpreta ───────────────────────────────────────
  //
  // Podría intentarse más —recortar, completar, suponer un área— pero cada
  // suposición es un mensaje que puede terminar en el teléfono equivocado.
  return {
    numero: null,
    motivo:
      `No se pudo interpretar el número (${digitos.length} dígitos). ` +
      'Si es de otro país, escribilo con + y el código.',
  }
}

/**
 * El link que abre WhatsApp con el mensaje escrito.
 *
 * No manda nada: abre la conversación con el texto puesto y la persona aprieta
 * enviar. Por eso el sistema **no puede saber si se mandó**, y por eso el
 * registro del reclamo es un paso aparte y explícito.
 */
export function linkWhatsApp(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}
