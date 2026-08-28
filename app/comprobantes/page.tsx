import { createClient } from '@/lib/db/server'
import { rolActual } from '@/lib/rol-actual'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import { formatMoneyExacto } from '@/lib/format'
import type { Database } from '@/lib/db/database.types'

type FilaVista = Database['public']['Views']['v_comprobante']['Row']

/**
 * Consulta de comprobantes: facturas y recibos juntos.
 *
 * Son dos documentos distintos —uno es fiscal, el otro no— pero se buscan en el
 * mismo lugar: «el papel del cobro de tal equipo». Tenerlos en dos pantallas
 * obligaría a saber de antemano cuál se emitió, que es justo lo que se viene a
 * averiguar. Por eso van juntos, con el filtro de tipo primero para separarlos.
 *
 * Esta pantalla NO emite. La emisión es otra pieza y va a vivir aparte.
 */

/** Quiénes ven los comprobantes: los mismos que ven Gastos y Clientes. */
const VE_LA_LISTA = ['admin', 'operador', 'read-only', 'finanzas']

/**
 * Quiénes van a ver el acumulado por dirección, que llega en el paso siguiente.
 *
 * **Esconderlo es claridad de navegación, NO seguridad.** La policy de SELECT de
 * `comprobante` es `using (true)` y tiene que seguir así (nota #1), o sea que el
 * dato es alcanzable por cualquiera que esté autenticado. Lo que se evita acá es
 * ruido: la base imponible por municipio no le sirve a quien cobra, y una
 * pantalla que muestra todo a todos se vuelve ilegible para el que sólo busca un
 * recibo. Si algún día esto tuviera que ser una barrera, la barrera va en la
 * base, no acá.
 */
export const VE_EL_ACUMULADO = ['admin', 'finanzas']

const BADGE_ESTADO: Record<string, CeldaBadge> = {
  emitida: { estado: 'ok', label: 'Emitida' },
  generado: { estado: 'info', label: 'Generado' },
  pendiente: { estado: 'porVencer', label: 'Pendiente' },
  error: { estado: 'mora', label: 'Error' },
}

const BADGE_TIPO: Record<string, CeldaBadge> = {
  'Factura A': { estado: 'neutro', label: 'Factura A' },
  'Factura B': { estado: 'neutro', label: 'Factura B' },
  Recibo: { estado: 'neutro', label: 'Recibo' },
}

interface Fila {
  id: string
  fecha_emision: string
  tipo: CeldaBadge
  numero_formateado: React.ReactNode
  receptor: string
  monto: string
  estado: CeldaBadge
}

const COLUMNAS: ColumnDef<Fila>[] = [
  { key: 'fecha_emision', label: 'Fecha', format: 'date', width: 100 },
  { key: 'tipo', label: 'Tipo', format: 'badge', width: 110 },
  { key: 'numero_formateado', label: 'Número', width: 200 },
  { key: 'receptor', label: 'Receptor' },
  // Los importes van como texto y no con `format: 'money'` a propósito: `Money`
  // redondea a peso entero —decisión del sistema de diseño, correcta en
  // pantalla— y un comprobante es un documento fiscal cuyo importe es exacto.
  { key: 'monto', label: 'Monto', align: 'right', width: 130 },
  { key: 'estado', label: 'Estado', format: 'badge', width: 110 },
]

export default async function ComprobantesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const rol = await rolActual()

  if (!rol || !VE_LA_LISTA.includes(rol)) {
    return (
      <main className="p-6">
        <p className="rounded-md bg-panel px-4 py-3 text-[12px] text-muted">
          Esta pantalla es de administración, operación y finanzas.
        </p>
      </main>
    )
  }

  let query = supabase.from('v_comprobante').select('*').order('fecha_emision', { ascending: false })

  // Los filtros se aplican en la consulta, no sobre el resultado: filtrar en el
  // front traería todo para descartar la mayor parte.
  const { tipo, punto, estado, periodo, q } = params

  if (tipo === 'facturas') query = query.eq('es_factura', true)
  if (tipo === 'recibos') query = query.eq('es_factura', false)
  if (tipo === 'A') query = query.eq('letra', 'A')
  if (tipo === 'B') query = query.eq('letra', 'B')
  if (punto) query = query.eq('punto_venta', Number(punto))
  if (estado) query = query.eq('estado', estado)
  if (periodo) query = query.eq('periodo', periodo)
  if (q) {
    const t = q.replace(/[%,()]/g, '')
    query = query.or(
      `receptor_nombre.ilike.%${t}%,numero_formateado.ilike.%${t}%,cae.ilike.%${t}%`,
    )
  }

  const [{ data: filas, error }, { data: kpi }, { data: opciones }] = await Promise.all([
    query,
    supabase.from('v_comprobante_kpi').select('*').single(),
    supabase.from('v_comprobante').select('punto_venta, periodo'),
  ])

  const hayComprobantes = (kpi?.total ?? 0) > 0

  // Las opciones de los selects salen de los datos: ofrecer un punto o un mes
  // que no existe da un filtro que devuelve vacío y parece un error.
  const puntos = [...new Set((opciones ?? []).map((o) => o.punto_venta))].sort((a, b) => a! - b!)
  const periodos = [...new Set((opciones ?? []).map((o) => o.periodo))].sort().reverse()

  const filtros: FiltroUrl[] = [
    {
      parametro: 'tipo',
      label: 'Tipo',
      todos: 'Todos',
      opciones: [
        { valor: 'facturas', label: 'Facturas' },
        { valor: 'recibos', label: 'Recibos' },
        { valor: 'A', label: 'Solo A' },
        { valor: 'B', label: 'Solo B' },
      ],
    },
    {
      parametro: 'punto',
      label: 'Punto de venta',
      todos: 'Todos',
      opciones: puntos.map((p) => ({
        valor: String(p),
        label: p === 0 ? 'Recibo interno (0)' : String(p).padStart(4, '0'),
      })),
    },
    {
      parametro: 'estado',
      label: 'Estado',
      todos: 'Todos',
      opciones: [
        { valor: 'emitida', label: 'Emitida' },
        { valor: 'generado', label: 'Generado' },
        { valor: 'pendiente', label: 'Pendiente' },
        { valor: 'error', label: 'Error' },
      ],
    },
    {
      parametro: 'periodo',
      label: 'Período',
      todos: 'Todos',
      opciones: (periodos as string[]).map((p) => ({ valor: p, label: p })),
    },
  ]

  const rows: Fila[] = (filas ?? []).map((c: FilaVista) => ({
    id: c.id!,
    fecha_emision: c.fecha_emision!,
    tipo: BADGE_TIPO[c.tipo_label!] ?? { estado: 'neutro', label: c.tipo_label },
    // La marca de sin_origen va pegada al número y no en columna propia: es una
    // excepción rara —hoy una sola fila— y una columna entera casi vacía para
    // señalarla ocuparía más de lo que informa. Va con palabras y no con un
    // símbolo: un asterisco obliga a buscar la referencia, y no hay dónde.
    numero_formateado: c.sin_origen ? (
      <span className="whitespace-nowrap">
        {c.numero_formateado}
        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
          sin origen
        </span>
      </span>
    ) : (
      c.numero_formateado
    ),
    receptor: c.receptor_nombre ?? '—',
    monto: formatMoneyExacto(Number(c.monto)),
    estado: BADGE_ESTADO[c.estado!] ?? { estado: 'neutro', label: c.estado_label },
  }))

  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-[19px] font-extrabold text-ink">Comprobantes</h1>
        <p className="mt-1 text-[12px] text-muted">
          Las facturas emitidas ante ARCA y los recibos internos de cobro, juntos.
        </p>
      </header>

      {hayComprobantes && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard titulo="Comprobantes" valor={kpi!.total} formato="entero" icon="comprobante" />
            <KpiCard
              titulo="Facturas"
              valor={kpi!.facturas}
              formato="entero"
              subtitulo={`${kpi!.recibos} recibo${kpi!.recibos === 1 ? '' : 's'}`}
            />
            <KpiCard
              titulo="Facturado este mes"
              valor={Number(kpi!.facturado_mes)}
              subtitulo="Sólo emitidas · las NC restan"
            />
            <KpiCard
              titulo="Sin cerrar"
              valor={(kpi!.pendientes ?? 0) + (kpi!.con_error ?? 0)}
              formato="entero"
              subtitulo={`${kpi!.pendientes} pendiente(s) · ${kpi!.con_error} con error`}
            />
          </div>

          <FiltrosUrl
            filtros={filtros}
            busqueda={{
              parametro: 'q',
              label: 'Buscar',
              placeholder: 'Receptor, número o CAE',
            }}
          />
        </>
      )}

      {/* Entrega vacía: sin comprobantes no se muestra una tabla vacía con
          filtros arriba —que se lee como que algo se rompió— sino de dónde
          salen. */}
      {!error && !hayComprobantes ? (
        <div className="rounded-md border border-line bg-white px-4 py-12 text-center">
          <p className="text-[13px] font-bold text-ink">Todavía no hay comprobantes</p>
          <p className="mx-auto mt-2 max-w-[58ch] text-[11px] text-muted">
            No se cargan acá: aparecen solos. Un <strong className="font-semibold">recibo</strong>{' '}
            nace al registrar un cobro; una <strong className="font-semibold">factura</strong>, al
            emitirla ante ARCA. Esta pantalla es para encontrarlos y volver a bajarlos.
          </p>
        </div>
      ) : (
        <DataTable
          columns={COLUMNAS}
          rows={rows}
          rowKey="id"
          rowHref={(f) => `/comprobantes/${f.id}`}
          emptyMessage="Ningún comprobante coincide con los filtros."
        />
      )}
    </main>
  )
}
