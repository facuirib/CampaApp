import type { CeldaBadge } from '@/components/ui'

/**
 * El estado de un sponsor, tal como lo deriva `v_sponsor_lista`.
 *
 * Vive acá y no en una pantalla porque lo usan las dos —la lista lo muestra en
 * una columna, el detalle al lado del nombre— y un mismo estado tiene que verse
 * igual en las dos. Si cada una tuviera su mapa, alcanzaría con tocar una para
 * que el mismo sponsor apareciera verde en un lado y gris en el otro.
 *
 * `en_mora` es el único en rojo: es plata que ya tendría que haber entrado.
 * `sin_contrato` va en ámbar y no en gris porque es algo a resolver —un sponsor
 * cargado sin contrato es trabajo pendiente, no un estado tranquilo—.
 */
const ESTADOS: Record<string, CeldaBadge> = {
  en_mora: { estado: 'mora', label: 'En mora' },
  al_dia: { estado: 'alDia', label: 'Al día' },
  saldado: { estado: 'neutro', label: 'Saldado' },
  sin_contrato: { estado: 'porVencer', label: 'Sin contrato' },
}

export function estadoSponsor(codigo: string | null): CeldaBadge {
  // Un estado que la vista agregue mañana cae en gris con su código, en vez de
  // romper o de mentir con un color que no le toca.
  return ESTADOS[codigo ?? ''] ?? { estado: 'neutro', label: codigo ?? '—' }
}
