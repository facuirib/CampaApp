import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { formatDate } from '@/lib/format'
import { Card, DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** Suma días a una fecha YYYY-MM-DD en UTC, sin pasar por husos horarios. */
function sumarDias(fecha: string, dias: number): string {
  const match = SOLO_FECHA.exec(fecha)
  if (!match) return fecha
  const [, aaaa, mm, dd] = match
  const base = new Date(Date.UTC(Number(aaaa), Number(mm) - 1, Number(dd)))
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

interface FilaReal {
  origen: string | null
  monto: number | null
}

interface FilaComprometido {
  origen: string | null
  detalle: string | null
  monto: number | null
  arrastrada: CeldaBadge | null
}

interface FilaEstimado {
  origen: string | null
  detalle: string | null
  monto: number | null
}

const COL_REAL: ColumnDef<FilaReal>[] = [
  { key: 'origen', label: 'Origen' },
  { key: 'monto', label: 'Monto', format: 'money' },
]

const COL_COMPROMETIDO: ColumnDef<FilaComprometido>[] = [
  { key: 'origen', label: 'Origen' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'monto', label: 'Monto', format: 'money' },
  { key: 'arrastrada', label: 'Arrastrada', format: 'badge' },
]

const COL_ESTIMADO: ColumnDef<FilaEstimado>[] = [
  { key: 'origen', label: 'Origen' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'monto', label: 'Monto', format: 'money' },
]

export default async function DetallePeriodoPage({
  params,
}: {
  params: Promise<{ periodo: string }>
}) {
  const { periodo } = await params

  if (!SOLO_FECHA.test(periodo)) notFound()

  const supabase = await createClient()
  const finPeriodo = sumarDias(periodo, 7)

  const [
    { data: realData, error: errorReal },
    { data: comprometidoData, error: errorComprometido },
    { data: estimadoData, error: errorEstimado },
  ] = await Promise.all([
    supabase
      .from('v_cashflow_real')
      .select('*')
      .gte('fecha', periodo)
      .lt('fecha', finPeriodo)
      .order('fecha'),
    supabase
      .from('v_cashflow_comprometido')
      .select('*')
      .gte('fecha', periodo)
      .lt('fecha', finPeriodo)
      .order('fecha'),
    supabase
      .from('v_cashflow_estimado')
      .select('*')
      .gte('fecha', periodo)
      .lt('fecha', finPeriodo)
      .order('fecha'),
  ])

  const error = errorReal ?? errorComprometido ?? errorEstimado

  const filasReal: FilaReal[] = (realData ?? []).map((f) => ({
    origen: f.origen,
    monto: f.monto,
  }))

  const filasComprometido: FilaComprometido[] = (comprometidoData ?? []).map((f) => ({
    origen: f.origen,
    detalle: f.detalle,
    monto: f.monto,
    arrastrada: f.arrastrada ? { estado: 'porVencer', label: 'Arrastrada' } : null,
  }))

  const filasEstimado: FilaEstimado[] = (estimadoData ?? []).map((f) => ({
    origen: f.origen,
    detalle: f.detalle,
    monto: f.monto,
  }))

  const sinMovimientos =
    filasReal.length === 0 && filasComprometido.length === 0 && filasEstimado.length === 0

  return (
    <div className="pb-10">
      <Link href="/proyeccion" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a proyección
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Detalle del período</h1>
        <p className="mt-1 text-[12px] text-muted">Semana del {formatDate(periodo)}</p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && sinMovimientos && (
        <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
          No hay movimientos proyectados para este período.
        </div>
      )}

      {!error && !sinMovimientos && (
        <div className="grid gap-4">
          {filasReal.length > 0 && (
            <Card title="Real (ya movido)" icon="caja" noPadding>
              <DataTable
                columns={COL_REAL}
                rows={filasReal}
                rowKey={(_row, i) => i}
                maxHeight={360}
                emptyMessage="Sin movimientos reales."
              />
            </Card>
          )}

          {filasComprometido.length > 0 && (
            <Card title="Comprometido" icon="calendario" noPadding>
              <DataTable
                columns={COL_COMPROMETIDO}
                rows={filasComprometido}
                rowKey={(_row, i) => i}
                maxHeight={360}
                emptyMessage="Sin comprometidos."
              />
            </Card>
          )}

          {filasEstimado.length > 0 && (
            <Card title="Estimado" icon="monedas" noPadding>
              <DataTable
                columns={COL_ESTIMADO}
                rows={filasEstimado}
                rowKey={(_row, i) => i}
                maxHeight={360}
                emptyMessage="Sin estimados."
              />
            </Card>
          )}
        </div>
      )}
    </div>
  )
}