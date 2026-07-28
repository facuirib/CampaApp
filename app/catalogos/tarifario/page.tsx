import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/db/server'
import { formatMoney } from '@/lib/format'

// plan_tarifa / plan_tarifa_linea todavía no están en database.types.ts
// (se regenera cuando haya acceso al proyecto Supabase real) — tipado local.
type Genero = 'masculino' | 'femenino'
type Regla = 'fecha_fija' | 'por_partido' | 'bloque_adelantado'

interface PlanTarifaRow {
  id: string
  genero: Genero
  concepto: string
  opcion_orden: number
  opcion_nombre: string
}

interface PlanTarifaLineaRow {
  plan_tarifa_id: string
  linea_orden: number
  concepto_label: string
  precio_efectivo: number | null
  precio_transferencia: number | null
  regla: Regla
  cantidad_esperada: number | null
  es_playoff: boolean
}

const GENERO_LABEL: Record<Genero, string> = {
  masculino: 'Masculino',
  femenino: 'Femenino',
}

const REGLA_LABEL: Record<Regla, string> = {
  fecha_fija: 'Fecha fija',
  por_partido: 'Por partido',
  bloque_adelantado: 'Bloque adelantado',
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export default async function TarifarioPage() {
  const supabase = await createClient()

  const { data: opciones, error: errorOpciones } = (await supabase
    .from('plan_tarifa' as never)
    .select('id, genero, concepto, opcion_orden, opcion_nombre')
    .eq('activo', true)
    .order('genero', { ascending: true })
    .order('concepto', { ascending: true })
    .order('opcion_orden', { ascending: true })) as unknown as {
    data: PlanTarifaRow[] | null
    error: PostgrestError | null
  }

  const opcionesIds = (opciones ?? []).map((o) => o.id)

  const { data: lineas, error: errorLineas } =
    opcionesIds.length > 0
      ? ((await supabase
          .from('plan_tarifa_linea' as never)
          .select(
            'plan_tarifa_id, linea_orden, concepto_label, precio_efectivo, precio_transferencia, regla, cantidad_esperada, es_playoff'
          )
          .in('plan_tarifa_id', opcionesIds)
          .order('linea_orden', { ascending: true })) as unknown as {
          data: PlanTarifaLineaRow[] | null
          error: PostgrestError | null
        })
      : { data: [] as PlanTarifaLineaRow[], error: null }

  const error = errorOpciones ?? errorLineas

  const lineasPorOpcion = new Map<string, PlanTarifaLineaRow[]>()
  for (const linea of lineas ?? []) {
    const actuales = lineasPorOpcion.get(linea.plan_tarifa_id) ?? []
    actuales.push(linea)
    lineasPorOpcion.set(linea.plan_tarifa_id, actuales)
  }

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">Tarifario</h1>
      <p className="text-sm text-gray-500 mb-6">
        Precios vigentes del torneo, por género y concepto.
      </p>

      {error && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">
          {error.message}
        </pre>
      )}

      {!error && (!opciones || opciones.length === 0) && (
        <p className="text-sm text-gray-500">No hay tarifas cargadas todavía</p>
      )}

      {!error &&
        opciones &&
        opciones.length > 0 &&
        opciones.map((opcion) => {
          const susLineas = lineasPorOpcion.get(opcion.id) ?? []

          return (
            <div key={opcion.id} className="border border-gray-200 rounded p-4 mb-4">
              <h2 className="text-lg font-semibold mb-1">{opcion.opcion_nombre}</h2>
              <div className="flex gap-2 mb-3">
                <span className="text-xs bg-gray-100 rounded px-2 py-0.5">
                  {GENERO_LABEL[opcion.genero]}
                </span>
                <span className="text-xs bg-gray-100 rounded px-2 py-0.5">
                  {capitalizar(opcion.concepto)}
                </span>
              </div>

              {susLineas.length > 0 && (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left border-b border-gray-300">
                      <th className="py-2 pr-4">Concepto</th>
                      <th className="py-2 pr-4">Efectivo</th>
                      <th className="py-2 pr-4">Transferencia</th>
                      <th className="py-2 pr-4">Regla</th>
                      <th className="py-2 pr-4">Playoff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {susLineas.map((linea) => {
                      const sinPrecio =
                        linea.precio_efectivo == null && linea.precio_transferencia == null

                      return (
                        <tr
                          key={`${linea.plan_tarifa_id}-${linea.linea_orden}`}
                          className="border-b border-gray-100"
                        >
                          <td className="py-2 pr-4">{linea.concepto_label}</td>
                          <td className="py-2 pr-4">
                            {sinPrecio ? '—' : formatMoney(linea.precio_efectivo ?? 0)}
                          </td>
                          <td className="py-2 pr-4">
                            {sinPrecio ? '—' : formatMoney(linea.precio_transferencia ?? 0)}
                          </td>
                          <td className="py-2 pr-4">{REGLA_LABEL[linea.regla]}</td>
                          <td className="py-2 pr-4">{linea.es_playoff ? 'Sí' : ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
    </main>
  )
}
