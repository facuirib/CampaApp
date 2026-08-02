import { createClient } from '@/lib/db/server'
import { formatMoney, formatDate } from '@/lib/format'

/** Versión abreviada para el eje Y del gráfico: $2,5M / $850k / $900. */
function formatMoneyCorto(n: number): string {
  const signo = n < 0 ? '-' : ''
  const abs = Math.abs(n)

  if (abs >= 1_000_000) {
    return `${signo}$${(abs / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`
  }
  if (abs >= 1_000) {
    return `${signo}$${(abs / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 0 })}k`
  }
  return `${signo}$${abs.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

/** Fecha corta para el eje X: "12 mar". */
function formatSemanaCorta(semana: string): string {
  const fecha = new Date(`${semana}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime())) return semana
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Argentina/Cordoba',
  }).format(fecha)
}

const ANCHO = 800
const ALTO = 320
const MARGEN_IZQ = 70
const MARGEN_DER = 20
const MARGEN_ARR = 20
const MARGEN_AB = 40
const ANCHO_PLOT = ANCHO - MARGEN_IZQ - MARGEN_DER
const ALTO_PLOT = ALTO - MARGEN_ARR - MARGEN_AB

export default async function ProyeccionPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_cashflow')
    .select('*')
    .not('semana', 'is', null)
    .order('semana')

  const filas = data ?? []

  const filaActual = [...filas].reverse().find((f) => !f.futura) ?? filas[0]
  const filaFinal = filas[filas.length - 1]
  const filaQuiebre = filas.find((f) => (f.saldo_proyectado ?? 0) < 0)

  // Escalas del gráfico
  const saldos = filas.map((f) => f.saldo_proyectado ?? 0)
  const rawMin = Math.min(0, ...saldos)
  const rawMax = Math.max(0, ...saldos)
  const rango = rawMax - rawMin || 1
  const colchon = rango * 0.1
  const minY = rawMin - colchon
  const maxY = rawMax + colchon

  const n = filas.length

  function xScale(i: number): number {
    if (n <= 1) return MARGEN_IZQ + ANCHO_PLOT / 2
    return MARGEN_IZQ + (i / (n - 1)) * ANCHO_PLOT
  }

  function yScale(v: number): number {
    return MARGEN_ARR + ALTO_PLOT - ((v - minY) / (maxY - minY)) * ALTO_PLOT
  }

  const puntos = filas.map((f, i) => ({
    x: xScale(i),
    y: yScale(f.saldo_proyectado ?? 0),
    saldo: f.saldo_proyectado ?? 0,
    futura: !!f.futura,
  }))

  let ultimoRealIdx = -1
  for (let i = puntos.length - 1; i >= 0; i--) {
    if (!puntos[i].futura) {
      ultimoRealIdx = i
      break
    }
  }
  const hayFuturo = puntos.some((p) => p.futura)

  const puntosReales = ultimoRealIdx === -1 ? [] : puntos.slice(0, ultimoRealIdx + 1)
  const puntosFuturos = hayFuturo ? puntos.slice(Math.max(ultimoRealIdx, 0)) : []

  const y0 = yScale(0)

  const yTicks = [0, 1, 2, 3, 4].map((i) => maxY - (i / 4) * (maxY - minY))

  const pasoEtiquetaX = Math.max(1, Math.ceil(n / 8))

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
          Todavía no hay datos de flujo. La proyección aparece cuando se registren cuotas, cobros
          o presupuesto.
        </p>
      )}

      {!error && filas.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="border border-gray-200 rounded p-4">
              <div className="text-sm text-gray-500 mb-1">Saldo actual</div>
              <div className="text-2xl font-bold">
                {formatMoney(filaActual?.saldo_proyectado ?? 0)}
              </div>
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

          <div className="border border-gray-200 rounded p-4 mb-6">
            <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full h-80">
              {/* Eje Y: etiquetas */}
              {yTicks.map((tick, i) => (
                <text
                  key={i}
                  x={MARGEN_IZQ - 8}
                  y={yScale(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="#6b7280"
                >
                  {formatMoneyCorto(tick)}
                </text>
              ))}

              {/* Línea de cero */}
              <line
                x1={MARGEN_IZQ}
                y1={y0}
                x2={ANCHO - MARGEN_DER}
                y2={y0}
                stroke="#9ca3af"
                strokeDasharray="4 4"
                strokeWidth={1}
              />

              {/* Eje X: etiquetas */}
              {filas.map((f, i) => {
                if (i % pasoEtiquetaX !== 0 && i !== n - 1) return null
                return (
                  <text
                    key={i}
                    x={xScale(i)}
                    y={ALTO - MARGEN_AB + 16}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#6b7280"
                  >
                    {f.semana ? formatSemanaCorta(f.semana) : ''}
                  </text>
                )
              })}

              {/* Tramo real: sólido, oscuro */}
              {puntosReales.length > 1 && (
                <polyline
                  points={puntosReales.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth={2}
                />
              )}

              {/* Tramo proyectado: punteado, más claro */}
              {puntosFuturos.length > 1 && (
                <polyline
                  points={puntosFuturos.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              )}

              {/* Zonas de saldo negativo, resaltadas en rojo */}
              {puntos.slice(0, -1).map((p, i) => {
                const q = puntos[i + 1]
                if (p.saldo >= 0 && q.saldo >= 0) return null
                return (
                  <line
                    key={i}
                    x1={p.x}
                    y1={p.y}
                    x2={q.x}
                    y2={q.y}
                    stroke="#dc2626"
                    strokeWidth={2.5}
                    strokeDasharray={p.futura || q.futura ? '6 4' : undefined}
                  />
                )
              })}
              {puntos
                .filter((p) => p.saldo < 0)
                .map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3} fill="#dc2626" />
                ))}
            </svg>
          </div>

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