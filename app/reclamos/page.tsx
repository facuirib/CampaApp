import { createClient } from '@/lib/db/server'
import { DataTable, KpiCard, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaDeudaEquipo = Database['public']['Views']['v_deuda_equipo']['Row']

interface FilaReclamo {
  tercero_id: string
  equipo: string | null
  deuda_vencida: number | null
  vencimiento_mas_antiguo: string | null
}

const COLUMNAS: ColumnDef<FilaReclamo>[] = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'deuda_vencida', label: 'Deuda vencida', format: 'money', width: 130 },
  { key: 'vencimiento_mas_antiguo', label: 'Vence desde', format: 'date', width: 108 },
]

export default async function ReclamosPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_deuda_equipo')
    .select('*')
    .gt('deuda_vencida', 0)
    .order('deuda_vencida', { ascending: false })

  const filas: FilaReclamo[] = (data ?? []).map((f: FilaDeudaEquipo) => ({
    tercero_id: f.tercero_id!,
    equipo: f.equipo,
    deuda_vencida: f.deuda_vencida,
    vencimiento_mas_antiguo: f.vencimiento_mas_antiguo,
  }))

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Reclamos</h1>
        <p className="mt-1 text-[12px] text-muted">Equipos con deuda vencida para reclamar.</p>
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