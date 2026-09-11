import type { CeldaBadge } from '@/components/ui'

/**
 * El estado de un torneo, con su color. UNA tabla para la lista y el detalle.
 *
 * Estaban desincronizados: la lista pintaba `planificado` en ámbar y el
 * detalle en azul, y el detalle no conocía «Dado de baja». El caso literal
 * que la convención de vocabularios describe — hallazgo del diagnóstico 11/09.
 *
 * La baja va primero porque un torneo dado de baja es eso antes que nada:
 * `activo=false` es borrado lógico y pisa cualquier estado del ciclo.
 */
const ESTADOS: Record<string, CeldaBadge> = {
  planificado: { estado: 'porVencer', label: 'Planificado' },
  en_curso: { estado: 'ok', label: 'En curso' },
  cerrado: { estado: 'neutro', label: 'Cerrado' },
}

export function estadoTorneo(estado: string | null, activo: boolean | null): CeldaBadge {
  if (activo === false) return { estado: 'vencido', label: 'Dado de baja' }
  // Un estado que la base agregue mañana cae en gris con su código, en vez de
  // romper o de mentir con un color que no le toca.
  return ESTADOS[estado ?? ''] ?? { estado: 'neutro', label: estado ?? '—' }
}
