import { createClient } from '@/lib/db/server'
import { formatMoney } from '@/lib/format'

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

export default async function UsdPage() {
  const supabase = await createClient()

  const [{ data: tenencia, error: errorTenencia }, { data: sincronia, error: errorSincronia }] =
    await Promise.all([
      supabase.from('v_tenencia_usd').select('*').maybeSingle(),
      supabase.from('v_usd_sincronia').select('*').maybeSingle(),
    ])

  const error = errorTenencia ?? errorSincronia
  const sinDatos = !tenencia && !sincronia

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
    </main>
  )
}