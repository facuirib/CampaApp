import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import Trasladar from './Trasladar'
import { DataTable, KpiCard, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaCaja = Database['public']['Views']['v_saldo_caja']['Row']

const COL_CAJAS: ColumnDef<FilaCaja>[] = [
  { key: 'nombre', label: 'Caja' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'predio', label: 'Predio' },
  { key: 'saldo', label: 'Saldo', format: 'money' },
]

export default async function CajaPage() {
  const supabase = await createClient()

  const [{ data: cajas, error: errorCajas }, { data: total, error: errorTotal }] =
    await Promise.all([
      supabase.from('v_saldo_caja').select('*').order('saldo', { ascending: false }),
      supabase.from('v_saldo_caja_total').select('*').maybeSingle(),
    ])

  const error = errorCajas ?? errorTotal
  const puedeTrasladar = puede(await rolActual(), 'caja.trasladar')

  return (
    <div className="pb-10">
      <header className="mb-7">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Caja</h1>
        <p className="mt-1 text-[12px] text-muted">
          Saldos disponibles por caja. Tocá una para ver cómo llegó a ese número.
        </p>
      </header>

      {error && (
        <pre className="mb-4 rounded-md bg-errbg p-3 text-[11px] text-errtx">{error.message}</pre>
      )}

      {!error && puedeTrasladar && (
        <Trasladar
          cajas={(cajas ?? []).map((c) => ({
            caja_id: c.caja_id!,
            nombre: c.nombre ?? 'Caja',
            saldo: c.saldo ?? 0,
            predio_id: c.predio_id,
            predio: c.predio,
          }))}
        />
      )}

      {!error && (
        <>
          <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              titulo="Saldo total en caja"
              valor={total?.saldo_total ?? null}
              tono="info"
              icon="caja"
              subtitulo={total?.cajas != null ? `${total.cajas} cajas` : undefined}
            />
          </div>

          <DataTable
            columns={COL_CAJAS}
            rows={cajas ?? []}
            rowHref={(f) => `/caja/${f.caja_id}`}
            rowKey="caja_id"
            total={{ nombre: 'Total', saldo: total?.saldo_total ?? 0 }}
            maxHeight={400}
            emptyMessage="No hay cajas registradas."
          />
        </>
      )}
    </div>
  )
}