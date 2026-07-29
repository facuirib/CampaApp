import { createClient } from '@/lib/db/server'
import { formatMoney } from '@/lib/format'

export default async function CobranzaKpisPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_cobranza_kpi')
    .select('*')
    .order('nombre', { ascending: true })

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">KPIs de cobranza</h1>
      <p className="text-sm text-gray-500 mb-6">
        Cómo viene cada torneo: facturado, cobrado, tasa y vencido.
      </p>

      {error && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">
          {error.message}
        </pre>
      )}

      {!error && (!data || data.length === 0) && (
        <p className="text-sm text-gray-500">No hay datos de cobranza todavía</p>
      )}

      {!error && data && data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((kpi) => {
            const tasa = kpi.tasa_cobranza ?? 0
            const vencido = kpi.vencido ?? 0
            const dias = kpi.dias_promedio_cobro

            return (
              <div key={kpi.torneo_id} className="border border-gray-200 rounded p-4">
                <h2 className="text-lg font-semibold mb-2">{kpi.nombre}</h2>

                <div
                  className={`text-3xl font-bold mb-3 ${
                    tasa < 50 ? 'text-amber-600' : ''
                  }`}
                >
                  {tasa.toLocaleString('es-AR')}%
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <div className="text-gray-500">Facturado</div>
                    <div>{formatMoney(kpi.devengado ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Cobrado</div>
                    <div>{formatMoney(kpi.cobrado ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Por vencer</div>
                    <div>{formatMoney(kpi.por_vencer ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Vencido</div>
                    <div className={vencido > 0 ? 'text-red-600' : ''}>
                      {formatMoney(vencido)}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  {dias == null
                    ? 'sin datos'
                    : `Cobro en ${dias.toLocaleString('es-AR')} días promedio`}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
