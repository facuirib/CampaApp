import { createClient } from '@/lib/db/server'
import { formatMoney, formatDate } from '@/lib/format'
import { ChartArea, type PuntoSerie } from '@/components/ui'

export default async function ProyeccionPage() {
  const supabase = await createClient()
  const [{ data, error }, { data: caja }] = await Promise.all([
    supabase.from('v_cashflow').select('*').not('semana', 'is', null).order('semana'),
    // El saldo de HOY sale de su propia vista, ya sumado: el front no calcula
    // totales (regla 1). No es lo mismo que saldo_proyectado, que es el saldo
    // al CIERRE de la semana e incluye lo comprometido todavía sin cobrar.
    supabase.from('v_saldo_caja_total').select('saldo_total').single(),
  ])

  const filas = data ?? []

  const saldoHoy = caja?.saldo_total ?? 0
  const filaFinal = filas[filas.length - 1]
  const filaQuiebre = filas.find((f) => (f.saldo_proyectado ?? 0) < 0)

  // La serie que consume ChartArea. Es un mapeo, no un cálculo: cada punto
  // sale de su fila, y el componente se encarga de escalas, ejes, el corte
  // entre real y proyectado, y el resaltado de los tramos negativos.
  const serie: PuntoSerie[] = filas.map((f) => ({
    fecha: f.semana ?? '',
    valor: f.saldo_proyectado ?? 0,
    proyectado: !!f.futura,
  }))

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">Proyección de caja</h1>
      <p className="text-sm text-gray-500 mb-6">
        Saldo semanal proyectado — real hasta hoy, estimado hacia adelante.
      </p>

      {error && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">{error.message}</pre>
      )}

      {!error && filas.length === 0 && (
        <p className="text-sm text-gray-500">
          Todavía no hay datos de flujo. La proyección aparece cuando se registren cuotas, cobros o
          presupuesto.
        </p>
      )}

      {!error && filas.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="border border-gray-200 rounded p-4">
              <div className="text-sm text-gray-500 mb-1">Saldo actual</div>
              <div className="text-2xl font-bold">{formatMoney(saldoHoy)}</div>
              <div className="text-xs text-gray-400 mt-1">Caja real, hoy</div>
            </div>

            <div className="border border-gray-200 rounded p-4">
              <div className="text-sm text-gray-500 mb-1">Saldo proyectado a fin del rango</div>
              <div className="text-2xl font-bold">
                {formatMoney(filaFinal?.saldo_proyectado ?? 0)}
              </div>
            </div>

            <div className="border border-gray-200 rounded p-4">
              <div className="text-sm text-gray-500 mb-1">Quiebre de caja</div>
              {filaQuiebre ? (
                <div className="text-lg font-bold text-red-600">
                  {filaQuiebre.semana ? formatDate(filaQuiebre.semana) : 'Semana desconocida'}
                </div>
              ) : (
                <div className="text-lg font-bold text-green-700">Sin quiebre proyectado</div>
              )}
            </div>
          </div>

          {/* Sin envoltorio: ChartArea ya trae su propio marco —el mismo caso
              que DataTable dentro de Card—, y anidarlo dibuja dos bordes. */}
          <ChartArea className="mb-6" serie={serie} titulo="Saldo de caja proyectado por semana" />

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-gray-300">
                <th className="py-2 pr-4">Semana</th>
                <th className="py-2 pr-4">Entradas</th>
                <th className="py-2 pr-4">Salidas</th>
                <th className="py-2 pr-4">Flujo neto</th>
                <th className="py-2 pr-4">Saldo proyectado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => {
                const saldo = fila.saldo_proyectado ?? 0
                return (
                  <tr
                    key={fila.semana ?? i}
                    className={`border-b border-gray-100 ${fila.futura ? 'bg-gray-50' : ''}`}
                  >
                    <td className="py-2 pr-4">{formatDate(fila.semana)}</td>
                    <td className="py-2 pr-4">{formatMoney(fila.entradas ?? 0)}</td>
                    <td className="py-2 pr-4">{formatMoney(fila.salidas ?? 0)}</td>
                    <td className="py-2 pr-4">{formatMoney(fila.flujo_neto ?? 0)}</td>
                    <td className={`py-2 pr-4 ${saldo < 0 ? 'text-red-600 font-semibold' : ''}`}>
                      {formatMoney(saldo)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </main>
  )
}
