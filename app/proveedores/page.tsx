import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { Card, DataTable, KpiCard, type ColumnDef } from '@/components/ui'
import NuevoProveedor from './NuevoProveedor'

export const dynamic = 'force-dynamic'

interface Fila {
  proveedor_id: string | null
  nombre: string | null
  cuit: string
  contacto: string
  compras: number
  total: number | null
  adeudado: number | null
  ultima_compra: string | null
}

const COLUMNAS: ColumnDef<Fila>[] = [
  { key: 'nombre', label: 'Proveedor' },
  { key: 'cuit', label: 'CUIT', width: 132 },
  { key: 'contacto', label: 'Contacto' },
  { key: 'compras', label: 'Compras', align: 'right', width: 84 },
  { key: 'total', label: 'Total comprado', format: 'money', width: 148 },
  // Rojo sólo lo adeudado: el total comprado no es un problema, es actividad.
  { key: 'adeudado', label: 'Se le debe', format: 'money', tono: 'egreso', width: 132 },
  { key: 'ultima_compra', label: 'Última compra', format: 'date', width: 124 },
]

const FILTROS: FiltroUrl[] = [
  {
    parametro: 'con',
    label: 'Actividad',
    todos: 'Todos',
    opciones: [
      { valor: 'compras', label: 'Con compras' },
      { valor: 'deuda', label: 'Con saldo pendiente' },
    ],
  },
]

/**
 * Proveedores: a quién se le compra.
 *
 * ── Por qué existe recién ahora ───────────────────────────────────────────
 *
 * `crear_proveedor` estaba desde hace rato y la tabla también, pero no había
 * pantalla: un proveedor sólo podía nacer por SQL, y por eso hay uno solo y se
 * llama «Proveedor de prueba».
 *
 * Es la contraparte de Clientes. Del lado del ingreso están los equipos y los
 * sponsors; del lado del egreso, los proveedores — los árbitros y veedores que
 * generan gasto, y de quienes se compran los activos.
 *
 * Los números salen de `v_proveedor`, que los deriva del gasto: si el gasto
 * está pagado, se le pagó. No hay una segunda cuenta que pueda discrepar.
 */
export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ con?: string; q?: string }>
}) {
  const { con, q } = await searchParams
  const supabase = await createClient()

  let consulta = supabase.from('v_proveedor').select('*').eq('activo', true).order('nombre')
  if (con === 'compras') consulta = consulta.gt('compras', 0)
  if (con === 'deuda') consulta = consulta.gt('adeudado', 0)
  if (q) consulta = consulta.ilike('nombre', `%${q}%`)

  const [{ data, error }, rol] = await Promise.all([consulta, rolActual()])
  const puedeGestionar = puede(rol, 'proveedor.crear')

  const filas: Fila[] = (data ?? []).map((p) => ({
    proveedor_id: p.proveedor_id,
    nombre: p.nombre,
    cuit: p.cuit || '—',
    contacto: [p.contacto, p.email].filter(Boolean).join(' · ') || '—',
    compras: p.compras ?? 0,
    total: p.total,
    adeudado: p.adeudado,
    ultima_compra: p.ultima_compra,
  }))

  return (
    <div className="pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Proveedores</h1>
          <p className="mt-1 text-[12px] text-muted">
            A quién se le compra: los árbitros y veedores que generan gasto, y de quienes salen los
            activos. Es la contraparte de Clientes.
          </p>
        </div>
        {puedeGestionar && <NuevoProveedor />}
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && (
        <>
          <FiltrosUrl
            filtros={FILTROS}
            busqueda={{ parametro: 'q', label: 'Buscar', placeholder: 'Nombre del proveedor…' }}
          />

          <Card>
            <DataTable
              columns={COLUMNAS}
              rows={filas}
              rowKey={(f, i) => f.proveedor_id ?? i}
              maxHeight={620}
              emptyMessage={
                q ? `Ningún proveedor coincide con «${q}».` : 'Todavía no hay proveedores cargados.'
              }
            />
          </Card>
        </>
      )}
    </div>
  )
}
