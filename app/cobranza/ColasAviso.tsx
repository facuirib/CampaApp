import Link from 'next/link'
import { formatDate, formatMoney } from '@/lib/format'
import { DataTable, KpiCard, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaCola = Database['public']['Views']['v_cobranza_cola']['Row']

interface Fila {
  tercero_id: string
  equipo: string
  total: number | null
  cuotas: number | null
  vencimiento: string | null
  atraso: string
}

const COLUMNAS: ColumnDef<Fila>[] = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'total', label: 'Total del aviso', format: 'money', width: 140 },
  { key: 'cuotas', label: 'Cuotas', align: 'right', width: 76 },
  { key: 'vencimiento', label: 'Vence desde', format: 'date', width: 112 },
  { key: 'atraso', label: 'Atraso', width: 96 },
]

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

const ETAPAS = [
  {
    clave: 'por_vencer',
    titulo: 'Por vencer',
    bajada: 'Todavía no vencieron. Un aviso amable, antes de que sea un problema.',
    tono: 'info' as const,
  },
  {
    clave: 'recordatorio',
    titulo: 'Recordatorio',
    bajada: 'Vencidas hace poco. Puede que el pago se haya cruzado.',
    tono: 'advertencia' as const,
  },
  {
    clave: 'firme',
    titulo: 'Reclamo firme',
    bajada: 'Vencidas hace tiempo. Hay que regularizar.',
    tono: 'alerta' as const,
  },
] as const

export default function ColasAviso({
  filas,
  ventanas,
}: {
  filas: FilaCola[]
  ventanas: { dias_por_vencer: number; dias_recordatorio: number; dias_firme: number } | null
}) {
  return (
    <>
      <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {ETAPAS.map((e) => {
          const suyas = filas.filter((f) => f.etapa === e.clave)
          return (
            <KpiCard
              key={e.clave}
              tono={suyas.length === 0 ? 'neutro' : e.tono}
              titulo={e.titulo}
              valor={suyas.length}
              formato="entero"
              subtitulo={
                suyas.length === 0
                  ? 'Nada pendiente'
                  : formatMoney(suyas.reduce((t, f) => t + (f.total_adeudado ?? 0), 0))
              }
            />
          )
        })}
      </div>

      {ventanas && (
        <p className="mb-6 text-[11px] leading-snug text-muted">
          Se avisa cuando falten <strong>{ventanas.dias_por_vencer} días</strong> o menos para el
          vencimiento; el recordatorio va desde los <strong>{ventanas.dias_recordatorio} días</strong>{' '}
          de atraso y el reclamo firme desde los <strong>{ventanas.dias_firme}</strong>.{' '}
          <Link href="/configuracion" className="font-semibold text-blue-d hover:underline">
            Cambiar las ventanas
          </Link>
        </p>
      )}

      {ETAPAS.map((e) => {
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
        }))

        return (
          <section key={e.clave} className="mb-8">
            <h2 className="text-[13px] font-extrabold tracking-[-.2px] text-ink">
              {e.titulo}{' '}
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
