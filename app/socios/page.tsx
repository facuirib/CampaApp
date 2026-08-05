import { createClient } from '@/lib/db/server'
import { formatMoney } from '@/lib/format'

/** Período mensual: "mm/aaaa". */
function formatPeriodo(anio: number, mes: number): string {
  return `${String(mes).padStart(2, '0')}/${anio}`
}

export default async function SociosPage() {
  const supabase = await createClient()

  const [{ data: socios, error: errorSocios }, { data: detalle, error: errorDetalle }] =
    await Promise.all([
      supabase.from('v_saldo_socio').select('*').order('nombre'),
      supabase
        .from('v_socio_detalle_mensual')
        .select('*')
        .order('nombre')
        .order('anio')
        .order('mes'),
    ])

  const error = errorSocios ?? errorDetalle

  const detallePorSocio = new Map<string, NonNullable<typeof detalle>>()
  for (const fila of detalle ?? []) {
    if (!fila.socio_id) continue
    const actuales = detallePorSocio.get(fila.socio_id) ?? []
    actuales.push(fila)
    detallePorSocio.set(fila.socio_id, actuales)
  }

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">Socios</h1>
      <p className="text-sm text-gray-500 mb-6">
        Cuenta de cada socio: lo devengado, lo retirado y el saldo.
      </p>

      {error && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">{error.message}</pre>
      )}

      {!error && (!socios || socios.length === 0) && (
        <p className="text-sm text-gray-500">No hay socios cargados.</p>
      )}

      {!error &&
        socios &&
        socios.length > 0 &&
        socios.map((socio) => {
          const saldo = socio.saldo ?? 0
          const detalleSocio = socio.socio_id ? (detallePorSocio.get(socio.socio_id) ?? []) : []

          return (
            <section key={socio.socio_id} className="border border-gray-200 rounded p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-semibold">{socio.nombre}</h2>
                {socio.activo === false && (
                  <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">
                    Inactivo
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                <div>
                  <div className="text-gray-500">Devengado</div>
                  <div className="text-lg font-bold">{formatMoney(socio.devengado ?? 0)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Retirado</div>
                  <div className="text-lg font-bold">{formatMoney(socio.retirado ?? 0)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Saldo</div>
                  <div
                    className={`text-lg font-bold ${
                      saldo > 0 ? 'text-green-700' : saldo < 0 ? 'text-red-600' : ''
                    }`}
                  >
                    {saldo > 0 ? '+' : ''}
                    {formatMoney(saldo)}
                  </div>
                </div>
              </div>

              {detalleSocio.length > 0 && (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left border-b border-gray-300">
                      <th className="py-2 pr-4">Período</th>
                      <th className="py-2 pr-4">Devengado</th>
                      <th className="py-2 pr-4">Retirado</th>
                      <th className="py-2 pr-4">Neto</th>
                      <th className="py-2 pr-4">Saldo acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleSocio.map((fila) => (
                      <tr key={fila.periodo_id} className="border-b border-gray-100">
                        <td className="py-2 pr-4">{formatPeriodo(fila.anio ?? 0, fila.mes ?? 0)}</td>
                        <td className="py-2 pr-4">{formatMoney(fila.devengado ?? 0)}</td>
                        <td className="py-2 pr-4">{formatMoney(fila.retirado ?? 0)}</td>
                        <td className="py-2 pr-4">{formatMoney(fila.neto ?? 0)}</td>
                        <td className="py-2 pr-4">{formatMoney(fila.saldo_acumulado ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )
        })}
    </main>
  )
}