import { createClient } from '@/lib/db/server'
import { formatMoney, formatDate } from '@/lib/format'

export default async function SponsorsPage() {
  const supabase = await createClient()

  const [{ data: contratos, error: errorContratos }, { data: cuotasFuturas, error: errorCuotas }] =
    await Promise.all([
      supabase.from('v_estado_sponsor').select('*').order('sponsor'),
      supabase.from('v_cuotas_sponsor_futuras').select('*').order('fecha_cobro'),
    ])

  const error = errorContratos ?? errorCuotas

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">Sponsors</h1>
      <p className="text-sm text-gray-500 mb-6">Contratos de patrocinio y estado de cobro.</p>

      {error && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">{error.message}</pre>
      )}

      {!error && (!contratos || contratos.length === 0) && (
        <p className="text-sm text-gray-500">No hay contratos de sponsors cargados.</p>
      )}

      {!error && contratos && contratos.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {contratos.map((contrato) => {
              const montoTotal = contrato.monto_total ?? 0
              const cobrado = contrato.cobrado ?? 0
              const porcentaje =
                montoTotal > 0 ? Math.min(100, Math.max(0, (cobrado / montoTotal) * 100)) : 0

              return (
                <div key={contrato.contrato_id} className="border border-gray-200 rounded p-4">
                  <h2 className="text-lg font-semibold">{contrato.sponsor}</h2>
                  <p className="text-sm text-gray-500 mb-3">
                    {formatDate(contrato.vigente_desde)} — {formatDate(contrato.vigente_hasta)} ·{' '}
                    {contrato.meses ?? 0} meses
                  </p>

                  <div className="text-2xl font-bold mb-3">{formatMoney(montoTotal)}</div>

                  <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                    <div>
                      <div className="text-gray-500">Devengado</div>
                      <div>{formatMoney(contrato.devengado ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Cobrado</div>
                      <div>{formatMoney(cobrado)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Pendiente de cobrar</div>
                      <div>{formatMoney(contrato.pendiente_cobrar ?? 0)}</div>
                    </div>
                  </div>

                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>

                  <p className="text-xs text-gray-500">
                    {contrato.cuotas_pendientes ?? 0} de {contrato.cuotas ?? 0} cuotas pendientes
                  </p>
                </div>
              )
            })}
          </div>

          <h2 className="text-lg font-semibold mb-3">Próximos cobros</h2>

          {(!cuotasFuturas || cuotasFuturas.length === 0) && (
            <p className="text-sm text-gray-500">No hay cobros de sponsors pendientes.</p>
          )}

          {cuotasFuturas && cuotasFuturas.length > 0 && (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-gray-300">
                  <th className="py-2 pr-4">Sponsor</th>
                  <th className="py-2 pr-4">Fecha de cobro</th>
                  <th className="py-2 pr-4">Monto</th>
                </tr>
              </thead>
              <tbody>
                {cuotasFuturas.map((cuota) => (
                  <tr key={cuota.cuota_id} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{cuota.sponsor}</td>
                    <td className="py-2 pr-4">{formatDate(cuota.fecha_cobro)}</td>
                    <td className="py-2 pr-4">{formatMoney(cuota.monto ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  )
}