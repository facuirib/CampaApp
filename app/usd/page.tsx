import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import OperarUsd from './OperarUsd'
import { createClient } from '@/lib/db/server'
import { formatEntero, formatUSD } from '@/lib/format'
import { Badge, DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type Operacion = Database['public']['Tables']['usd_operacion']['Row']
type FilaCambio = Database['public']['Views']['v_resultado_cambio']['Row']

/** Período mensual: "08/2026". Mismo criterio que socios y sponsors. */
function formatPeriodo(anio: number | null, mes: number | null): string {
  if (anio == null || mes == null) return '—'
  return `${String(mes).padStart(2, '0')}/${anio}`
}

const TIPOS: Record<string, CeldaBadge> = {
  compra: { estado: 'info', label: 'Compra' },
  venta: { estado: 'neutro', label: 'Venta' },
}

function tipoOperacion(tipo: string | null): CeldaBadge {
  return TIPOS[tipo ?? ''] ?? { estado: 'neutro', label: tipo ?? '—' }
}

interface FilaOperacion {
  id: string
  fecha: string | null
  tipo: CeldaBadge
  cantidad: string
  tc: number | null
  monto_pesos: number | null
  motivo: string | null
}

const COL_OPERACIONES: ColumnDef<FilaOperacion>[] = [
  { key: 'fecha', label: 'Fecha', format: 'date', width: 104 },
  { key: 'tipo', label: 'Tipo', format: 'badge', width: 96 },
  { key: 'cantidad', label: 'Cantidad', align: 'right', width: 112 },
  { key: 'tc', label: 'TC', format: 'money', width: 100 },
  { key: 'monto_pesos', label: 'Monto', format: 'money', width: 140 },
  { key: 'motivo', label: 'Motivo' },
]

interface FilaDifCambio {
  periodo_key: string
  periodo: string
  resultado: number | null
  ganancias: number | null
  perdidas: number | null
}

const COL_DIF_CAMBIO: ColumnDef<FilaDifCambio>[] = [
  { key: 'periodo', label: 'Período', width: 96 },
  { key: 'resultado', label: 'Resultado', format: 'money', width: 150 },
  { key: 'ganancias', label: 'Ganancias', format: 'money', width: 150 },
  { key: 'perdidas', label: 'Pérdidas', format: 'money', width: 150 },
]

export default async function UsdPage() {
  const supabase = await createClient()

  const [tenenciaRes, sincroniaRes, cambioRes, totalRes, operacionesRes] = await Promise.all([
    supabase.from('v_tenencia_usd').select('*').maybeSingle(),
    supabase.from('v_usd_sincronia').select('*').maybeSingle(),
    supabase
      .from('v_resultado_cambio')
      .select('*')
      .order('anio', { ascending: false })
      .order('mes', { ascending: false }),
    supabase.from('v_resultado_cambio_total').select('*').maybeSingle(),
    supabase.from('usd_operacion').select('*').order('fecha', { ascending: false }),
  ])

  const error =
    tenenciaRes.error ??
    sincroniaRes.error ??
    cambioRes.error ??
    totalRes.error ??
    operacionesRes.error

  const tenencia = tenenciaRes.data
  const puedeOperar = puede(await rolActual(), 'usd.operar')
  const sincronia = sincroniaRes.data
  const total = totalRes.data

  // El estado real de v_usd_sincronia es 'OK'. Antes esto adivinaba buscando
  // subcadenas ('ok', 'sincronizado', 'cuadra'), que además daba verde con un
  // hipotético "NO OK" — contiene "ok". Comparación exacta, y lo que no conozca
  // cae en rojo: un estado desconocido en un control de sincronía no es bueno.
  const cuadra = sincronia?.estado === 'OK'

  const resultadoCambio = total?.resultado ?? 0

  const operaciones: FilaOperacion[] = (operacionesRes.data ?? []).map((o: Operacion) => ({
    id: o.id,
    fecha: o.fecha,
    tipo: tipoOperacion(o.tipo),
    // La venta guarda la cantidad en NEGATIVO —así `sum(cantidad)` da la
    // tenencia—, pero en la fila se muestra el valor absoluto: el signo ya lo
    // dice el badge, y un "-2.000" al lado de "Venta" se lee como doble
    // negación.
    cantidad: formatUSD(Math.abs(o.cantidad)),
    tc: o.tc,
    monto_pesos: o.monto_pesos,
    motivo: o.motivo,
  }))

  const filasCambio: FilaDifCambio[] = (cambioRes.data ?? []).map((f: FilaCambio) => ({
    periodo_key: `${f.anio}-${f.mes}`,
    periodo: formatPeriodo(f.anio, f.mes),
    resultado: f.resultado,
    ganancias: f.ganancias,
    perdidas: f.perdidas,
  }))

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Dólares</h1>
        <p className="mt-1 text-[12px] text-muted">
          El resguardo en moneda extranjera: qué hay, a qué costo, y cuánto dejaron las ventas.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {/* Las dos acciones que faltaban. La pantalla mostraba tenencia, costo y
          resultado, y no tenía cómo registrar una operación: comprar y vender
          se hacían contra la base. `comprar_usd` y `vender_usd` son de las
          puertas que no se pueden esquivar —llevan el promedio ponderado y la
          diferencia de cambio realizada—, así que acá sólo se las llama. */}
      {puedeOperar && (
        <OperarUsd
          tenencia={tenencia?.tenencia_usd ?? 0}
          costoPromedio={tenencia?.promedio_ponderado ?? 0}
        />
      )}

      {/* Los cuatro salen de vistas. El de resultado viene de
          v_resultado_cambio_total, que suma v_resultado_cambio: el KPI y la
          tabla de abajo no pueden discrepar. */}
      <div className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <KpiCard
          tono="info"
          titulo="Tenencia"
          valor={tenencia?.tenencia_usd ?? 0}
          formato="usd"
          icon="usd"
          subtitulo="En caja USD"
        />
        <KpiCard
          tono="neutro"
          titulo="Costo en libros"
          valor={tenencia?.costo_libros ?? 0}
          icon="banco"
          // El subtítulo NO es decorativo: sin él, este número se lee como
          // "cuánto valen mis dólares". Es lo que se pagó. El sistema no tiene
          // cotización del día y por eso no puede valuar a mercado (§3.7).
          subtitulo="Lo pagado, no valor de mercado"
        />
        <KpiCard
          tono="neutro"
          titulo="TC promedio ponderado"
          // Sin tenencia la vista devuelve null y el KpiCard muestra un guion:
          // un tipo de cambio de cero pesos no existe, y mostrarlo inventaría
          // un dato. `?? null` es explícito a propósito.
          valor={tenencia?.promedio_ponderado ?? null}
          subtitulo="Costo promedio de cada dólar"
        />
        <KpiCard
          tono={resultadoCambio > 0 ? 'positivo' : resultadoCambio < 0 ? 'alerta' : 'neutro'}
          titulo="Resultado por cambio"
          valor={resultadoCambio}
          icon="monedas"
          subtitulo="Realizado: sólo lo que se vendió"
        />
      </div>

      {sincronia && (
        <section className="mb-8 rounded-md border border-line bg-white px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-[13px] font-extrabold tracking-[-.2px] text-ink">
              Control de sincronía
            </h2>
            <Badge estado={cuadra ? 'ok' : 'mora'}>{sincronia.estado ?? 'Desconocido'}</Badge>
          </div>

          <p className="mb-3 text-[11px] text-muted">
            Compara el saldo contable de <code className="font-mono">CAJA_USD</code> con el que se
            deduce de las operaciones. Si difieren, alguien tocó la cuenta por afuera de{' '}
            <code className="font-mono">comprar_usd</code> /{' '}
            <code className="font-mono">vender_usd</code> y el promedio ponderado quedó corrido.
          </p>

          <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
            {[
              { rotulo: 'Costo en libros', valor: sincronia.costo_libros },
              { rotulo: 'Costo esperado', valor: sincronia.costo_esperado },
              { rotulo: 'Diferencia', valor: sincronia.diferencia, resaltar: true },
            ].map((d) => (
              <div key={d.rotulo}>
                <dt className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  {d.rotulo}
                </dt>
                <dd
                  className={[
                    'cifra text-[13px] font-bold',
                    d.resaltar && (d.valor ?? 0) !== 0 ? 'text-errtx' : 'text-ink',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  ${formatEntero(d.valor ?? 0)}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-[10.5px] text-muted">
            {sincronia.lineas_caja_usd ?? 0} líneas de caja · {sincronia.operaciones ?? 0}{' '}
            operaciones
          </p>
        </section>
      )}

      <h2 className="mb-2 text-[13px] font-extrabold tracking-[-.2px] text-ink">Operaciones</h2>
      {/* Sin fila de total: sumar montos de compras y ventas daría plata que
          entró y salió mezclada, que no es ningún saldo. Los totales que sí
          significan algo están arriba. */}
      <DataTable
        className="mb-8"
        columns={COL_OPERACIONES}
        rows={operaciones}
        rowKey="id"
        maxHeight={360}
        emptyMessage="Todavía no hay compras ni ventas de dólares."
      />

      <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
        Resultado por diferencia de cambio
      </h2>
      <p className="mb-2 text-[11px] text-muted">
        Va separado del resultado de los torneos: una variación del dólar no dice nada del desempeño
        de un torneo.
      </p>
      {/* Las tres columnas se totalizan y el total se PASA desde
          v_resultado_cambio_total, que suma esta misma vista. Las tres son
          flujo del mes —no acumulados—, así que la suma significa algo. */}
      <DataTable
        columns={COL_DIF_CAMBIO}
        rows={filasCambio}
        rowKey="periodo_key"
        maxHeight={360}
        total={{
          periodo: 'Total',
          resultado: total?.resultado ?? 0,
          ganancias: total?.ganancias ?? 0,
          perdidas: total?.perdidas ?? 0,
        }}
        emptyMessage="Todavía no hay ventas: la diferencia de cambio se realiza al vender."
      />
    </div>
  )
}
