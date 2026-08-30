import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type ReclamoRow = Database['public']['Tables']['reclamo']['Row']

const CANALES: Record<string, CeldaBadge> = {
  mail: { estado: 'info', label: 'Mail' },
  whatsapp: { estado: 'ok', label: 'WhatsApp' },
  manual: { estado: 'neutro', label: 'Manual' },
}

function badgeCanal(canal: string | null): CeldaBadge {
  return CANALES[canal ?? ''] ?? { estado: 'neutro', label: canal ?? '—' }
}

interface FilaHistorial {
  id: string
  fecha: string | null
  equipo: string
  canal: CeldaBadge
  etapa: CeldaBadge
  monto_reclamado: number | null
  cuotas: number | null
  responsable: string
  destino: string | null
}

/**
 * La etapa del aviso.
 *
 * `null` en los reclamos anteriores a las etapas: no se puede saber cuál les
 * correspondía, así que se muestran como «—» en vez de inventarles una.
 */
const ETAPAS: Record<string, CeldaBadge> = {
  por_vencer: { estado: 'info', label: 'Por vencer' },
  recordatorio: { estado: 'porVencer', label: 'Recordatorio' },
  firme: { estado: 'mora', label: 'Firme' },
}

function badgeEtapa(etapa: string | null): CeldaBadge {
  return ETAPAS[etapa ?? ''] ?? { estado: 'neutro', label: '—' }
}

const COLUMNAS: ColumnDef<FilaHistorial>[] = [
  { key: 'fecha', label: 'Fecha', format: 'date', width: 106 },
  { key: 'equipo', label: 'Equipo' },
  { key: 'etapa', label: 'Etapa', format: 'badge', width: 122 },
  { key: 'canal', label: 'Canal', format: 'badge', width: 106 },
  { key: 'monto_reclamado', label: 'Monto', format: 'money', width: 138 },
  { key: 'cuotas', label: 'Cuotas', align: 'right', width: 74 },
  { key: 'responsable', label: 'Reclamó', width: 150 },
  { key: 'destino', label: 'Destino' },
]

export default async function HistorialReclamosPage({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string; responsable?: string }>
}) {
  const { canal, responsable } = await searchParams
  const supabase = await createClient()

  let consulta = supabase
    .from('reclamo')
    .select('*, tercero(nombre)')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  // El filtro va EN LA CONSULTA, no sobre las filas ya traídas.
  if (canal) consulta = consulta.eq('canal', canal)
  if (responsable) consulta = consulta.eq('created_by', responsable)

  const [reclamosRes, conteoRes, opcionesRes] = await Promise.all([
    consulta,
    // El total lo cuenta la base con `head: true`: medir el largo del array
    // daría el límite, no el total.
    supabase.from('reclamo').select('*', { count: 'exact', head: true }),
    supabase.from('reclamo').select('canal, created_by'),
  ])

  const error = reclamosRes.error ?? conteoRes.error ?? opcionesRes.error

  // Los emails de quienes reclamaron. `auth.users` no se puede leer desde el
  // navegador, pero esto es Server Component: la consulta corre en el servidor.
  const ids = [...new Set((opcionesRes.data ?? []).map((r) => r.created_by).filter(Boolean))]

  const canales = [...new Set((opcionesRes.data ?? []).map((r) => r.canal).filter(Boolean))]
    .sort()
    .map((c) => ({ valor: c as string, label: badgeCanal(c).label as string }))

  const responsables = ids.map((id) => ({ valor: id as string, label: (id as string).slice(0, 8) }))

  const FILTROS: FiltroUrl[] = [
    { parametro: 'canal', label: 'Canal', todos: 'Todos los canales', opciones: canales },
    { parametro: 'responsable', label: 'Reclamó', todos: 'Cualquiera', opciones: responsables },
  ]

  const filas: FilaHistorial[] = (reclamosRes.data ?? []).map((r) => {
    const fila = r as ReclamoRow & { tercero: { nombre: string } | null }
    return {
      id: fila.id,
      fecha: fila.fecha,
      equipo: fila.tercero?.nombre ?? '—',
      canal: badgeCanal(fila.canal),
      etapa: badgeEtapa(fila.etapa),
      monto_reclamado: fila.monto_reclamado,
      cuotas: fila.cuotas,
      responsable: fila.created_by.slice(0, 8),
      destino: fila.destino,
    }
  })

  const hayFiltro = Boolean(canal || responsable)

  return (
    <div className="pb-10">
      <Link href="/cobranza" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a cobranza
      </Link>

      <header className="mb-4 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Historial de reclamos</h1>
        <p className="mt-1 text-[12px] text-muted">
          Todo lo que se reclamó, por quién y por qué canal. Un reclamo no se edita ni se borra.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <KpiCard
          tono="info"
          titulo="Reclamos registrados"
          valor={conteoRes.count ?? 0}
          formato="entero"
          icon="documento"
          subtitulo={hayFiltro ? `${filas.length} con el filtro puesto` : 'Desde el primero'}
        />
      </div>

      <FiltrosUrl filtros={FILTROS} />

      {/* Sin fila de total: sumar montos reclamados contaría dos veces al
          equipo al que se le reclamó tres veces la misma deuda. El número que
          significa algo es la deuda vigente, y está en /cobranza. */}
      <DataTable
        columns={COLUMNAS}
        rows={filas}
        rowKey="id"
        densidad="compacta"
        maxHeight={600}
        emptyMessage={
          hayFiltro
            ? 'Ningún reclamo coincide con el filtro.'
            : 'Todavía no se registró ningún reclamo.'
        }
      />
    </div>
  )
}
