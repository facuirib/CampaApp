import { createClient } from '@/lib/db/server'
import { formatDate, formatMoney } from '@/lib/format'
import { DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaCuota = Database['public']['Views']['v_cuotas_sponsor']['Row']
type FilaMes = Database['public']['Views']['v_sponsor_detalle_mensual']['Row']

/**
 * El estado de una cuota de cobro.
 *
 * `vencida` va en rojo y no en ámbar: es plata que ya tendría que haber
 * entrado. Es el estado que la pantalla vieja no podía mostrar —
 * `v_cuotas_sponsor_futuras` filtra las vencidas— y por el que se escribió
 * `v_cuotas_sponsor`.
 */
const ESTADOS: Record<string, CeldaBadge> = {
  cobrada: { estado: 'ok', label: 'Cobrada' },
  vencida: { estado: 'mora', label: 'Vencida' },
  por_vencer: { estado: 'porVencer', label: 'Por vencer' },
}

function estadoCuota(codigo: string | null): CeldaBadge {
  // Un estado que la vista agregue mañana cae en gris con su código, en vez de
  // romper o de mentir con un color que no le toca.
  return ESTADOS[codigo ?? ''] ?? { estado: 'neutro', label: codigo ?? '—' }
}

/**
 * El período va como TEXTO, no como `format: 'date'`: la vista da `anio` y
 * `mes` por separado, y el reconocimiento es del mes completo — se asienta el
 * último día, no el primero. Mismo criterio que la tabla de socios.
 */
function formatPeriodo(anio: number | null, mes: number | null): string {
  if (anio == null || mes == null) return '—'
  return `${String(mes).padStart(2, '0')}/${anio}`
}

/** «1 cuota» y no «1 cuotas»: un contrato de una sola cuota es lo habitual. */
function plural(n: number | null, singular: string, plural: string): string {
  const cantidad = n ?? 0
  return `${cantidad} ${cantidad === 1 ? singular : plural}`
}

interface FilaCobro {
  cuota_id: string
  numero: number | null
  fecha_cobro: string | null
  monto: number | null
  cobrado_at: string | null
  estado: CeldaBadge
}

const COL_COBROS: ColumnDef<FilaCobro>[] = [
  { key: 'numero', label: 'Cuota', align: 'right', width: 70 },
  { key: 'fecha_cobro', label: 'Vence', format: 'date', width: 110 },
  { key: 'monto', label: 'Monto', format: 'money', width: 140 },
  { key: 'cobrado_at', label: 'Cobrada el', format: 'date', width: 118 },
  { key: 'estado', label: 'Estado', format: 'badge' },
]

interface FilaMensual {
  periodo_id: string
  periodo: string
  devengado: number | null
  devengado_acumulado: number | null
  pendiente_devengar: number | null
}

const COL_MENSUAL: ColumnDef<FilaMensual>[] = [
  { key: 'periodo', label: 'Período', width: 96 },
  { key: 'devengado', label: 'Reconocido', format: 'money', width: 140 },
  { key: 'devengado_acumulado', label: 'Acumulado', format: 'money', width: 140 },
  { key: 'pendiente_devengar', label: 'Falta reconocer', format: 'money', width: 150 },
]

export default async function SponsorsPage() {
  const supabase = await createClient()

  const [contratosRes, cuotasRes, mensualRes] = await Promise.all([
    supabase.from('v_estado_sponsor').select('*').order('sponsor'),
    supabase.from('v_cuotas_sponsor').select('*').order('numero'),
    supabase.from('v_sponsor_detalle_mensual').select('*').order('anio').order('mes'),
  ])

  const error = contratosRes.error ?? cuotasRes.error ?? mensualRes.error
  const contratos = contratosRes.data ?? []

  return (
    <div className="pb-10">
      {/* Sin KPIs globales: ninguna vista da el total entre contratos, y sumar
          las filas acá sería lo que la regla 1 prohíbe. El grano de
          v_estado_sponsor es el contrato, y la pantalla no lo cambia. */}
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Sponsors</h1>
        <p className="mt-1 text-[12px] text-muted">
          Cada contrato con sus dos calendarios: lo que se reconoce mes a mes y lo que se cobra en
          cuotas.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && contratos.length === 0 && (
        <div className="rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted">
          No hay contratos de sponsors cargados.
        </div>
      )}

      {contratos.map((contrato) => {
        // Reparto de filas ya traídas, no cálculo: ningún número sale de acá.
        const cobros: FilaCobro[] = (cuotasRes.data ?? [])
          .filter((c: FilaCuota) => c.contrato_id === contrato.contrato_id)
          .map((c: FilaCuota) => ({
            cuota_id: c.cuota_id!,
            numero: c.numero,
            fecha_cobro: c.fecha_cobro,
            monto: c.monto,
            cobrado_at: c.cobrado_at,
            estado: estadoCuota(c.estado),
          }))

        const meses: FilaMensual[] = (mensualRes.data ?? [])
          .filter((m: FilaMes) => m.contrato_id === contrato.contrato_id)
          .map((m: FilaMes) => ({
            periodo_id: m.periodo_id!,
            periodo: formatPeriodo(m.anio, m.mes),
            devengado: m.devengado,
            devengado_acumulado: m.devengado_acumulado,
            pendiente_devengar: m.pendiente_devengar,
          }))

        const pendienteCobrar = contrato.pendiente_cobrar ?? 0

        return (
          <section key={contrato.contrato_id} className="mb-10">
            <h2 className="text-[13px] font-extrabold tracking-[-.2px] text-ink">
              {contrato.sponsor}
            </h2>
            <p className="mb-3 text-[11px] text-muted">
              {formatDate(contrato.vigente_desde)} — {formatDate(contrato.vigente_hasta)} ·{' '}
              {plural(contrato.meses, 'mes', 'meses')} ·{' '}
              {plural(contrato.cuotas, 'cuota', 'cuotas')}
              {(contrato.cuotas_pendientes ?? 0) > 0 &&
                `, ${contrato.cuotas_pendientes} pendiente${contrato.cuotas_pendientes === 1 ? '' : 's'}`}
            </p>

            {/* Dos pares que no se mezclan: contratado/reconocido responden
                "cuánto ganamos"; cobrado/pendiente, "cuándo entra la plata".
                Son los dos calendarios de §3.20, uno en cada mitad. */}
            <div className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <KpiCard tono="neutro" titulo="Contratado" valor={contrato.monto_total ?? 0} />
              <KpiCard
                tono="positivo"
                titulo="Reconocido"
                valor={contrato.devengado ?? 0}
                subtitulo={`Faltan ganar ${formatMoney(contrato.pendiente_devengar ?? 0)}`}
              />
              <KpiCard tono="info" titulo="Cobrado" valor={contrato.cobrado ?? 0} />
              <KpiCard
                tono={pendienteCobrar > 0 ? 'alerta' : 'positivo'}
                titulo="Pendiente de cobrar"
                valor={pendienteCobrar}
              />
            </div>

            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[.06em] text-muted">
              Calendario de cobro
            </h3>
            {/* El total se PASA desde v_estado_sponsor. Verificado contra los
                datos en los tres contratos: monto_total es exactamente la suma
                de las cuotas —cargar_cuotas_sponsor lo exige al cargarlas, así
                que es un invariante y no una coincidencia—. */}
            <DataTable
              className="mb-5"
              columns={COL_COBROS}
              rows={cobros}
              rowKey="cuota_id"
              maxHeight={340}
              total={{ numero: 'Total', monto: contrato.monto_total ?? 0 }}
              emptyMessage="Este contrato no tiene cronograma de cobro cargado."
            />

            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[.06em] text-muted">
              Reconocimiento mensual
            </h3>
            {/* `devengado` se totaliza: es flujo, y la suma de los meses da
                exactamente el reconocido de la vista —las dos salen del mismo
                ING_SPONSORS, así que reconcilian por construcción—.

                `devengado_acumulado` y `pendiente_devengar` quedan EN BLANCO:
                son stock. Cada fila ya contiene a las anteriores, y sumar la
                columna contaría los meses viejos una vez por cada mes que
                sigue. Sus valores de cierre ya están arriba, en los KpiCards de
                Reconocido y en su subtítulo. */}
            <DataTable
              columns={COL_MENSUAL}
              rows={meses}
              rowKey="periodo_id"
              maxHeight={340}
              total={{ periodo: 'Total', devengado: contrato.devengado ?? 0 }}
              emptyMessage="Todavía no se devengó ningún mes de este contrato."
            />
          </section>
        )
      })}
    </div>
  )
}
