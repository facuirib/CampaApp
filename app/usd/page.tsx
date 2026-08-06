import { createClient } from '@/lib/db/server'
import { formatMoney } from '@/lib/format'
import { Card, DataTable, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

/** Dólares formateados: "US$ 12.500". */
function formatUSD(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function esEstadoOk(estado: string): boolean {
  const texto = estado.toLowerCase()
  return texto.includes('ok') || texto.includes('sincronizado') || texto.includes('cuadra')
}

// ── Sección nueva: resultado por diferencia de cambio (componentes de diseño) ──

type FilaResultadoCambio = Database['public']['Views']['v_resultado_cambio']['Row']

interface FilaDifCambio {
  periodo: string
  resultado: number | null
  ganancias: number | null
  perdidas: number | null
}

/** Período mensual: "mm/aaaa". */
function formatPeriodo(anio: number | null, mes: number | null): string {
  if (anio === null || mes === null) return '—'
  return `${String(mes).padStart(2, '0')}/${anio}`
}

function prepararFilasDifCambio(filas: FilaResultadoCambio[]): FilaDifCambio[] {
  return filas.map((f) => ({
    periodo: formatPeriodo(f.anio, f.mes),
    resultado: f.resultado,
    ganancias: f.ganancias,
    perdidas: f.perdidas,
  }))
}

const COL_DIF_CAMBIO: ColumnDef<FilaDifCambio>[] = [
  { key: 'periodo', label: 'Período' },
  { key: 'resultado', label: 'Resultado', format: 'money' },
  { key: 'ganancias', label: 'Ganancias', format: 'money' },
  { key: 'perdidas', label: 'Pérdidas', format: 'money' },
]

export default async function UsdPage() {
  const supabase = await createClient()

  const [
    { data: tenencia, error: errorTenencia },
    { data: sincronia, error: errorSincronia },
    { data: difCambio, error: errorDifCambio },
  ] = await Promise.all([
    supabase.from('v_tenencia_usd').select('*').maybeSingle(),
    supabase.from('v_usd_sincronia').select('*').maybeSingle(),
    supabase
      .from('v_resultado_cambio')
      .select('*')
      .order('anio', { ascending: false })
      .order('mes', { ascending: false }),
  ])

  const error = errorTenencia ?? errorSincronia
  const sinDatos = !tenencia && !sincronia
  const filasDifCambio = prepararFilasDifCambio(difCambio ?? [])

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">Tenencia en dólares</h1>
      <p className="text-sm text-gray-500 mb-6">Posición en USD y control de caja.</p>

      {error && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">{error.message}</pre>
      )}

      {!error && sinDatos && (
        <p className="text-sm text-gray-500">No hay operaciones en dólares registradas.</p>
      )}

      {!error && tenencia && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="border border-gray-200 rounded p-4">
            <div className="text-sm text-gray-500 mb-1">Tenencia</div>
            <div className="text-2xl font-bold">{formatUSD(tenencia.tenencia_usd ?? 0)}</div>
          </div>
          <div className="border border-gray-200 rounded p-4">
            <div className="text-sm text-gray-500 mb-1">Costo en libros</div>
            <div className="text-2xl font-bold">{formatMoney(tenencia.costo_libros ?? 0)}</div>
          </div>
          <div className="border border-gray-200 rounded p-4">
            <div className="text-sm text-gray-500 mb-1">TC promedio ponderado</div>
            <div className="text-2xl font-bold">
              {formatMoney(tenencia.promedio_ponderado ?? 0)}
            </div>
          </div>
        </div>
      )}

      {!error && sincronia && (
        <div className="border border-gray-200 rounded p-4">
          <h2 className="text-lg font-semibold mb-3">Control de sincronía</h2>

          <div
            className={`text-xl font-bold mb-4 ${
              sincronia.estado && esEstadoOk(sincronia.estado) ? 'text-green-700' : 'text-red-600'
            }`}
          >
            {sincronia.estado ?? '—'}
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm mb-3">
            <div>
              <div className="text-gray-500">Costo en libros</div>
              <div>{formatMoney(sincronia.costo_libros ?? 0)}</div>
            </div>
            <div>
              <div className="text-gray-500">Costo esperado</div>
              <div>{formatMoney(sincronia.costo_esperado ?? 0)}</div>
            </div>
            <div>
              <div className="text-gray-500">Diferencia</div>
              <div
                className={
                  (sincronia.diferencia ?? 0) !== 0
                    ? 'text-red-600 font-semibold'
                    : 'text-green-700 font-semibold'
                }
              >
                {formatMoney(sincronia.diferencia ?? 0)}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            {sincronia.lineas_caja_usd ?? 0} líneas de caja · {sincronia.operaciones ?? 0}{' '}
            operaciones
          </p>
        </div>
      )}

      {/* ── Sección nueva, con los componentes de diseño — autocontenida para que
          Facu la integre cuando migre el resto de la pantalla. ── */}
      <div className="mt-8">
        <h2 className="mb-3 text-[13px] font-extrabold tracking-[-.2px] text-ink">
          Resultado por diferencia de cambio
        </h2>

        {errorDifCambio && (
          <pre className="mb-4 rounded-md bg-errbg p-3 text-[11px] text-errtx">
            {errorDifCambio.message}
          </pre>
        )}

        {!errorDifCambio && (
          <Card icon="monedas" noPadding>
            <DataTable
              columns={COL_DIF_CAMBIO}
              rows={filasDifCambio}
              rowKey={(row, i) => `${row.periodo}-${i}`}
              maxHeight={360}
              emptyMessage="No hay operaciones en dólares con diferencia de cambio."
            />
          </Card>
        )}

        <p className="mt-3 text-xs text-gray-500">
          La diferencia de cambio se muestra separada del resultado operativo de los torneos: una
          variación del dólar no refleja el desempeño del torneo.
        </p>
      </div>
    </main>
  )
}