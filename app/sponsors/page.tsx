import { createClient } from '@/lib/db/server'
import { estadoSponsor } from '@/lib/domain/sponsor'
import { DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaLista = Database['public']['Views']['v_sponsor_lista']['Row']

interface FilaSponsor {
  sponsor_id: string
  sponsor: string | null
  estado: CeldaBadge
  contratos: number | null
  contratado: number | null
  reconocido: number | null
  cobrado: number | null
  pendiente_cobrar: number | null
  vigencia: string
}

const COLUMNAS: ColumnDef<FilaSponsor>[] = [
  { key: 'sponsor', label: 'Sponsor' },
  { key: 'estado', label: 'Estado', format: 'badge', width: 118 },
  { key: 'contratos', label: 'Contratos', align: 'right', width: 88 },
  { key: 'contratado', label: 'Contratado', format: 'money', width: 132 },
  { key: 'reconocido', label: 'Reconocido', format: 'money', width: 132 },
  { key: 'cobrado', label: 'Cobrado', format: 'money', width: 132 },
  { key: 'pendiente_cobrar', label: 'Pendiente', format: 'money', width: 132 },
  { key: 'vigencia', label: 'Vigencia', width: 108 },
]

/** El año de la envolvente de contratos: "2026–2027", o sólo uno si coinciden. */
function vigencia(desde: string | null, hasta: string | null): string {
  if (!desde || !hasta) return '—'
  const a = desde.slice(0, 4)
  const b = hasta.slice(0, 4)
  return a === b ? a : `${a}–${b}`
}

export default async function SponsorsPage() {
  const supabase = await createClient()

  const [listaRes, kpiRes] = await Promise.all([
    supabase.from('v_sponsor_lista').select('*').order('sponsor'),
    // Una fila siempre, también sin sponsors: es una agregación sin group by.
    supabase.from('v_sponsor_kpi').select('*').maybeSingle(),
  ])

  const error = listaRes.error ?? kpiRes.error
  const kpi = kpiRes.data

  const filas: FilaSponsor[] = (listaRes.data ?? []).map((s: FilaLista) => ({
    sponsor_id: s.sponsor_id!,
    sponsor: s.sponsor,
    estado: estadoSponsor(s.estado),
    contratos: s.contratos,
    contratado: s.contratado,
    reconocido: s.reconocido,
    cobrado: s.cobrado,
    pendiente_cobrar: s.pendiente_cobrar,
    vigencia: vigencia(s.vigente_desde, s.vigente_hasta),
  }))

  const enMora = kpi?.sponsors_en_mora ?? 0
  const pendiente = kpi?.pendiente_cobrar ?? 0

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Sponsors</h1>
        <p className="mt-1 text-[12px] text-muted">
          Un sponsor por fila, con todos sus contratos sumados. El detalle abre los dos calendarios:
          lo que se reconoce mes a mes y lo que se cobra en cuotas.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {/* Los cuatro números vienen de v_sponsor_kpi, que suma v_sponsor_lista:
          la MISMA fuente que la tabla de abajo, así que el encabezado y las
          filas no pueden discrepar. Sin la vista, esto sería sumar la columna
          en el front, que es lo que la regla 1 prohíbe. */}
      <div className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <KpiCard
          tono="neutro"
          titulo="Contratado"
          valor={kpi?.contratado ?? 0}
          icon="sponsors"
          subtitulo={`${kpi?.sponsors ?? 0} sponsors · ${kpi?.contratos ?? 0} contratos`}
        />
        <KpiCard
          tono="positivo"
          titulo="Reconocido"
          valor={kpi?.reconocido ?? 0}
          icon="monedas"
          subtitulo="Ya ganado, en el P&L"
        />
        <KpiCard
          tono="info"
          titulo="Cobrado"
          valor={kpi?.cobrado ?? 0}
          icon="banco"
          subtitulo="Plata que ya entró"
        />
        <KpiCard
          tono={enMora > 0 ? 'alerta' : 'neutro'}
          titulo="Pendiente de cobrar"
          valor={pendiente}
          icon="alerta"
          subtitulo={
            enMora > 0
              ? `${enMora} ${enMora === 1 ? 'sponsor en mora' : 'sponsors en mora'}`
              : 'Ningún sponsor en mora'
          }
        />
      </div>

      {/* Sin fila de total: los cuatro totales ya están arriba, en los KpiCards,
          y con los mismos números. Repetirlos abajo es ruido, no verificación. */}
      <DataTable
        columns={COLUMNAS}
        rows={filas}
        rowKey="sponsor_id"
        rowHref={(f) => `/sponsors/${f.sponsor_id}`}
        maxHeight={560}
        emptyMessage="No hay sponsors cargados."
      />
    </div>
  )
}
