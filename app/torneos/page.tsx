import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { Button, Card, DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'

interface Fila {
  torneo_id: string | null
  href: string
  nombre: string | null
  temporada: CeldaBadge
  anio: number | null
  estado: CeldaBadge
  periodo: string
  equipos: React.ReactNode
  molde: React.ReactNode
  estructura: CeldaBadge
}

const TEMPORADA: Record<string, CeldaBadge> = {
  apertura: { estado: 'info', label: 'Apertura' },
  clausura: { estado: 'neutro', label: 'Clausura' },
}

/**
 * El estado del torneo, con su color.
 *
 * `planificado` va en ámbar y no en gris porque no es un estado de reposo: es
 * un torneo que todavía no arrancó y que alguien tiene que poner en curso. El
 * gris diría "así está bien".
 */
function estadoABadge(estado: string | null, activo: boolean | null): CeldaBadge {
  if (activo === false) return { estado: 'vencido', label: 'Dado de baja' }
  if (estado === 'en_curso') return { estado: 'ok', label: 'En curso' }
  if (estado === 'cerrado') return { estado: 'neutro', label: 'Cerrado' }
  if (estado === 'planificado') return { estado: 'porVencer', label: 'Planificado' }
  return { estado: 'neutro', label: estado ?? '—' }
}

/**
 * Si el torneo puede recibir una ficha.
 *
 * `crear_equipo_torneo` necesita una serie y un plan de tarifa: sin eso, el
 * torneo existe pero no se puede inscribir a nadie. La vista ya lo resuelve en
 * `tiene_estructura`; acá solo se le pone color, para que el operador lo vea en
 * la lista y no al intentar cargar el primer equipo.
 */
function estructuraABadge(tiene: boolean | null): CeldaBadge {
  return tiene
    ? { estado: 'ok', label: 'Lista' }
    : { estado: 'porVencer', label: 'Falta cargar' }
}

/** El período del torneo. Las dos fechas son opcionales, y suelen faltar. */
function periodoDeTorneo(desde: string | null, hasta: string | null): string {
  if (!desde && !hasta) return '—'
  const fmt = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString('es-AR')
  if (desde && hasta) return `${fmt(desde)} – ${fmt(hasta)}`
  return desde ? `desde ${fmt(desde)}` : `hasta ${fmt(hasta!)}`
}

const COLUMNAS: ColumnDef<Fila>[] = [
  { key: 'nombre', label: 'Torneo' },
  { key: 'temporada', label: 'Temporada', format: 'badge', width: 108 },
  { key: 'anio', label: 'Año', width: 72 },
  { key: 'periodo', label: 'Período' },
  { key: 'estado', label: 'Estado', format: 'badge', width: 120 },
  { key: 'equipos', label: 'Equipos', width: 96 },
  { key: 'molde', label: 'Estructura' },
  { key: 'estructura', label: '', format: 'badge', width: 116 },
]

export default async function TorneosPage() {
  const supabase = await createClient()
  const rol = await rolActual()
  const puedeCrear = puede(rol, 'torneo.crear')
  // Las dos celdas de la tabla son links a pantallas de edición. El número
  // se muestra igual —es dato—; lo que se cae es el link.
  const puedeFichas = puede(rol, 'torneo.fichas')
  const puedeEstructura = puede(rol, 'torneo.estructura')

  const { data, error } = await supabase
    .from('v_torneo_lista')
    .select('*')
    .order('anio', { ascending: false })
    .order('temporada', { ascending: true })

  const filas: Fila[] = (data ?? []).map((t) => ({
    torneo_id: t.torneo_id,
    href: `/torneos/${t.torneo_id}/estructura`,
    nombre: t.nombre,
    temporada: TEMPORADA[t.temporada ?? ''] ?? { estado: 'neutro', label: t.temporada ?? '—' },
    anio: t.anio,
    periodo: periodoDeTorneo(t.fecha_desde, t.fecha_hasta),
    estado: estadoABadge(t.estado, t.activo),
    // Link a los inscriptos: el número es lo que uno mira antes de querer
    // tocarlos, igual que el molde.
    equipos: puedeFichas ? (
      <Link
        href={`/torneos/${t.torneo_id}/fichas`}
        className="text-blue-600 hover:underline"
      >
        {t.equipos ?? 0}
      </Link>
    ) : (
      (t.equipos ?? 0)
    ),
    // Los tres números del molde en una sola celda: sueltos serían tres
    // columnas de dos dígitos que nadie compara entre filas. Y es link: el
    // número es lo que uno mira antes de querer editarlo.
    molde: puedeEstructura ? (
      <Link
        href={`/torneos/${t.torneo_id}/estructura`}
        className="text-blue-600 hover:underline"
      >
        {t.categorias ?? 0} cat · {t.series ?? 0} series · {t.planes ?? 0} planes
      </Link>
    ) : (
      `${t.categorias ?? 0} cat · ${t.series ?? 0} series · ${t.planes ?? 0} planes`
    ),
    estructura: estructuraABadge(t.tiene_estructura),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Torneos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cada torneo tiene su propia estructura —categorías, series y tarifario— y su
            propia contabilidad. Lo que no cuelga de ninguno es estructura permanente.
          </p>
        </div>
        {puedeCrear && (
          <Link href="/torneos/nuevo">
            <Button icon="plus">Nuevo torneo</Button>
          </Link>
        )}
      </div>

      {error && (
        <Card>
          <p className="text-sm text-red-600">No se pudieron cargar los torneos: {error.message}</p>
        </Card>
      )}

      <Card>
        <DataTable columns={COLUMNAS} rows={filas} rowKey={(f, i) => f.torneo_id ?? i} />
      </Card>
    </div>
  )
}
