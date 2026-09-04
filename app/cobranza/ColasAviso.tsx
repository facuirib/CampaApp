import Link from 'next/link'
import { formatDate, formatMoney } from '@/lib/format'
import { DataTable, Icon, KpiCard, type ColumnDef } from '@/components/ui'
import { ETAPAS_COBRANZA } from '@/lib/domain/cobranza'
import type { Database } from '@/lib/db/database.types'

type FilaCola = Database['public']['Views']['v_cobranza_cola']['Row']

interface Fila {
  tercero_id: string
  equipo: string
  total: number | null
  cuotas: number | null
  vencimiento: string | null
  atraso: string
  aviso: React.ReactNode
  historial: React.ReactNode
}

const COLUMNAS: ColumnDef<Fila>[] = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'total', label: 'Total del aviso', format: 'money', width: 140 },
  { key: 'cuotas', label: 'Cuotas', align: 'right', width: 76 },
  { key: 'vencimiento', label: 'Vence desde', format: 'date', width: 112 },
  { key: 'atraso', label: 'Atraso', width: 96 },
  // Ya avisado, y cuándo. La cola ESCONDE a quien recibió el aviso de su etapa
  // —es el candado— pero un equipo puede estar acá con avisos viejos de una
  // etapa anterior, y eso cambia el tono del mensaje que corresponde mandar.
  { key: 'aviso', label: 'Último aviso', width: 150 },
  { key: 'historial', label: '', width: 116 },
]

/** Lo que se sabe de los avisos que ya recibió un equipo. */
export interface AvisoEquipo {
  tercero_id: string | null
  reclamos: number | null
  ultimo_reclamo: string | null
  dias_desde_ultimo: number | null
  ultimo_canal: string | null
}

/** Un reclamo suelto, para el desplegable del historial. */
export interface ReclamoBreve {
  id: string
  tercero_id: string | null
  fecha: string | null
  canal: string | null
  monto_reclamado: number | null
  etapa: string | null
}

const CANAL: Record<string, string> = {
  mail: 'Mail',
  whatsapp: 'WhatsApp',
  manual: 'Manual',
}

/**
 * Las tres colas de la gestión de cobranza.
 *
 * ── Tres secciones apiladas, no tres pestañas ─────────────────────────────
 *
 * Con pestañas hay que entrar a cada una para descubrir que está vacía, y el
 * trabajo del día es justamente saber dónde hay trabajo. Apiladas, eso se ve de
 * un vistazo: hoy `recordatorio` está en cero y se lee sin hacer nada.
 *
 * ── Un equipo aparece en UNA sola ─────────────────────────────────────────
 *
 * La vista le asigna la etapa más severa. Sin eso, 24 de 27 equipos caerían en
 * dos colas y recibirían el mismo día un «regularizá para seguir participando»
 * y un «te recordamos amablemente».
 *
 * ── Y sale de la cola cuando ya se le avisó ───────────────────────────────
 *
 * `v_cobranza_cola` esconde a los que ya recibieron el aviso de su etapa por
 * estas mismas cuotas. Si le vence una nueva, vuelve.
 */

// Las tres etapas —clave, etiqueta, bajada y tono— salen de `lib/domain/cobranza`,
// que es la misma tabla que usan el dashboard y el historial de avisos. Acá
// estaban escritas a mano, y así fue como el dashboard terminó rotulando una
// etapa que no existe.
const ETAPAS = ETAPAS_COBRANZA

export default function ColasAviso({
  filas,
  ventanas,
  avisos = [],
  reclamos = [],
  etapaFiltro = null,
}: {
  filas: FilaCola[]
  ventanas: { dias_por_vencer: number; dias_recordatorio: number; dias_firme: number } | null
  /** Qué se le avisó ya a cada equipo. De `v_reclamo_equipo`. */
  avisos?: AvisoEquipo[]
  /** Los reclamos, para el desplegable. De `reclamo`. */
  reclamos?: ReclamoBreve[]
  /** La etapa que se está mirando sola, o null para ver las tres. */
  etapaFiltro?: string | null
}) {
  const avisoDe = new Map(avisos.map((a) => [a.tercero_id, a]))
  const reclamosDe = new Map<string, ReclamoBreve[]>()
  for (const r of reclamos) {
    if (!r.tercero_id) continue
    reclamosDe.set(r.tercero_id, [...(reclamosDe.get(r.tercero_id) ?? []), r])
  }

  // Sin selección se ven las tres, que es el trabajo del día completo. Con una,
  // sólo esa — para cuando hay que sentarse a hacer una tanda.
  const visibles = etapaFiltro ? ETAPAS.filter((e) => e.clave === etapaFiltro) : ETAPAS

  return (
    <>
      <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {ETAPAS.map((e) => {
          const suyas = filas.filter((f) => f.etapa === e.clave)
          const activa = etapaFiltro === e.clave
          // La tarjeta ES el filtro: se lee el número y se entra a esa cola sin
          // buscar un control aparte. Volver a tocarla saca el filtro.
          return (
            <Link
              key={e.clave}
              href={activa ? '/cobranza?vista=avisos' : `/cobranza?vista=avisos&etapa=${e.clave}`}
              scroll={false}
              className={activa ? 'rounded-md ring-2 ring-ink' : ''}
            >
              <KpiCard
                tono={suyas.length === 0 ? 'neutro' : e.tono}
                titulo={e.etiqueta}
                valor={suyas.length}
                formato="entero"
                subtitulo={
                  suyas.length === 0
                    ? 'Nada pendiente'
                    : formatMoney(suyas.reduce((t, f) => t + (f.total_adeudado ?? 0), 0))
                }
              />
            </Link>
          )
        })}
      </div>

      {ventanas && (
        <p className="mb-6 text-[11px] leading-snug text-muted">
          Se avisa cuando falten <strong>{ventanas.dias_por_vencer} días</strong> o menos para el
          vencimiento; el recordatorio va desde los <strong>{ventanas.dias_recordatorio} días</strong>{' '}
          de atraso y la etapa <strong>Vencido</strong> desde los{' '}
          <strong>{ventanas.dias_firme}</strong>.{' '}
          <Link href="/configuracion" className="font-semibold text-blue-d hover:underline">
            Cambiar las ventanas
          </Link>
        </p>
      )}

      {visibles.map((e) => {
        const suyas = filas.filter((f) => f.etapa === e.clave)
        const rows: Fila[] = suyas.map((f) => ({
          tercero_id: f.tercero_id!,
          equipo: f.equipo ?? '—',
          total: f.total_adeudado,
          cuotas: f.cuotas,
          vencimiento: f.vencimiento_mas_antiguo,
          atraso:
            (f.dias_atraso_maximo ?? 0) < 0
              ? `en ${-(f.dias_atraso_maximo ?? 0)} días`
              : `${f.dias_atraso_maximo} días`,
          aviso: (() => {
            const a = avisoDe.get(f.tercero_id)
            if (!a?.ultimo_reclamo) {
              return <span className="text-[11px] text-muted">Nunca</span>
            }
            return (
              <span className="flex items-center gap-1.5 text-[11px] text-ink">
                <Icon name="check" size={13} className="shrink-0 text-oktx" />
                {formatDate(a.ultimo_reclamo)}
                <span className="text-muted">
                  · {a.dias_desde_ultimo}d · {CANAL[a.ultimo_canal ?? ''] ?? a.ultimo_canal}
                </span>
              </span>
            )
          })(),
          // El historial, desplegable por equipo. Es un <details> nativo y no
          // un componente cliente: la fila no necesita JavaScript para abrirse,
          // y así toda la cola sigue siendo Server Component.
          historial: (() => {
            const suyos = reclamosDe.get(f.tercero_id!) ?? []
            if (suyos.length === 0) return null
            return (
              <details className="group">
                <summary className="cursor-pointer list-none text-[11px] font-semibold text-blue-d hover:underline">
                  {suyos.length} aviso{suyos.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-1.5 space-y-1 rounded-md bg-panel px-2 py-1.5">
                  {suyos.map((r) => (
                    <li key={r.id} className="text-[10.5px] leading-snug text-muted">
                      <span className="font-semibold text-ink">{formatDate(r.fecha)}</span> ·{' '}
                      {CANAL[r.canal ?? ''] ?? r.canal} · {formatMoney(r.monto_reclamado ?? 0)}
                    </li>
                  ))}
                </ul>
              </details>
            )
          })(),
        }))

        return (
          <section key={e.clave} className="mb-8">
            <h2 className="text-[13px] font-extrabold tracking-[-.2px] text-ink">
              {e.etiqueta}{' '}
              <span className="font-semibold text-muted">
                · {rows.length === 1 ? '1 equipo' : `${rows.length} equipos`}
              </span>
            </h2>
            <p className="mb-3 mt-0.5 text-[11px] text-muted">{e.bajada}</p>

            <DataTable
              columns={COLUMNAS}
              rows={rows}
              rowKey="tercero_id"
              rowHref={(f) => `/equipos/${f.tercero_id}`}
              densidad="compacta"
              maxHeight={340}
              emptyMessage={
                /* Vacía se ve vacía: es información, no un hueco. */
                'Nadie en esta etapa. O ya se les avisó, o todavía no les toca.'
              }
            />
          </section>
        )
      })}

      <p className="text-[10.5px] leading-snug text-muted">
        Cada equipo aparece en una sola etapa —la más severa— y el aviso habla de todas sus cuotas.
        Al mandarlo sale de la cola; si le vence una cuota nueva, vuelve.
      </p>
    </>
  )
}
