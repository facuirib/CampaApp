import { createClient } from '@/lib/db/server'
import { DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaDeuda = Database['public']['Views']['v_deuda_equipo']['Row']

interface Deudor {
  tercero_id: string
  equipo: string | null
  estado: CeldaBadge
  deuda_vencida: number | null
  deuda_total: number | null
  vencimiento_mas_antiguo: string | null
  torneos_con_deuda: number | null
  saldo_a_favor: number | null
  email: string | null
}

/**
 * El estado de un deudor.
 *
 * `v_deuda_equipo` NO trae columna de estado: lista importes por equipo, no
 * situaciones de cuota. Así que el badge se deriva de si hay o no deuda
 * vencida. Es una comparación para elegir un color y un rótulo, no un total
 * calculado — los importes que se ven en las columnas siguen siendo los de la
 * vista, sin tocar.
 *
 * El mapa de estados de cuota (al_dia, pagada, por_vencer, vencida,
 * parcial_vencida) corresponde a `v_deuda_detalle`, que es por cuota. Va a
 * usarse en la pantalla de detalle, que es donde esas filas existen.
 */
function estadoDeudor(vencida: number | null, aFavor: number | null): CeldaBadge {
  if ((vencida ?? 0) > 0) return { estado: 'mora', label: 'En mora' }
  if ((aFavor ?? 0) > 0) return { estado: 'info', label: 'Con anticipo' }
  return { estado: 'porVencer', label: 'Por vencer' }
}

const COLUMNAS: ColumnDef<Deudor>[] = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'estado', label: 'Estado', format: 'badge' },
  { key: 'deuda_vencida', label: 'Vencida', format: 'money', width: 118 },
  { key: 'deuda_total', label: 'Deuda total', format: 'money', width: 128 },
  { key: 'vencimiento_mas_antiguo', label: 'Vence desde', format: 'date', width: 108 },
  { key: 'torneos_con_deuda', label: 'Torneos', align: 'right', width: 76 },
  { key: 'saldo_a_favor', label: 'A favor', format: 'money', width: 108 },
  { key: 'email', label: 'Email' },
]

export default async function CobranzaPage() {
  const supabase = await createClient()

  const [deudores, kpis, activo] = await Promise.all([
    supabase
      .from('v_deuda_equipo')
      .select('*')
      .order('deuda_vencida', { ascending: false })
      .order('vencimiento_mas_antiguo', { ascending: true }),
    // La misma vista que alimentaba /cobranza/kpis, ahora acá.
    supabase.from('v_cobranza_kpi').select('*').order('nombre'),
    supabase.from('torneo').select('id').eq('activo', true).order('nombre').limit(1).maybeSingle(),
  ])

  const error = deudores.error ?? kpis.error ?? activo.error

  // `v_cobranza_kpi` da una fila por torneo. El encabezado es del torneo en
  // curso: se elige la fila, no se suman las filas.
  const kpi = kpis.data?.find((k) => k.torneo_id === activo.data?.id) ?? kpis.data?.[0] ?? null

  const filas: Deudor[] = (deudores.data ?? []).map((f: FilaDeuda) => ({
    tercero_id: f.tercero_id!,
    equipo: f.equipo,
    estado: estadoDeudor(f.deuda_vencida, f.saldo_a_favor),
    deuda_vencida: f.deuda_vencida,
    deuda_total: f.deuda_total,
    vencimiento_mas_antiguo: f.vencimiento_mas_antiguo,
    torneos_con_deuda: f.torneos_con_deuda,
    saldo_a_favor: f.saldo_a_favor,
    email: f.email,
  }))

  const tasa = kpi?.tasa_cobranza ?? 0

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Deudores</h1>
        <p className="mt-1 text-[12px] text-muted">
          {kpi?.nombre
            ? `${kpi.nombre} — equipos con deuda pendiente, ordenados por urgencia de reclamo.`
            : 'Equipos con deuda pendiente, ordenados por urgencia de reclamo.'}
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {/* Tres tajadas que NO se pisan: `por_vencer` y `vencido` son disjuntas
          entre sí, y la tasa es un porcentaje. Ninguna contiene a otra, así que
          cada rótulo nombra su tajada exacta y no insinúa un total. Los tres
          vienen calculados de v_cobranza_kpi: la pantalla no suma la columna
          de la tabla para llegar a ninguno. */}
      <div className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <KpiCard
          tono="info"
          titulo="Por vencer"
          valor={kpi?.por_vencer ?? 0}
          icon="calendario"
          subtitulo="Todavía no vencida"
        />
        <KpiCard
          tono="alerta"
          titulo="En mora"
          valor={kpi?.vencido ?? 0}
          icon="alerta"
          subtitulo="Vencida e impaga"
        />
        <KpiCard
          tono={tasa >= 50 ? 'positivo' : 'neutro'}
          titulo="Tasa de cobranza"
          valor={tasa}
          formato="entero"
          icon="monedas"
          subtitulo={
            kpi?.dias_promedio_cobro == null
              ? '% de lo comprometido, ya cobrado'
              : `% cobrado · ${kpi.dias_promedio_cobro} días promedio`
          }
        />
      </div>

      {/* Sin fila de total: ninguna vista da el total de exactamente lo que
          esta tabla lista. `v_cobranza_kpi` es por torneo y acá hay deuda de
          todos los torneos que cada equipo arrastre, así que un total pasado
          desde ahí sería otro número. Sumarlo en el front, peor. */}
      <DataTable
        columns={COLUMNAS}
        rows={filas}
        rowKey="tercero_id"
        rowHref={(f) => `/cobranza/${f.tercero_id}`}
        maxHeight={560}
        emptyMessage="Ningún equipo tiene deuda pendiente."
      />
    </div>
  )
}
