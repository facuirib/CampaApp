import { createClient } from '@/lib/db/server'
import { Card, DataTable, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaResultado = Database['public']['Views']['v_resultado_producto']['Row']
type FilaComparador = Database['public']['Views']['v_comparador_torneos']['Row']

const COL_RESULTADOS: ColumnDef<FilaResultado>[] = [
  { key: 'producto', label: 'Producto' },
  { key: 'anio', label: 'Año' },
  { key: 'ingresos', label: 'Ingresos', format: 'money' },
  { key: 'egresos', label: 'Egresos', format: 'money' },
  { key: 'contribucion', label: 'Contribución', format: 'money' },
]

const COL_COMPARADOR: ColumnDef<FilaComparador>[] = [
  { key: 'nombre', label: 'Torneo' },
  { key: 'fecha_desde', label: 'Desde', format: 'date', width: 96 },
  { key: 'equipos', label: 'Equipos' },
  { key: 'ingresos', label: 'Ingresos', format: 'money' },
  { key: 'costos_directos', label: 'Costos directos', format: 'money' },
  { key: 'contribucion', label: 'Contribución', format: 'money' },
  { key: 'contribucion_por_equipo', label: 'Contribución / equipo', format: 'money' },
]

export default async function ResultadosPage() {
  const supabase = await createClient()

  const [
    { data: resultados, error: errorResultados },
    { data: comparador, error: errorComparador },
  ] = await Promise.all([
    supabase
      .from('v_resultado_producto')
      .select('*')
      .order('anio', { ascending: false })
      .order('producto'),
    supabase.from('v_comparador_torneos').select('*').order('fecha_desde', { ascending: false }),
  ])

  const error = errorResultados ?? errorComparador

  return (
    <div className="pb-10">
      <header className="mb-7">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Resultados</h1>
        <p className="mt-1 text-[12px] text-muted">
          Resultado por torneo — ingresos percibidos, gastos devengados.
        </p>
      </header>

      {error && (
        <pre className="mb-4 rounded-md bg-errbg p-3 text-[11px] text-errtx">{error.message}</pre>
      )}

      {!error && (
        <>
          <section className="mb-7">
            <h2 className="mb-3 text-[13px] font-extrabold tracking-[-.2px] text-ink">
              Estado de resultados
            </h2>
            <Card icon="documento" noPadding>
              <DataTable
                columns={COL_RESULTADOS}
                rows={resultados ?? []}
                rowKey={(row, i) => `${row.anio}-${row.producto}-${i}`}
                maxHeight={400}
                emptyMessage="No hay resultados registrados todavía."
              />
            </Card>
            <p className="mt-3 text-[10.5px] text-muted">
              La estructura permanente no se prorratea entre torneos.
            </p>
          </section>

          <section className="mb-7">
            <h2 className="mb-3 text-[13px] font-extrabold tracking-[-.2px] text-ink">
              Comparación de torneos
            </h2>
            <Card icon="equipos" noPadding>
              <DataTable
                columns={COL_COMPARADOR}
                rows={comparador ?? []}
                rowKey={(row, i) => `${row.nombre}-${row.fecha_desde}-${i}`}
                maxHeight={400}
                emptyMessage="No hay torneos para comparar todavía."
              />
            </Card>
            <p className="mt-3 text-[10.5px] text-muted">
              Los sponsors no se incluyen (son a nivel empresa, cubren ambos torneos).
            </p>
          </section>
        </>
      )}
    </div>
  )
}