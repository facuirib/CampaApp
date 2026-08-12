import type { CeldaBadge } from '@/components/ui'

/**
 * El estado de un socio, tal como lo deriva `v_socio_lista`.
 *
 * Vive acá y no en una pantalla porque lo usan las dos —la lista lo muestra en
 * una columna, el detalle al lado del nombre— y un mismo estado tiene que verse
 * igual en las dos. Si cada una tuviera su mapa, alcanzaría con tocar una para
 * que el mismo socio apareciera rojo en un lado y azul en el otro. Mismo
 * criterio que `sponsor.ts`.
 *
 * Los cuatro colores, y por qué:
 *
 *   · `en_contra` en ROJO. El socio retiró más de lo que devengó: se llevó
 *     plata que todavía no le corresponde. Es el único que pide una
 *     conversación, y por eso también es el que gana el orden de prioridad en
 *     la vista.
 *
 *   · `sin_sueldo` en ÁMBAR. No hay sueldo acordado cargado, así que el devengo
 *     mensual no le va a asentar nada. No está mal, está incompleto — es
 *     trabajo pendiente, igual que `sin_contrato` en sponsors.
 *
 *   · `al_dia` en VERDE. Saldo exactamente cero: no hay nada pendiente en
 *     ninguna dirección. Es el estado cerrado.
 *
 *   · `a_favor` en AZUL INFO y no en verde. El club le debe al socio, que es lo
 *     NORMAL —se devenga todo el mes y se retira cuando se puede—, pero no es
 *     lo mismo que estar en cero: hay plata pendiente de pagar. Verde diría
 *     "listo, nada que hacer" sobre algo que sí queda por hacer.
 */
const ESTADOS: Record<string, CeldaBadge> = {
  en_contra: { estado: 'mora', label: 'Retiró de más' },
  sin_sueldo: { estado: 'porVencer', label: 'Sin sueldo' },
  al_dia: { estado: 'alDia', label: 'Al día' },
  a_favor: { estado: 'info', label: 'A favor' },
}

export function estadoSocio(codigo: string | null): CeldaBadge {
  // Un estado que la vista agregue mañana cae en gris con su código, en vez de
  // romper o de mentir con un color que no le toca.
  return ESTADOS[codigo ?? ''] ?? { estado: 'neutro', label: codigo ?? '—' }
}
