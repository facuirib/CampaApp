import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaDeudaEquipo = Database['public']['Views']['v_deuda_equipo']['Row']
type FilaReclamoEquipo = Database['public']['Views']['v_reclamo_equipo']['Row']

interface FilaReclamo {
  tercero_id: string
  equipo: string | null
  deuda_vencida: number | null
  vencimiento_mas_antiguo: string | null
  ultimo_reclamo: CeldaBadge | string | null
  reclamos: number | null
}

const COLUMNAS: ColumnDef<FilaReclamo>[] = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'deuda_vencida', label: 'Deuda vencida', format: 'money', width: 130 },
  { key: 'vencimiento_mas_antiguo', label: 'Vence desde', format: 'date', width: 108 },
  { key: 'ultimo_reclamo', label: 'Último reclamo', format: 'badge', width: 140 },
  { key: 'reclamos', label: 'Reclamos', align: 'right', width: 88 },
]

export default async function ReclamosPage() {
  const supabase = await createClient()

  const [deudaRes, reclamosRes] = await Promise.all([
    supabase
      .from('v_deuda_equipo')
      .select('*')
      .gt('deuda_vencida', 0)
      .order('deuda_vencida', { ascending: false }),
    // Lookup: sólo trae los equipos QUE tienen reclamos. Uno ausente es uno
    // nunca reclamado, sin necesidad de una fila en cero.
    supabase.from('v_reclamo_equipo').select('*'),
  ])

  const { data, error } = deudaRes

  const porEquipo = new Map<string, FilaReclamoEquipo>()
  for (const r of reclamosRes.data ?? []) {
    if (r.tercero_id) porEquipo.set(r.tercero_id, r)
  }

  const filas: FilaReclamo[] = (data ?? []).map((f: FilaDeudaEquipo) => {
    const r = f.tercero_id ? porEquipo.get(f.tercero_id) : undefined
    return {
      tercero_id: f.tercero_id!,
      equipo: f.equipo,
      deuda_vencida: f.deuda_vencida,
      vencimiento_mas_antiguo: f.vencimiento_mas_antiguo,
      // El badge dice hace CUÁNTO, no la fecha: para decidir a quién llamar hoy
      // importa "hace 12 días" mucho más que "el 30/07".
      ultimo_reclamo: r?.ultimo_reclamo
        ? {
            estado: (r.dias_desde_ultimo ?? 0) > 7 ? 'porVencer' : 'ok',
            label:
              r.dias_desde_ultimo === 0
                ? 'Hoy'
                : `Hace ${r.dias_desde_ultimo} ${r.dias_desde_ultimo === 1 ? 'día' : 'días'}`,
          }
        : { estado: 'mora', label: 'Nunca' },
      reclamos: r?.reclamos ?? 0,
    }
  })

  return (
    <div className="pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Reclamos</h1>
          <p className="mt-1 text-[12px] text-muted">
            Equipos con deuda vencida. El badge dice hace cuánto se le reclamó a cada uno.
          </p>
        </div>
        <Link
          href="/reclamos/historial"
          className="text-[11px] font-semibold text-blue-d hover:underline"
        >
          Ver historial completo →
        </Link>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && (
        <>
          {/* Solo el COUNT de equipos, no el total de plata: v_deuda_equipo no
              trae un total agregado y sumarlo acá sería exactamente la regla 1
              rota — un número que ninguna vista respalda. */}
          <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            <KpiCard
              tono="alerta"
              titulo="Equipos con deuda vencida"
              valor={filas.length}
              formato="entero"
              icon="alerta"
            />
          </div>

          <DataTable
            columns={COLUMNAS}
            rows={filas}
            rowKey="tercero_id"
            rowHref={(f) => `/reclamos/${f.tercero_id}`}
            maxHeight={560}
            emptyMessage="No hay equipos con deuda vencida."
          />
        </>
      )}
    </div>
  )
}
