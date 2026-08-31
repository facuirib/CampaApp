import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { Card, DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'

export const dynamic = 'force-dynamic'

interface Fila {
  tercero_id: string | null
  nombre: string | null
  delegado: string
  email: string
  torneos: string
  estado: CeldaBadge
  falta: string
}

/**
 * El estado fiscal, con su color.
 *
 * `sin_datos` va en ámbar y no en rojo: no es un error, es trabajo pendiente.
 * El rojo diría «algo salió mal» sobre lo que en realidad nunca se cargó.
 */
function estadoABadge(estado: string | null): CeldaBadge {
  if (estado === 'completo') return { estado: 'ok', label: 'Completo' }
  if (estado === 'incompleto') return { estado: 'porVencer', label: 'Incompleto' }
  return { estado: 'porVencer', label: 'Sin datos' }
}

const COLUMNAS: ColumnDef<Fila>[] = [
  { key: 'nombre', label: 'Equipo' },
  { key: 'delegado', label: 'Delegado' },
  { key: 'email', label: 'Mail' },
  // Los torneos que jugó. Es la columna que vuelve visible la idea de fondo:
  // el equipo es más grande que un torneo, y acá se ve cuántos lleva.
  { key: 'torneos', label: 'Torneos', width: 88 },
  { key: 'estado', label: 'Estado fiscal', format: 'badge', width: 120 },
  { key: 'falta', label: 'Le falta' },
]

const FILTROS: FiltroUrl[] = [
  {
    parametro: 'estado',
    label: 'Estado fiscal',
    todos: 'Todos',
    opciones: [
      { valor: 'falta', label: 'Solo los que faltan' },
      { valor: 'completo', label: 'Solo los completos' },
    ],
  },
  {
    parametro: 'jugo',
    label: 'Participación',
    todos: 'Todos',
    opciones: [
      { valor: 'si', label: 'Jugaron algún torneo' },
      { valor: 'no', label: 'Nunca jugaron' },
    ],
  },
]

/**
 * Equipos: el padrón, y la puerta a la ficha de cada uno.
 *
 * ── Por qué ya no se llama «Clientes» ──────────────────────────────────────
 *
 * «Cliente» es un ROL —a quién le facturo— y el sponsor también lo tiene. La
 * entidad es el EQUIPO: es lo que tiene serie, torneos, cuotas y deuda, y es
 * lo que sobrevive a un torneo. Los sponsors se fueron a `/sponsors`, que ya
 * tenía su propia lista y su propia ficha.
 *
 * ── Qué muestra la tabla, y qué se fue a la ficha ──────────────────────────
 *
 * Acá va lo que sirve para ENCONTRAR y para saber a quién le falta algo:
 * delegado y mail —con quién se habla—, cuántos torneos jugó, y el estado
 * fiscal como indicador. La condición de IVA y el documento se fueron a la
 * ficha: son el detalle de un equipo, no un criterio para recorrer 304.
 *
 * Todos los números salen de `v_cliente` y `v_cliente_kpi` (regla 1). El
 * conteo de torneos también: es un `count` y no se hace acá.
 */
export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; jugo?: string; q?: string }>
}) {
  const { estado, jugo, q } = await searchParams
  const supabase = await createClient()

  // 🔴 `tipo='equipo'` es lo que separa esta pantalla de /sponsors. Sin esto
  // volvería a mezclar dos entidades que ya no comparten ni ficha ni módulo.
  let consulta = supabase.from('v_cliente').select('*').eq('tipo', 'equipo').order('nombre')

  if (estado === 'completo') consulta = consulta.eq('facturable', true)
  if (estado === 'falta') consulta = consulta.eq('facturable', false)
  if (jugo === 'si') consulta = consulta.gt('torneos', 0)
  if (jugo === 'no') consulta = consulta.eq('torneos', 0)
  // El buscador filtra en el servidor, no esconde filas en el cliente: son 304
  // y la búsqueda tiene que poder no traerlas.
  if (q) consulta = consulta.ilike('nombre', `%${q}%`)

  const [{ data, error }, { data: kpi, error: errorKpi }] = await Promise.all([
    consulta,
    supabase.from('v_cliente_kpi').select('*').maybeSingle(),
  ])

  const filas: Fila[] = (data ?? []).map((c) => ({
    tercero_id: c.tercero_id,
    nombre: c.nombre,
    delegado: c.delegado || '—',
    email: c.email || '—',
    torneos: c.torneos ? String(c.torneos) : '—',
    estado: estadoABadge(c.estado_fiscal),
    falta: c.falta_texto || '—',
  }))

  const fallo = error ?? errorKpi

  // Los KPI de EQUIPOS, no los del total: la vista los trae separados desde
  // que la lista se partió en dos pantallas.
  const total = kpi?.equipos ?? 0
  const facturables = kpi?.equipos_facturables ?? 0
  const sinDatos = kpi?.equipos_sin_datos ?? 0
  const incompletos = kpi?.equipos_incompletos ?? 0

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Equipos</h1>
        <p className="mt-1 text-[12px] text-muted">
          El padrón. Cada equipo tiene su ficha: con quién se habla, qué debe y en qué torneos
          jugó.
        </p>
      </header>

      {fallo && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{fallo.message}</p>
      )}

      {kpi && (
        <div className="mb-5 rounded-md border border-line bg-white px-4 py-3.5">
          <p className="text-[13px] font-bold text-ink">
            {facturables} de {total} equipos pueden facturarse
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">
            {sinDatos > 0 ? (
              <>
                Faltan cargar <strong className="font-semibold text-ink">{sinDatos}</strong>{' '}
                sin ningún dato fiscal
                {incompletos > 0 && <> y {incompletos} a medio completar</>}. Hasta que se
                completen, se les factura como <strong>Consumidor Final</strong> — que sirve para
                una Factura B y no para una A.
              </>
            ) : (
              <>Todos los equipos tienen sus datos fiscales cargados.</>
            )}{' '}
            <Link href="/equipos?estado=falta" className="font-semibold text-blue-d hover:underline">
              Ver los que faltan
            </Link>
          </p>
        </div>
      )}

      {!fallo && (
        <>
          <FiltrosUrl
            filtros={FILTROS}
            busqueda={{ parametro: 'q', label: 'Buscar', placeholder: 'Nombre del equipo…' }}
          />

          <Card>
            <DataTable
              columns={COLUMNAS}
              rows={filas}
              rowKey={(f, i) => f.tercero_id ?? i}
              rowHref={(f) => (f.tercero_id ? `/equipos/${f.tercero_id}` : undefined)}
              maxHeight={620}
              emptyMessage={
                q ? `Ningún equipo coincide con «${q}».` : 'No hay equipos cargados.'
              }
            />
          </Card>
        </>
      )}
    </div>
  )
}
