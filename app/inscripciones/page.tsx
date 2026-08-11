import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/db/server'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'

// v_inscripcion todavía no está en database.types.ts (migración sin aplicar)
// — tipado local, mismo patrón que gastos/arqueo/calendario mientras sus
// vistas nuevas no estaban tipadas.
interface InscripcionRow {
  equipo_torneo_id: string | null
  torneo_id: string | null
  torneo: string | null
  tercero_id: string | null
  equipo: string | null
  serie_id: string | null
  serie: string | null
  categoria: string | null
  genero: string | null
  serie_completa: string | null
  total_plan: number | null
  medio_previsto: string | null
  cuotas_inscripcion: number | null
  cuotas_pagadas: number | null
  monto_insc: number | null
  primer_venc: string | null
  estado_inscripcion: string | null
  tiene_vencida: boolean | null
}

interface FilaInscripcion {
  equipo_torneo_id: string
  tercero_id: string | null
  equipo: string | null
  serie_completa: string | null
  total_plan: number | null
  cuotasLabel: string
  estado: CeldaBadge
}

function estadoInscripcionABadge(estado: string | null, tieneVencida: boolean | null): CeldaBadge {
  if (estado === 'paga') return { estado: 'alDia', label: 'Paga' }
  if (estado === 'parcial') return { estado: 'porVencer', label: 'Parcial' }
  if (estado === 'impaga') {
    return tieneVencida
      ? { estado: 'vencido', label: 'Impaga' }
      : { estado: 'info', label: 'Impaga' }
  }
  if (estado === 'sin_cuotas') return { estado: 'neutro', label: 'Sin cuotas' }
  return { estado: 'neutro', label: estado ?? '—' }
}

const COL_INSCRIPCIONES: ColumnDef<FilaInscripcion>[] = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'serie_completa', label: 'Serie' },
  { key: 'total_plan', label: 'Total plan', format: 'money' },
  { key: 'cuotasLabel', label: 'Cuotas' },
  { key: 'estado', label: 'Estado', format: 'badge' },
]

export default async function InscripcionesPage({
  searchParams,
}: {
  searchParams: Promise<{ serie?: string; estado?: string }>
}) {
  const { serie, estado } = await searchParams
  const supabase = await createClient()

  const { data, error } = (await supabase
    .from('v_inscripcion' as never)
    .select('*')) as unknown as {
    data: InscripcionRow[] | null
    error: PostgrestError | null
  }

  const inscripciones = data ?? []

  const seriesMap = new Map<string, string>()
  for (const i of inscripciones) {
    if (i.serie_id && i.serie_completa) seriesMap.set(i.serie_id, i.serie_completa)
  }
  const series = [...seriesMap.entries()]
    .map(([valor, label]) => ({ valor, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))

  const ESTADOS_OPCIONES = [
    { valor: 'paga', label: 'Paga' },
    { valor: 'parcial', label: 'Parcial' },
    { valor: 'impaga', label: 'Impaga' },
    { valor: 'sin_cuotas', label: 'Sin cuotas' },
  ]

  const FILTROS: FiltroUrl[] = [
    { parametro: 'serie', label: 'Serie', todos: 'Todas las series', opciones: series },
    { parametro: 'estado', label: 'Estado', todos: 'Todos los estados', opciones: ESTADOS_OPCIONES },
  ]

  const filtradas = inscripciones.filter((i) => {
    if (serie && i.serie_id !== serie) return false
    if (estado && i.estado_inscripcion !== estado) return false
    return true
  })

  // Contar filas por estado es agrupar para mostrar, no sumar plata — igual
  // que cobranza cuenta deudores. Sobre el padrón COMPLETO, no el filtrado:
  // los KPIs son la foto general, el filtro es solo para mirar la tabla.
  const pagas = inscripciones.filter((i) => i.estado_inscripcion === 'paga').length
  const parciales = inscripciones.filter((i) => i.estado_inscripcion === 'parcial').length
  const impagas = inscripciones.filter((i) => i.estado_inscripcion === 'impaga').length

  const filas: FilaInscripcion[] = filtradas
    .map((i) => ({
      // La vista tipa todas las columnas como nullable; equipo_torneo_id
      // viene de equipo_torneo.id, que es PK.
      equipo_torneo_id: i.equipo_torneo_id!,
      tercero_id: i.tercero_id,
      equipo: i.equipo,
      serie_completa: i.serie_completa,
      total_plan: i.total_plan,
      cuotasLabel: `${i.cuotas_pagadas ?? 0}/${i.cuotas_inscripcion ?? 0}`,
      estado: estadoInscripcionABadge(i.estado_inscripcion, i.tiene_vencida),
    }))
    .sort((a, b) => (a.equipo ?? '').localeCompare(b.equipo ?? '', 'es'))

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Inscripciones</h1>
        <p className="mt-1 text-[12px] text-muted">
          Equipos inscriptos y estado de su cuota de inscripción.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard titulo="Inscripciones pagas" valor={pagas} formato="entero" tono="positivo" />
            <KpiCard titulo="Parciales" valor={parciales} formato="entero" tono="info" />
            <KpiCard titulo="Impagas" valor={impagas} formato="entero" tono="alerta" />
            <KpiCard
              titulo="Total inscriptos"
              valor={inscripciones.length}
              formato="entero"
              tono="neutro"
            />
          </div>

          <FiltrosUrl filtros={FILTROS} />

          <DataTable
            columns={COL_INSCRIPCIONES}
            rows={filas}
            rowKey="equipo_torneo_id"
            rowHref={(f) => `/cobranza/${f.tercero_id}`}
            maxHeight={600}
            emptyMessage="No hay equipos inscriptos."
          />
        </>
      )}
    </div>
  )
}