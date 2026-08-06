import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/db/server'
import { Card, DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'

// v_gasto_detalle todavía no está en database.types.ts (migración sin aplicar) — tipado local.
interface GastoDetalleRow {
  gasto_id: string
  concepto: string | null
  es_libre: boolean | null
  categoria: string | null
  naturaleza: string | null
  area: string | null
  torneo_id: string | null
  torneo: string | null
  predio_id: string | null
  predio: string | null
  jornada_id: string | null
  arancel: number | null
  cantidad: number | null
  total: number | null
  devengado_at: string | null
  pagado_at: string | null
  medio_pago: string | null
  estado: string | null
  asiento_dev_id: string | null
  asiento_pag_id: string | null
}

interface FilaGasto {
  gasto_id: string
  concepto: string | null
  categoria: string | null
  area: string | null
  naturaleza: string | null
  predio: string | null
  total: number | null
  devengado_at: string | null
  estado: CeldaBadge
}

function estadoGastoABadge(estado: string | null): CeldaBadge {
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

export default async function GastosPage() {
  const supabase = await createClient()

  const { data, error } = (await supabase
    .from('v_gasto_detalle' as never)
    .select('*')
    .order('devengado_at', { ascending: false })) as unknown as {
    data: GastoDetalleRow[] | null
    error: PostgrestError | null
  }

  const gastos: FilaGasto[] = (data ?? []).map((g) => ({
    gasto_id: g.gasto_id,
    concepto: g.concepto,
    categoria: g.categoria,
    area: g.area,
    naturaleza: g.naturaleza,
    predio: g.predio,
    total: g.total,
    devengado_at: g.devengado_at,
    estado: estadoGastoABadge(g.estado),
  }))

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
        <Card icon="comprobante" noPadding>
          <DataTable
            columns={COL_GASTOS}
            rows={gastos}
            rowKey="gasto_id"
            maxHeight={500}
            emptyMessage="No hay gastos registrados."
          />
        </Card>
      )}
    </div>
  )
}