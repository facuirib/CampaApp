import { createClient } from '@/lib/db/server'
import { clavePeriodo, formatPeriodo, rotuloOrigen } from '@/lib/domain/asiento'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { Autor } from '@/components/ui'
import { Badge, DataTable, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaDiario = Database['public']['Views']['v_libro_diario']['Row']

interface FilaAsiento {
  asiento_id: string
  fecha: string | null
  /** Texto y, si está anulado, su badge: van juntos en la misma celda. */
  descripcion: React.ReactNode
  origen: string
  periodo: string
  torneo: string | null
  total_debe: number | null
  total_haber: number | null
  /** Quién lo asentó. La trazabilidad estaba en la base y no en la pantalla. */
  autor: React.ReactNode
}

const COLUMNAS: ColumnDef<FilaAsiento>[] = [
  { key: 'fecha', label: 'Fecha', format: 'date', width: 104 },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'origen', label: 'Origen', width: 148 },
  { key: 'periodo', label: 'Período', width: 84 },
  { key: 'torneo', label: 'Torneo', width: 120 },
  { key: 'total_debe', label: 'Debe', format: 'money', width: 128 },
  { key: 'total_haber', label: 'Haber', format: 'money', width: 128 },
  { key: 'autor', label: 'Quién', width: 132 },
]

/**
 * El libro diario, como pestaña de Auditoría.
 *
 * Vivía en /movimientos, un módulo propio. Contesta la misma pregunta que
 * Auditoría desde otro ángulo —quién tocó qué— y separados obligaban a mirar en
 * dos lados y cruzar a mano para saber si alguien anduvo en algo.
 *
 * Recibe los params ya resueltos: la pestaña la decide la página, no este
 * componente.
 */
export default async function LibroDiario({
  params,
  pestanas,
}: {
  params: { origen?: string; periodo?: string; usuario?: string }
  pestanas: React.ReactNode
}) {
  const { origen, periodo, usuario } = params
  const supabase = await createClient()

  // Las opciones del filtro salen de los datos, no de una lista escrita a mano:
  // así un origen que aparezca mañana se ofrece solo, y uno que nunca se usó no
  // ensucia el desplegable con una opción que no devuelve nada.
  const [opcionesRes, usuariosRes] = await Promise.all([
    supabase.from('v_libro_diario').select('origen, anio, mes'),
    // Quién asentó. `asiento.created_by` existía desde siempre y la vista no lo
    // exponía: el sistema sabía quién hizo cada cosa y la pantalla no lo decía.
    supabase.from('v_usuario').select('*'),
  ])

  let consulta = supabase
    .from('v_libro_diario')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  // El filtro se aplica EN LA CONSULTA, no sobre las filas ya traídas: la
  // página es servidor y el filtro viaja en la URL, así que lo que llega al
  // navegador es sólo lo que se muestra.
  if (origen) consulta = consulta.eq('origen', origen)
  if (usuario) consulta = consulta.eq('created_by', usuario)
  if (periodo) {
    const [anio, mes] = periodo.split('-')
    consulta = consulta.eq('anio', Number(anio)).eq('mes', Number(mes))
  }

  const asientosRes = await consulta
  const error = asientosRes.error ?? opcionesRes.error ?? usuariosRes.error
  const nombreDe = new Map((usuariosRes.data ?? []).map((u) => [u.id, u.nombre]))

  const origenes = [...new Set((opcionesRes.data ?? []).map((f) => f.origen).filter(Boolean))]
    .map((codigo) => ({ valor: codigo as string, label: rotuloOrigen(codigo) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))

  const periodos = [
    ...new Set((opcionesRes.data ?? []).map((f) => clavePeriodo(f.anio, f.mes)).filter(Boolean)),
  ]
    .sort()
    .reverse()
    .map((clave) => {
      const [anio, mes] = clave.split('-')
      return { valor: clave, label: formatPeriodo(Number(anio), Number(mes)) }
    })

  const FILTROS: FiltroUrl[] = [
    { parametro: 'origen', label: 'Origen', todos: 'Todos los orígenes', opciones: origenes },
    { parametro: 'periodo', label: 'Período', todos: 'Todos los períodos', opciones: periodos },
    {
      parametro: 'usuario',
      label: 'Usuario',
      todos: 'Todos',
      opciones: (usuariosRes.data ?? [])
        .filter((u) => u.id)
        .map((u) => ({ valor: u.id!, label: u.nombre ?? u.email ?? '—' })),
    },
  ]

  const filas: FilaAsiento[] = (asientosRes.data ?? []).map((a: FilaDiario) => ({
    asiento_id: a.asiento_id!,
    fecha: a.fecha,
    // El badge va PEGADO a la descripción y no en una columna propia: una
    // columna de estado dejaría 56 guiones para marcar 2 anulados, y el dato
    // se lee mejor al lado de qué asiento es que en el otro extremo de la fila.
    descripcion: a.anulado ? (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="text-muted line-through">{a.descripcion}</span>
        <Badge estado="neutro">Anulado</Badge>
      </span>
    ) : (
      a.descripcion
    ),
    origen: rotuloOrigen(a.origen),
    periodo: formatPeriodo(a.anio, a.mes),
    torneo: a.torneo,
    autor: <Autor id={a.created_by} nombre={nombreDe.get(a.created_by ?? '')} />,
    total_debe: a.total_debe,
    total_haber: a.total_haber,
  }))

  const hayFiltro = Boolean(origen || periodo)

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Auditoría</h1>
        <p className="mt-1 text-[12px] text-muted">
          Todos los asientos, del más reciente al más viejo. Los anulados se muestran igual: el
          diario es un registro histórico, no una lista de lo vigente.
        </p>
      </header>

      {pestanas}

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      <FiltrosUrl filtros={FILTROS} />

      {/* Sin fila de total: sumar el debe de asientos de distintos orígenes y
          períodos no da un número que signifique nada —no es el saldo de nada—,
          y ninguna vista lo ofrece. */}
      <DataTable
        columns={COLUMNAS}
        rows={filas}
        rowKey="asiento_id"
        rowHref={(f) => `/movimientos/${f.asiento_id}`}
        densidad="compacta"
        maxHeight={600}
        emptyMessage={
          hayFiltro
            ? 'Ningún asiento coincide con el filtro.'
            : 'Todavía no hay movimientos registrados. Los asientos aparecen cuando se registran cobros o gastos.'
        }
      />
    </div>
  )
}
