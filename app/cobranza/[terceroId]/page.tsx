import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { formatMoney, formatDate } from '@/lib/format'

export default async function CuentaCorrientePage({
  params,
}: {
  params: Promise<{ terceroId: string }>
}) {
  const { terceroId } = await params
  const supabase = await createClient()

  const [{ data: fichas, error: errorFichas }, { data: cuotas, error: errorCuotas }] =
    await Promise.all([
      supabase.from('v_cuenta_corriente_equipo').select('*').eq('tercero_id', terceroId),
      supabase
        .from('v_deuda_detalle')
        .select('*')
        .eq('tercero_id', terceroId)
        .order('torneo', { ascending: true })
        .order('cuota_numero', { ascending: true }),
    ])

  const error = errorFichas ?? errorCuotas
  const equipo = fichas?.[0]?.equipo ?? cuotas?.[0]?.equipo ?? 'Equipo sin datos'
  const sinDatos = !error && (!fichas || fichas.length === 0) && (!cuotas || cuotas.length === 0)

  return (
    <main className="p-8 font-sans">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{equipo}</h1>
        <Link
          href={`/cobranza/${terceroId}/cobrar`}
          className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded hover:bg-gray-800"
        >
          Registrar pago
        </Link>
      </div>

      {error && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">
          {error.message}
        </pre>
      )}

      {sinDatos && (
        <p className="text-sm text-gray-500">Este equipo no tiene deudas registradas</p>
      )}

      {!error &&
        fichas?.map((ficha) => {
          const cuotasTorneo =
            cuotas?.filter((c) => c.equipo_torneo_id === ficha.equipo_torneo_id) ?? []

          return (
            <section key={ficha.equipo_torneo_id} className="mb-8">
              <div className="border border-gray-200 rounded p-4 mb-2">
                <h2 className="text-lg font-semibold">{ficha.torneo}</h2>
                <p className="text-sm text-gray-500 mb-3">
                  {ficha.categoria} · {ficha.serie}
                </p>
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <div className="text-gray-500">Total del plan</div>
                    <div>{formatMoney(ficha.total_plan ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Pagado</div>
                    <div>{formatMoney(ficha.total_pagado ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Saldo</div>
                    <div className="font-bold text-lg">{formatMoney(ficha.saldo ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Cuotas</div>
                    <div>
                      {ficha.cuotas_pagadas ?? 0} de {ficha.cuotas_total ?? 0} pagadas
                    </div>
                  </div>
                </div>
              </div>

              {cuotasTorneo.length > 0 && (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left border-b border-gray-300">
                      <th className="py-2 pr-4">Cuota</th>
                      <th className="py-2 pr-4">Vencimiento</th>
                      <th className="py-2 pr-4">Monto</th>
                      <th className="py-2 pr-4">Pagado</th>
                      <th className="py-2 pr-4">Saldo</th>
                      <th className="py-2 pr-4">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuotasTorneo.map((cuota) => {
                      const vencida =
                        (cuota.estado?.includes('vencid') ?? false) ||
                        (cuota.dias_atraso ?? 0) > 0

                      return (
                        <tr
                          key={cuota.cuota_id}
                          className={`border-b border-gray-100 ${vencida ? 'bg-red-50' : ''}`}
                        >
                          <td className="py-2 pr-4">{cuota.cuota_numero}</td>
                          <td className="py-2 pr-4">{formatDate(cuota.vence_at)}</td>
                          <td className="py-2 pr-4">{formatMoney(cuota.monto ?? 0)}</td>
                          <td className="py-2 pr-4">{formatMoney(cuota.pagado ?? 0)}</td>
                          <td className="py-2 pr-4">{formatMoney(cuota.saldo ?? 0)}</td>
                          <td className="py-2 pr-4">{cuota.estado}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )
        })}
    </main>
  )
}
