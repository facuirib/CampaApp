import { createClient } from '@/lib/db/server'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type GastoDetalleRow = Database['public']['Views']['v_gasto_detalle']['Row']

interface FilaGasto {
  gasto_id: string
  concepto: string | null
  categoria: string | null
  area: string
  naturaleza: string
  predio: string | null
  total: number | null
  devengado_at: string | null
  estado: CeldaBadge
}

/** Los cuatro valores de cat_gasto.naturaleza, en texto legible. */
const NATURALEZA_LABEL: Record<string, string> = {
  por_fecha: 'Por fecha',
  recurrente: 'Fijo',
  eventual: 'Eventual',
  inversion: 'Inversión',
}

function naturalezaLabel(n: string | null): string {
  if (n === null) return '—'
  return NATURALEZA_LABEL[n] ?? n
}

/** Los cuatro valores de cat_gasto.area, en texto legible. */
const AREA_LABEL: Record<string, string> = {
  torneo: 'Torneo',
  predio: 'Predio',
  bar: 'Bar',
  administracion: 'Administración',
}

function areaLabel(a: string | null): string {
  if (a === null) return '—'
  return AREA_LABEL[a] ?? a
}

const NATURALEZA_OPCIONES = [
  { valor: 'por_fecha', label: 'Por fecha' },
  { valor: 'recurrente', label: 'Fijo' },
  { valor: 'eventual', label: 'Eventual' },
  { valor: 'inversion', label: 'Inversión' },
]

/**
 * Los tres estados que emite la vista.
 *
 * `anulado` va en gris y no en rojo: el gasto no está mal, está dado de baja.
 * El rojo es para lo que reclama atención, y un gasto anulado ya no reclama
 * nada — solo tiene que quedar visible para que no parezca que nunca se cargó.
 */
function estadoGastoABadge(estado: string | null): CeldaBadge {
  if (estado === 'anulado') return { estado: 'neutro', label: 'Anulado' }
  if (estado === 'pagado') return { estado: 'ok', label: 'Pagado' }
  if (estado === 'devengado') return { estado: 'porVencer', label: 'Impago' }
  return { estado: 'neutro', label: estado ?? '—' }
}

const COL_GASTOS: ColumnDef<FilaGasto>[] = [
  { key: 'concepto', label: 'Concepto' },
  { key: 'categoria', label: 'Categoría' },
  { key: 'area', label: 'Área' },
  { key: 'naturaleza', label: 'Naturaleza' },
  { key: 'predio', label: 'Predio' },
  { key: 'total', label: 'Total', format: 'money' },
  { key: 'devengado_at', label: 'Devengado', format: 'date', width: 96 },
  { key: 'estado', label: 'Estado', format: 'badge' },
]

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ naturaleza?: string }>
}) {
  const { naturaleza } = await searchParams
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_gasto_detalle')
    .select('*')
    .order('devengado_at', { ascending: false })

  const gastosRaw = data ?? []

  const FILTROS: FiltroUrl[] = [
    {
      parametro: 'naturaleza',
      label: 'Naturaleza',
      todos: 'Todas las naturalezas',
      opciones: NATURALEZA_OPCIONES,
    },
  ]

  const gastosFiltrados = naturaleza
    ? gastosRaw.filter((g) => g.naturaleza === naturaleza)
    : gastosRaw

  const gastos: FilaGasto[] = gastosFiltrados.map((g: GastoDetalleRow) => ({
    // La vista tipa todas sus columnas como nullable, que es lo que hace
    // Supabase con cualquier vista. `gasto_id` viene de `gasto.id`, que es PK.
    gasto_id: g.gasto_id!,
    concepto: g.concepto,
    categoria: g.categoria,
    area: areaLabel(g.area),
    naturaleza: naturalezaLabel(g.naturaleza),
    predio: g.predio,
    total: g.total,
    devengado_at: g.devengado_at,
    estado: estadoGastoABadge(g.estado),
  }))

  // Conteo de filas por naturaleza sobre el padrón COMPLETO, no el filtrado:
  // es agrupar para mostrar, no sumar plata — el resumen no cambia con el
  // filtro, muestra siempre la foto general.
  const conteoPorNaturaleza = NATURALEZA_OPCIONES.map((op) => ({
    label: op.label,
    cantidad: gastosRaw.filter((g) => g.naturaleza === op.valor).length,
  })).filter((c) => c.cantidad > 0)

  return (
    <div className="pb-10">
      <header className="mb-7">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Gastos</h1>
        <p className="mt-1 text-[12px] text-muted">
          Gastos del torneo y la estructura — devengados y pagados.
        </p>
      </header>

      {error && (
        <pre className="mb-4 rounded-md bg-errbg p-3 text-[11px] text-errtx">{error.message}</pre>
      )}

      {!error && (
        <>
          {conteoPorNaturaleza.length > 0 && (
            <p className="mb-4 text-[11px] text-muted">
              {conteoPorNaturaleza.map((c) => `${c.label}: ${c.cantidad}`).join(' · ')}
            </p>
          )}

          <FiltrosUrl filtros={FILTROS} />

          <DataTable
            columns={COL_GASTOS}
            rows={gastos}
            rowKey="gasto_id"
            rowHref={(row) => `/gastos/${row.gasto_id}/pagar`}
            maxHeight={500}
            emptyMessage={
              naturaleza ? 'Ningún gasto coincide con el filtro.' : 'No hay gastos registrados.'
            }
          />
        </>
      )}
    </div>
  )
}
