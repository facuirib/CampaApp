import { createClient } from '@/lib/db/server'
import { formatMoney, formatDate } from '@/lib/format'

export default async function MovimientosPage() {
  const supabase = await createClient()

  const [{ data: asientos, error: errorAsientos }, { data: lineas, error: errorLineas }] =
    await Promise.all([
      supabase
        .from('v_libro_diario')
        .select('*')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('v_asiento_detalle').select('*'),
    ])

  const error = errorAsientos ?? errorLineas

  const lineasPorAsiento = new Map<string, NonNullable<typeof lineas>>()
  for (const linea of lineas ?? []) {
    if (!linea.asiento_id) continue
    const actuales = lineasPorAsiento.get(linea.asiento_id) ?? []
    actuales.push(linea)
    lineasPorAsiento.set(linea.asiento_id, actuales)
  }

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">Libro diario</h1>
      <p className="text-sm text-gray-500 mb-6">Registro de movimientos contables.</p>

      {error && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">{error.message}</pre>
      )}

      {!error && (!asientos || asientos.length === 0) && (
        <p className="text-sm text-gray-500">
          Todavía no hay movimientos registrados. Los asientos aparecen cuando se registran
          cobros o gastos.
        </p>
      )}

      {!error &&
        asientos &&
        asientos.length > 0 &&
        asientos.map((asiento) => {
          const susLineas = asiento.asiento_id
            ? (lineasPorAsiento.get(asiento.asiento_id) ?? [])
            : []
          const balanceado = (asiento.total_debe ?? 0) === (asiento.total_haber ?? 0)

          return (
            <div
              key={asiento.asiento_id}
              className={`border border-gray-200 rounded p-4 mb-4 ${
                asiento.anulado ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={asiento.anulado ? 'line-through' : ''}>
                  <div className="text-sm text-gray-500">{formatDate(asiento.fecha)}</div>
                  <div className="font-semibold">{asiento.descripcion}</div>
                </div>
                <div className="text-lg font-bold">{formatMoney(asiento.total_debe ?? 0)}</div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {asiento.origen && (
                  <span className="text-xs bg-gray-100 rounded px-2 py-0.5">
                    {asiento.origen}
                  </span>
                )}
                {asiento.torneo && (
                  <span className="text-xs bg-gray-100 rounded px-2 py-0.5">
                    {asiento.torneo}
                  </span>
                )}
                {asiento.anulado && (
                  <span className="text-xs bg-red-100 text-red-700 font-semibold rounded px-2 py-0.5">
                    ANULADO
                  </span>
                )}
              </div>

              {susLineas.length > 0 && (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left border-b border-gray-300">
                      <th className="py-1.5 pr-4">Cuenta</th>
                      <th className="py-1.5 pr-4">Debe</th>
                      <th className="py-1.5 pr-4">Haber</th>
                      <th className="py-1.5 pr-4">Tercero</th>
                    </tr>
                  </thead>
                  <tbody>
                    {susLineas.map((linea, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1.5 pr-4">
                          {linea.cuenta_codigo} {linea.cuenta}
                        </td>
                        <td className="py-1.5 pr-4">
                          {linea.debe ? formatMoney(linea.debe) : ''}
                        </td>
                        <td className="py-1.5 pr-4">
                          {linea.haber ? formatMoney(linea.haber) : ''}
                        </td>
                        <td className="py-1.5 pr-4">{linea.tercero ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold border-t border-gray-300">
                      <td className="py-1.5 pr-4">
                        Total{' '}
                        {balanceado ? (
                          <span className="text-green-700">✓</span>
                        ) : (
                          <span className="text-red-600">✗</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-4">{formatMoney(asiento.total_debe ?? 0)}</td>
                      <td className="py-1.5 pr-4">{formatMoney(asiento.total_haber ?? 0)}</td>
                      <td className="py-1.5 pr-4"></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )
        })}
    </main>
  )
}