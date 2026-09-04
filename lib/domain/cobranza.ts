import type { EstadoBadge } from '@/components/ui/Badge'
import type { TonoKpi } from '@/components/ui/KpiCard'

/**
 * Las etapas de cobranza, con su nombre visible.
 *
 * ── 🔴 La clave NO es la etiqueta ─────────────────────────────────────────
 *
 * `clave` es el valor que vive en la base —`por_vencer`, `recordatorio`,
 * `firme`—, con un check constraint en `reclamo.etapa` que lo fija, y del que
 * dependen `v_cobranza_momento`, `v_cobranza_cola`, el candado de reclamos y
 * las plantillas (`cobranza_recordatorio`, etc.). **No se renombra.**
 *
 * `etiqueta` es lo único que se lee en pantalla, y se cambia libremente. Hoy
 * `firme` se muestra como «Vencido»: el operador no reclama «en firme», reclama
 * lo que está vencido, y esa es la palabra que usa. La base sigue diciendo
 * `firme` porque cambiar el valor rompería el candado, los filtros y el enganche
 * con las plantillas — sin que nada avise.
 *
 * ── Por qué una sola tabla y no un mapa por pantalla ──────────────────────
 *
 * Estaba escrito a mano en tres lugares, y los tres se habían separado: el
 * dashboard mapeaba una etapa `aviso` que **no existe** —el valor real es
 * `recordatorio`—, así que en cuanto un equipo cayera en esa etapa el gráfico
 * iba a rotularlo con el valor crudo de la base y a dibujarlo sin color. No se
 * veía sólo porque hoy esa cola está en cero.
 *
 * Ese es el argumento: una etapa nueva, o un renombre de etiqueta, se toca acá
 * y aparece en las cuatro pantallas a la vez.
 */
export interface EtapaCobranza {
  /** El valor en la base. No se toca. */
  clave: string
  /** Lo que se lee en pantalla. */
  etiqueta: string
  /** Qué significa estar en esta etapa, para las colas de aviso. */
  bajada: string
  /** Tono de la tarjeta en las colas. */
  tono: TonoKpi
  /** Estado del badge en el historial de avisos. */
  badge: EstadoBadge
  /** Color semántico en los gráficos del dashboard: acá el color SÍ dice algo. */
  color: string
}

/** En orden de severidad creciente, que es como se leen las colas. */
export const ETAPAS_COBRANZA: EtapaCobranza[] = [
  {
    clave: 'por_vencer',
    etiqueta: 'Por vencer',
    bajada: 'Todavía no vencieron. Un aviso amable, antes de que sea un problema.',
    tono: 'info',
    badge: 'info',
    color: 'var(--ok)',
  },
  {
    clave: 'recordatorio',
    etiqueta: 'Recordatorio',
    bajada: 'Vencidas hace poco. Puede que el pago se haya cruzado.',
    tono: 'advertencia',
    badge: 'porVencer',
    color: 'var(--warn)',
  },
  {
    clave: 'firme',
    etiqueta: 'Vencido',
    bajada: 'Vencidas hace tiempo. Hay que regularizar.',
    tono: 'alerta',
    badge: 'mora',
    color: 'var(--err)',
  },
]

const POR_CLAVE = new Map(ETAPAS_COBRANZA.map((e) => [e.clave, e]))

export function etapaCobranza(clave: string | null | undefined): EtapaCobranza | null {
  return POR_CLAVE.get(clave ?? '') ?? null
}

/**
 * La etiqueta de una etapa.
 *
 * Ante una clave desconocida devuelve la clave cruda y no un «—»: si algún día
 * la base gana una etapa que el front no conoce, es mejor ver `moroso_grave` en
 * pantalla —que se entiende y delata el faltante— que un guion que la esconde.
 */
export function etiquetaEtapa(clave: string | null | undefined): string {
  return POR_CLAVE.get(clave ?? '')?.etiqueta ?? clave ?? '—'
}
