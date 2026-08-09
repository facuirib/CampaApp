import { createClient } from '@/lib/db/server'
import { formatDate } from '@/lib/format'
import { Badge, DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type Genero = Database['public']['Enums']['genero']
type Concepto = Database['public']['Enums']['concepto_pago']
type Regla = Database['public']['Enums']['regla_vencimiento']
type Plan = Database['public']['Tables']['plan_tarifa']['Row']
type Linea = Database['public']['Tables']['plan_tarifa_linea']['Row']

const GENERO: Record<Genero, string> = {
  masculino: 'Masculino',
  femenino: 'Femenino',
}

const CONCEPTO: Record<Concepto, string> = {
  inscripcion: 'Inscripción',
  partidos: 'Partidos',
}

/**
 * La regla de vencimiento, con su color.
 *
 * `bloque_adelantado` va en ámbar y no en gris a propósito: es la única donde
 * el precio de la fila **no es unitario sino el total del bloque**. Es el dato
 * que más se puede malinterpretar de toda la pantalla —$2.300.000 leído como
 * precio por fecha en vez de por cinco— así que el color pide mirar dos veces,
 * y la observación de abajo lo termina de explicar.
 */
const REGLAS: Record<Regla, CeldaBadge> = {
  fecha_fija: { estado: 'neutro', label: 'Fecha fija' },
  por_partido: { estado: 'info', label: 'Por partido' },
  bloque_adelantado: { estado: 'porVencer', label: 'Bloque adelantado' },
}

/**
 * Cuándo vence o qué cubre una línea, según su regla.
 *
 * Las tres reglas usan columnas distintas y ninguna las usa todas: `fecha_fija`
 * tiene `fecha_referencia`; las de partido, el rango `fecha_desde`–`fecha_hasta`.
 * Sin esto la columna "Regla" dice el mecanismo pero no el cuándo, que es lo
 * que el operador necesita para explicarle a un equipo qué está pagando.
 */
function venceOCubre(linea: Linea): string {
  if (linea.fecha_referencia) return formatDate(linea.fecha_referencia)

  const { fecha_desde: desde, fecha_hasta: hasta } = linea
  if (desde != null && hasta != null) {
    return desde === hasta ? `Fecha ${desde}` : `Fechas ${desde}–${hasta}`
  }
  if (linea.es_playoff) return 'Al clasificar'

  return '—'
}

interface FilaTarifa {
  id: string
  opcion: string
  concepto: React.ReactNode
  cuando: string
  precio_efectivo: number | null
  precio_transferencia: number | null
  regla: CeldaBadge
  cantidad: string
}

const COLUMNAS: ColumnDef<FilaTarifa>[] = [
  { key: 'opcion', label: 'Opción', width: 140 },
  { key: 'concepto', label: 'Concepto' },
  { key: 'cuando', label: 'Vence / cubre', width: 128 },
  // Los dos precios contiguos: es la comparación que se hace todo el tiempo.
  { key: 'precio_efectivo', label: 'Efectivo', format: 'money', width: 132 },
  { key: 'precio_transferencia', label: 'Transferencia', format: 'money', width: 132 },
  { key: 'regla', label: 'Regla', format: 'badge', width: 150 },
  { key: 'cantidad', label: 'Cant.', align: 'right', width: 64 },
]

/** Los cuatro bloques, en el orden en que se los mira. */
const BLOQUES: { genero: Genero; concepto: Concepto }[] = [
  { genero: 'masculino', concepto: 'inscripcion' },
  { genero: 'masculino', concepto: 'partidos' },
  { genero: 'femenino', concepto: 'inscripcion' },
  { genero: 'femenino', concepto: 'partidos' },
]

export default async function TarifarioPage() {
  const supabase = await createClient()

  const [planesRes, lineasRes] = await Promise.all([
    supabase
      .from('plan_tarifa')
      .select('*, torneo(nombre)')
      .eq('activo', true)
      .order('genero')
      .order('concepto')
      .order('opcion_orden'),
    supabase.from('plan_tarifa_linea').select('*').order('linea_orden'),
  ])

  const error = planesRes.error ?? lineasRes.error
  const planes = planesRes.data ?? []
  const lineas = lineasRes.data ?? []

  // Un tarifario es de UN torneo. Decir "del torneo" sin nombrarlo se vuelve
  // ambiguo apenas hay dos cargados, y ya hay dos.
  const torneo = planes[0]?.torneo?.nombre ?? null

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Tarifario</h1>
        <p className="mt-1 text-[12px] text-muted">
          {torneo ? `${torneo} — precios` : 'Precios'} por género y concepto. Cada equipo elige una
          opción de inscripción y una de partidos al armar su ficha.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && planes.length === 0 && (
        <div className="rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted">
          No hay tarifas cargadas todavía.
        </div>
      )}

      {BLOQUES.map(({ genero, concepto }) => {
        // Filtro sobre lo ya traído: los cuatro bloques son la misma consulta
        // repartida, no cuatro consultas.
        const susPlanes = planes.filter((p: Plan) => p.genero === genero && p.concepto === concepto)
        if (susPlanes.length === 0) return null

        const ids = new Set(susPlanes.map((p) => p.id))
        const nombrePlan = new Map(susPlanes.map((p) => [p.id, p.opcion_nombre]))
        const ordenPlan = new Map(susPlanes.map((p) => [p.id, p.opcion_orden]))

        // Las líneas vienen ordenadas por `linea_orden`, que es el orden DENTRO
        // de un plan. Sin reordenar por plan, las dos opciones quedan
        // intercaladas —Pago único, Cuotas, Pago único…— y no se puede seguir
        // ninguna de las dos: hay que leer el plan completo de arriba abajo.
        const suyas = lineas
          .filter((l: Linea) => ids.has(l.plan_tarifa_id))
          .sort(
            (a, b) =>
              (ordenPlan.get(a.plan_tarifa_id) ?? 0) - (ordenPlan.get(b.plan_tarifa_id) ?? 0) ||
              a.linea_orden - b.linea_orden,
          )

        const filas: FilaTarifa[] = suyas.map((l: Linea) => ({
          id: l.id,
          opcion: nombrePlan.get(l.plan_tarifa_id) ?? '—',
          // El playoff va PEGADO al concepto y no en una columna propia: son 2
          // de 22 líneas, y una columna dejaría veinte celdas vacías para
          // marcar dos. Mismo criterio que el "Anulado" del libro diario.
          concepto: l.es_playoff ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {l.concepto_label}
              <Badge estado="info">Playoff</Badge>
            </span>
          ) : (
            l.concepto_label
          ),
          cuando: venceOCubre(l),
          precio_efectivo: l.precio_efectivo,
          precio_transferencia: l.precio_transferencia,
          regla: REGLAS[l.regla] ?? { estado: 'neutro', label: l.regla },
          cantidad: l.cantidad_esperada != null ? String(l.cantidad_esperada) : '',
        }))

        // La letra chica: son textos largos en pocas líneas, así que van debajo
        // y no en una columna que quedaría vacía en la mayoría de las filas.
        const observaciones = suyas.filter((l) => l.observacion)

        return (
          <section key={`${genero}-${concepto}`} className="mb-8">
            <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
              {CONCEPTO[concepto]} · {GENERO[genero]}
            </h2>
            <p className="mb-3 text-[11px] text-muted">
              {susPlanes.map((p) => p.opcion_nombre).join(' o ')}
            </p>

            {/* Sin fila de total: sumar las líneas de dos opciones alternativas
                daría la suma de dos caminos que se excluyen —nadie paga las dos—
                y ninguna vista ofrece el subtotal por plan. */}
            <DataTable
              columns={COLUMNAS}
              rows={filas}
              rowKey="id"
              emptyMessage="Este plan no tiene líneas cargadas."
            />

            {observaciones.length > 0 && (
              <ul className="mt-2 space-y-1">
                {observaciones.map((l) => (
                  <li key={l.id} className="text-[10.5px] leading-snug text-muted">
                    <span className="font-bold text-ink">{l.concepto_label}:</span> {l.observacion}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
