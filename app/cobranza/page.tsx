import { createClient } from '@/lib/db/server'
import { formatMoney } from '@/lib/format'

export default async function CobranzaPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_deuda_equipo')
    .select('*')
    .order('deuda_vencida', { ascending: false })
    .order('vencimiento_mas_antiguo', { ascending: true })

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">Deudores</h1>
      <p className="text-sm text-gray-500 mb-6">
        Equipos con deuda pendiente, ordenados por urgencia de reclamo.
      </p>

      {error && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">
          {error.message}
        </pre>
      )}

      {!error && (!data || data.length === 0) && (
        <p className="text-sm text-gray-500">No hay deudas registradas</p>
      )}

      {!error && data && data.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-gray-300">
              <th className="py-2 pr-4">Equipo</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Torneos con deuda</th>
              <th className="py-2 pr-4">Deuda total</th>
              <th className="py-2 pr-4">Deuda vencida</th>
              <th className="py-2 pr-4">Vencimiento más antiguo</th>
              <th className="py-2 pr-4">Saldo a favor</th>
            </tr>
          </thead>
          <tbody>
            {data.map((fila) => {
              const vencida = fila.deuda_vencida ?? 0
              return (
                <tr
                  key={fila.tercero_id}
                  className={`border-b border-gray-100 ${
                    vencida > 0 ? 'bg-red-50' : ''
                  }`}
                >
                  <td className="py-2 pr-4">{fila.equipo}</td>
                  <td className="py-2 pr-4">{fila.email}</td>
                  <td className="py-2 pr-4">{fila.torneos_con_deuda}</td>
                  <td className="py-2 pr-4">{formatMoney(fila.deuda_total ?? 0)}</td>
                  <td className="py-2 pr-4">{formatMoney(vencida)}</td>
                  <td className="py-2 pr-4">{fila.vencimiento_mas_antiguo}</td>
                  <td className="py-2 pr-4">{formatMoney(fila.saldo_a_favor ?? 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}
