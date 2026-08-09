import { createClient } from '@/lib/db/server'
import { Badge, DataTable, KpiCard, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaMensual = Database['public']['Views']['v_socio_detalle_mensual']['Row']

interface FilaPeriodo {
  periodo_id: string
  periodo: string
  devengado: number | null
  retirado: number | null
  neto: number | null
  saldo_acumulado: number | null
}

/**
 * El período va como TEXTO, no como `format: 'date'`.
 *
 * La vista da `anio` y `mes` por separado, no una fecha: fabricar un día 1 para
 * poder formatearlo sería inventar un dato que no existe, y mostrar "01/08/26"
 * donde el mes es la unidad. El devengo es del mes completo — se asienta el
 * último día, no el primero.
 */
function formatPeriodo(anio: number | null, mes: number | null): string {
  if (anio == null || mes == null) return '—'
  return `${String(mes).padStart(2, '0')}/${anio}`
}

const COLUMNAS: ColumnDef<FilaPeriodo>[] = [
  { key: 'periodo', label: 'Período', width: 96 },
  { key: 'devengado', label: 'Devengado', format: 'money', width: 132 },
  { key: 'retirado', label: 'Retirado', format: 'money', width: 132 },
  { key: 'neto', label: 'Neto', format: 'money', width: 132 },
  { key: 'saldo_acumulado', label: 'Saldo acumulado', format: 'money', width: 150 },
]

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

  // Reparto de filas ya traídas, no cálculo: ningún número sale de acá.
  const detallePorSocio = new Map<string, FilaMensual[]>()
  for (const fila of detalle ?? []) {
    if (!fila.socio_id) continue
    const actuales = detallePorSocio.get(fila.socio_id) ?? []
    actuales.push(fila)
    detallePorSocio.set(fila.socio_id, actuales)
  }

  return (
    <div className="pb-10">
      {/* Sin KPIs globales arriba: ninguna vista da el total entre socios, y
          sumar las dos filas acá sería exactamente lo que la regla 1 prohíbe.
          Los KPIs son por socio, que es el grano que v_saldo_socio da. */}
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Socios</h1>
        <p className="mt-1 text-[12px] text-muted">
          La cuenta de cada socio: lo devengado, lo retirado y el saldo a favor.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && (!socios || socios.length === 0) && (
        <div className="rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted">
          No hay socios cargados.
        </div>
      )}

      {socios?.map((socio) => {
        const saldo = socio.saldo ?? 0
        const filas: FilaPeriodo[] = (
          socio.socio_id ? (detallePorSocio.get(socio.socio_id) ?? []) : []
        ).map((f) => ({
          periodo_id: f.periodo_id!,
          periodo: formatPeriodo(f.anio, f.mes),
          devengado: f.devengado,
          retirado: f.retirado,
          neto: f.neto,
          saldo_acumulado: f.saldo_acumulado,
        }))

        return (
          <section key={socio.socio_id} className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[13px] font-extrabold tracking-[-.2px] text-ink">
                {socio.nombre}
              </h2>
              {socio.activo === false && <Badge estado="neutro">Inactivo</Badge>}
            </div>

            <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <KpiCard tono="neutro" titulo="Devengado" valor={socio.devengado ?? 0} />
              <KpiCard tono="info" titulo="Retirado" valor={socio.retirado ?? 0} />
              {/* El saldo negativo es el socio que retiró de más: plata que le
                  queda en contra. Va en alerta porque es la única de las tres
                  cifras que puede estar mal, no porque cero sea malo. */}
              <KpiCard
                tono={saldo < 0 ? 'alerta' : 'positivo'}
                titulo="Saldo"
                valor={saldo}
                subtitulo={saldo < 0 ? 'Retiró más de lo devengado' : 'A favor del socio'}
              />
            </div>

            {/* La fila de total se PASA desde v_saldo_socio, no se suma acá.
                Verificado contra los datos: devengado y retirado de la vista
                coinciden con la suma de las mensuales en los dos socios.

                `saldo_acumulado` queda EN BLANCO a propósito. Las otras tres
                columnas son flujo —lo que pasó en cada mes— y sumarlas da algo
                que significa: los netos suman exactamente el saldo. El
                acumulado es STOCK: cada fila ya contiene a las anteriores, así
                que sumar la columna cuenta los meses viejos una vez por cada
                mes siguiente. El único total sensato sería el último valor de
                la serie, y ése ya está arriba en el KpiCard de Saldo — bajo un
                rótulo que dice "saldo" y no "total". */}
            <DataTable
              columns={COLUMNAS}
              rows={filas}
              rowKey="periodo_id"
              maxHeight={420}
              total={{
                periodo: 'Total',
                devengado: socio.devengado ?? 0,
                retirado: socio.retirado ?? 0,
                neto: saldo,
              }}
              emptyMessage="Todavía no hay devengos ni retiros para este socio."
            />
          </section>
        )
      })}
    </div>
  )
}
