import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { Card, DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'

export const dynamic = 'force-dynamic'

interface Fila {
  tercero_id: string | null
  nombre: string | null
  tipo: CeldaBadge
  condicion_iva: string
  documento: string
  estado: CeldaBadge
  falta: string
}

const TIPO: Record<string, CeldaBadge> = {
  equipo: { estado: 'neutro', label: 'Equipo' },
  sponsor: { estado: 'info', label: 'Sponsor' },
}

/**
 * El estado fiscal, con su color.
 *
 * `sin_datos` va en ámbar y no en rojo: no es un error, es trabajo pendiente —
 * el día que se aplicó esta pantalla eran los 307. El rojo diría «algo salió
 * mal» sobre lo que en realidad nunca se cargó.
 */
function estadoABadge(estado: string | null): CeldaBadge {
  if (estado === 'completo') return { estado: 'ok', label: 'Completo' }
  if (estado === 'incompleto') return { estado: 'porVencer', label: 'Incompleto' }
  return { estado: 'porVencer', label: 'Sin datos' }
}

const COLUMNAS: ColumnDef<Fila>[] = [
  { key: 'nombre', label: 'Cliente' },
  { key: 'tipo', label: 'Tipo', format: 'badge', width: 96 },
  { key: 'condicion_iva', label: 'Condición de IVA' },
  { key: 'documento', label: 'Documento' },
  { key: 'estado', label: 'Estado fiscal', format: 'badge', width: 120 },
  { key: 'falta', label: 'Le falta' },
]

const FILTROS: FiltroUrl[] = [
  {
    parametro: 'tipo',
    label: 'Tipo',
    todos: 'Equipos y sponsors',
    opciones: [
      { valor: 'equipo', label: 'Equipos' },
      { valor: 'sponsor', label: 'Sponsors' },
    ],
  },
  {
    parametro: 'estado',
    label: 'Estado fiscal',
    todos: 'Todos',
    opciones: [
      { valor: 'falta', label: 'Solo los que faltan' },
      { valor: 'completo', label: 'Solo los completos' },
    ],
  },
]

/**
 * Clientes: a quién se le factura.
 *
 * Equipos y sponsors, que son los dos tipos de tercero del lado del ingreso.
 * `socio` no está —se le paga, y tiene `/socios`— y `proveedor` tampoco, que
 * hoy no tiene ni una fila ni forma de tenerla: `gasto` no guarda quién emitió.
 *
 * ── No es un ABM, es una campaña de carga ──────────────────────────────────
 *
 * Con 0 de 307 clientes facturables, lo que esta pantalla tiene que hacer bien
 * es decir A QUIÉN LE FALTA y dejar completarlo rápido. Por eso el encabezado
 * es un estado de avance y no un título, la columna «Le falta» dice qué —no
 * «incompleto», que obliga a abrir la ficha para averiguarlo— y el filtro
 * arranca con «solo los que faltan» a un click.
 *
 * Todos esos números salen de `v_cliente` y `v_cliente_kpi` (regla 1). Acá no
 * se cuenta ni se deriva: el caso del Responsable Inscripto —que necesita
 * razón social y domicilio para la Factura A— vive en la vista, para que la
 * lista y la ficha no puedan discrepar.
 */
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; estado?: string; q?: string }>
}) {
  const { tipo, estado, q } = await searchParams
  const supabase = await createClient()

  let consulta = supabase.from('v_cliente').select('*').order('nombre')

  if (tipo) consulta = consulta.eq('tipo', tipo)
  if (estado === 'completo') consulta = consulta.eq('facturable', true)
  if (estado === 'falta') consulta = consulta.eq('facturable', false)
  // El buscador filtra en el servidor, no esconde filas en el cliente: son 307
  // y la búsqueda tiene que poder no traerlas.
  if (q) consulta = consulta.ilike('nombre', `%${q}%`)

  const [{ data, error }, { data: kpi, error: errorKpi }] = await Promise.all([
    consulta,
    supabase.from('v_cliente_kpi').select('*').maybeSingle(),
  ])

  const filas: Fila[] = (data ?? []).map((c) => ({
    tercero_id: c.tercero_id,
    nombre: c.nombre,
    tipo: TIPO[c.tipo ?? ''] ?? { estado: 'neutro', label: c.tipo ?? '—' },
    condicion_iva: c.condicion_iva ?? '—',
    documento: c.doc_nro ?? '—',
    estado: estadoABadge(c.estado_fiscal),
    falta: c.falta_texto || '—',
  }))

  const fallo = error ?? errorKpi

  // `count(*)` de una vista llega tipado como `number | null`. Se normaliza acá,
  // una vez: no es un cálculo —los números ya vienen de `v_cliente_kpi`— es
  // sacarle el null a lo que la base nunca devuelve nulo.
  const total = kpi?.total ?? 0
  const facturables = kpi?.facturables ?? 0
  const sinDatos = kpi?.sin_datos ?? 0
  const incompletos = kpi?.incompletos ?? 0

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Clientes</h1>
        <p className="mt-1 text-[12px] text-muted">
          A quién se le factura: los equipos del torneo y los sponsors. Los datos de acá son
          los que viajan al comprobante cuando se emite.
        </p>
      </header>

      {fallo && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{fallo.message}</p>
      )}

      {kpi && (
        <div className="mb-5 rounded-md border border-line bg-white px-4 py-3.5">
          <p className="text-[13px] font-bold text-ink">
            {facturables} de {total} pueden facturarse
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
              <>Todos los clientes tienen sus datos fiscales cargados.</>
            )}{' '}
            <Link href="/clientes?estado=falta" className="font-semibold text-blue-d hover:underline">
              Ver los que faltan
            </Link>
          </p>
        </div>
      )}

      {!fallo && (
        <>
          <FiltrosUrl
            filtros={FILTROS}
            busqueda={{ parametro: 'q', label: 'Buscar', placeholder: 'Nombre del cliente…' }}
          />

          <Card>
            <DataTable
              columns={COLUMNAS}
              rows={filas}
              rowKey={(f, i) => f.tercero_id ?? i}
              rowHref={(f) => `/clientes/${f.tercero_id}`}
              maxHeight={620}
              emptyMessage={
                q ? `Ningún cliente coincide con «${q}».` : 'No hay clientes cargados.'
              }
            />
          </Card>
        </>
      )}
    </div>
  )
}
