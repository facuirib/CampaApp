import type { PostgrestError } from '@supabase/supabase-js'
import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { formatDate } from '@/lib/format'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'

// v_calendario_jornadas todavía no está en database.types.ts (migración sin
// aplicar) — tipado local, mismo patrón que se usó en gastos/arqueo mientras
// sus vistas nuevas no estaban tipadas.
interface JornadaCalendarioRow {
  jornada_id: string | null
  numero: number | null
  fecha: string | null
  estado: string | null
  es_playoff: boolean | null
  instancia: string | null
  cantidad_esperada: number | null
  cantidad_partidos: number | null
  serie_id: string | null
  serie: string | null
  categoria_id: string | null
  categoria: string | null
  genero: string | null
  serie_completa: string | null
  reprograma_a: string | null
  reprograma_a_fecha: string | null
}

interface FilaCalendario {
  jornada_id: string
  numeroLabel: string | null
  fecha: string | null
  tipo: CeldaBadge
  estado: CeldaBadge
}

function tipoABadge(esPlayoff: boolean | null, instancia: string | null): CeldaBadge {
  if (esPlayoff) return { estado: 'info', label: instancia ?? 'Playoff' }
  return { estado: 'neutro', label: 'Liga' }
}

/** Contempla los cuatro estados del dominio, aunque hoy todas las jornadas estén 'programada'. */
function estadoJornadaABadge(estado: string | null, reprogramaAFecha: string | null): CeldaBadge {
  if (estado === 'suspendida') return { estado: 'vencido', label: 'Suspendida' }
  if (estado === 'reprogramada') {
    return {
      estado: 'porVencer',
      label: reprogramaAFecha ? `→ ${formatDate(reprogramaAFecha)}` : 'Reprogramada',
    }
  }
  if (estado === 'jugada') return { estado: 'ok', label: 'Jugada' }
  if (estado === 'programada') return { estado: 'neutro', label: 'Programada' }
  return { estado: 'neutro', label: estado ?? '—' }
}

const COL_CALENDARIO: ColumnDef<FilaCalendario>[] = [
  { key: 'numeroLabel', label: 'Jornada', width: 100 },
  { key: 'fecha', label: 'Fecha', format: 'date', width: 110 },
  { key: 'tipo', label: 'Tipo', format: 'badge' },
  { key: 'estado', label: 'Estado', format: 'badge' },
]

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ serie?: string }>
}) {
  const { serie } = await searchParams
  const supabase = await createClient()
  // Una sola operación gobierna las tres pantallas del calendario —crear,
  // mover y suspender—, así que también gobierna el link y el rowHref.
  const puedeEditar = puede(await rolActual(), 'calendario.editar')

  // Un solo fetch: 284 filas es poco para el servidor, y de acá salen tanto
  // las opciones del filtro de serie (distinct sobre estas mismas filas) como
  // la tabla ya recortada — no hace falta una segunda consulta como en
  // movimientos, donde la tabla de asientos sí puede crecer sin límite.
  const { data, error } = (await supabase
    .from('v_calendario_jornadas' as never)
    .select('*')) as unknown as {
    data: JornadaCalendarioRow[] | null
    error: PostgrestError | null
  }

  const jornadas = data ?? []

  const seriesMap = new Map<string, string>()
  for (const j of jornadas) {
    if (j.serie_id && j.serie_completa) seriesMap.set(j.serie_id, j.serie_completa)
  }
  const series = [...seriesMap.entries()]
    .map(([valor, label]) => ({ valor, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))

  const FILTROS: FiltroUrl[] = [
    { parametro: 'serie', label: 'Serie', todos: 'Elegí una serie…', opciones: series },
  ]

  const jornadasDeLaSerie = serie
    ? jornadas
        .filter((j) => j.serie_id === serie)
        .sort((a, b) => (a.numero ?? Infinity) - (b.numero ?? Infinity))
    : []

  const filas: FilaCalendario[] = jornadasDeLaSerie.map((j) => ({
    // La vista tipa todas las columnas como nullable, que es lo que hace
    // Supabase con cualquier vista; jornada_id viene de jornada.id, que es PK.
    jornada_id: j.jornada_id!,
    numeroLabel: j.numero != null ? `Fecha ${j.numero}` : null,
    fecha: j.fecha,
    tipo: tipoABadge(j.es_playoff, j.instancia),
    estado: estadoJornadaABadge(j.estado, j.reprograma_a_fecha),
  }))

  const serieElegida = series.find((s) => s.valor === serie)
  const fechas = jornadasDeLaSerie.map((j) => j.fecha).filter((f): f is string => !!f)
  const desde = fechas[0]
  const hasta = fechas[fechas.length - 1]

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Calendario</h1>
        <p className="mt-1 text-[12px] text-muted">
          Jornadas del torneo por serie. Las fechas determinan los vencimientos de las cuotas de
          liga.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && (
        <>
          <FiltrosUrl filtros={FILTROS} />

          {!serie && (
            <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
              Elegí una serie para ver su calendario.
            </div>
          )}

          {serie && (
            <>
              {serieElegida && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted">
                    <span className="font-bold text-ink">{serieElegida.label}</span> —{' '}
                    {jornadasDeLaSerie.length} jornadas
                    {desde && hasta && (
                      <>
                        {' '}
                        · {formatDate(desde)} a {formatDate(hasta)}
                      </>
                    )}
                  </p>
                  {puedeEditar && (
                    <Link
                      href={`/calendario/nueva?serie=${serie}`}
                      className="text-[11px] font-semibold text-blue-d hover:underline"
                    >
                      + Agregar jornada
                    </Link>
                  )}
                </div>
              )}

              <DataTable
                columns={COL_CALENDARIO}
                rows={filas}
                rowKey="jornada_id"
                rowHref={puedeEditar ? (row) => `/calendario/${row.jornada_id}/mover` : undefined}
                maxHeight={600}
                emptyMessage="Esta serie no tiene jornadas."
              />
            </>
          )}
        </>
      )}
    </div>
  )
}