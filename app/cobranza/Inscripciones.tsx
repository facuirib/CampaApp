import Link from 'next/link'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { Button, DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type InscripcionRow = Database['public']['Views']['v_inscripcion']['Row']

interface FilaInscripcion {
  equipo_torneo_id: string
  tercero_id: string | null
  equipo: string | null
  serie_completa: string | null
  total_plan: number | null
  progreso: React.ReactNode
  estado: CeldaBadge
  accion: React.ReactNode
}

function estadoInscripcionABadge(estado: string | null, tieneVencida: boolean | null): CeldaBadge {
  if (estado === 'paga') return { estado: 'alDia', label: 'Paga' }
  if (estado === 'parcial') return { estado: 'porVencer', label: 'Parcial' }
  if (estado === 'impaga') {
    return tieneVencida ? { estado: 'vencido', label: 'Impaga' } : { estado: 'info', label: 'Impaga' }
  }
  if (estado === 'sin_cuotas') return { estado: 'neutro', label: 'Sin cuotas' }
  return { estado: 'neutro', label: estado ?? '—' }
}

const COLUMNAS: ColumnDef<FilaInscripcion>[] = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'serie_completa', label: 'Serie' },
  { key: 'total_plan', label: 'Total plan', format: 'money' },
  { key: 'progreso', label: 'Cuotas', width: 160 },
  { key: 'estado', label: 'Estado', format: 'badge', width: 104 },
  { key: 'accion', label: '', width: 92 },
]

/**
 * Las inscripciones, como tercera cara de Cobranza.
 *
 * ── Por qué se mudó acá ───────────────────────────────────────────────────
 *
 * Estaba en /inscripciones, un módulo propio, y era la cuarta pantalla que
 * miraba las mismas cuotas del mismo equipo: cuenta corriente, avisos, colas e
 * inscripciones. La inscripción no es otro dominio — es la PRIMERA cuota, la
 * que decide si el equipo entra al torneo. Cobrarla es cobrar.
 *
 * ── La barra ──────────────────────────────────────────────────────────────
 *
 * «2/5» obliga a hacer la cuenta en la cabeza para 62 filas. La barra la hace
 * a la vista. No es un número nuevo: son `cuotas_pagadas` y
 * `cuotas_inscripcion` de la vista, dibujados.
 */
export default function Inscripciones({
  inscripciones,
  filtros,
  torneoElegido,
}: {
  inscripciones: InscripcionRow[]
  filtros: { serie?: string; estado?: string; torneo?: string }
  torneoElegido: string | null
}) {
  const { serie, estado } = filtros

  const seriesMap = new Map<string, string>()
  const torneosMap = new Map<string, string>()
  for (const i of inscripciones) {
    if (i.serie_id && i.serie_completa) seriesMap.set(i.serie_id, i.serie_completa)
    if (i.torneo_id && i.torneo) torneosMap.set(i.torneo_id, i.torneo)
  }

  const opcionesSerie = [...seriesMap.entries()]
    .map(([valor, label]) => ({ valor, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))

  const opcionesTorneo = [...torneosMap.entries()]
    .map(([valor, label]) => ({ valor, label }))
    .sort((a, b) => b.label.localeCompare(a.label, 'es'))

  const FILTROS: FiltroUrl[] = [
    // El torneo primero: es el corte más grande. Con tres torneos cargados, las
    // 62 fichas de la lista son de todos a la vez y no se puede leer ninguna.
    { parametro: 'torneo', label: 'Torneo', todos: 'Todos los torneos', opciones: opcionesTorneo },
    { parametro: 'serie', label: 'Serie', todos: 'Todas las series', opciones: opcionesSerie },
    {
      parametro: 'estado',
      label: 'Estado',
      todos: 'Todos los estados',
      opciones: [
        { valor: 'paga', label: 'Paga' },
        { valor: 'parcial', label: 'Parcial' },
        { valor: 'impaga', label: 'Impaga' },
        { valor: 'sin_cuotas', label: 'Sin cuotas' },
      ],
    },
  ]

  // El torneo se filtra en la consulta de la página; serie y estado acá, sobre
  // lo ya traído. Contar filas por estado es agrupar para mostrar, no sumar
  // plata — y va sobre el padrón completo del torneo, no sobre lo filtrado:
  // los KPI son la foto, el filtro es para mirar la tabla.
  const filtradas = inscripciones.filter((i) => {
    if (serie && i.serie_id !== serie) return false
    if (estado && i.estado_inscripcion !== estado) return false
    return true
  })

  const pagas = inscripciones.filter((i) => i.estado_inscripcion === 'paga').length
  const parciales = inscripciones.filter((i) => i.estado_inscripcion === 'parcial').length
  const impagas = inscripciones.filter((i) => i.estado_inscripcion === 'impaga').length

  const filas: FilaInscripcion[] = filtradas
    .map((i) => {
      const total = i.cuotas_inscripcion ?? 0
      const pagadas = i.cuotas_pagadas ?? 0
      const pct = total > 0 ? Math.round((pagadas / total) * 100) : 0
      return {
        equipo_torneo_id: i.equipo_torneo_id!,
        tercero_id: i.tercero_id,
        equipo: i.equipo,
        serie_completa: i.serie_completa,
        total_plan: i.total_plan,
        progreso: (
          <div className="flex items-center gap-2">
            <span className="cifra shrink-0 text-[11px] font-semibold text-ink">
              {pagadas}/{total}
            </span>
            <span className="h-1.5 w-full min-w-[56px] overflow-hidden rounded-pill bg-line2">
              <span
                className={`block h-full rounded-pill ${pct === 100 ? 'bg-ok' : 'bg-blue'}`}
                style={{ width: `${pct}%` }}
              />
            </span>
          </div>
        ),
        estado: estadoInscripcionABadge(i.estado_inscripcion, i.tiene_vencida),
        // Cobrar es el MISMO motor de siempre: la pantalla de cobro del equipo,
        // que llama a registrar_cobro. Una inscripción es una cuota como
        // cualquier otra —lo que la distingue es el concepto de su línea de
        // tarifa—, así que no hay función nueva ni circuito paralelo.
        accion:
          i.estado_inscripcion !== 'paga' && i.tercero_id ? (
            <Link href={`/equipos/${i.tercero_id}/cobrar`}>
              <Button size="pill" variant="secondary">
                Cobrar
              </Button>
            </Link>
          ) : null,
      }
    })
    .sort((a, b) => (a.equipo ?? '').localeCompare(b.equipo ?? '', 'es'))

  return (
    <>
      <div className="mb-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <KpiCard
          tono="positivo"
          titulo="Pagas"
          valor={pagas}
          formato="entero"
          subtitulo={`de ${inscripciones.length} fichas`}
        />
        <KpiCard tono="info" titulo="Parciales" valor={parciales} formato="entero" />
        <KpiCard tono="alerta" titulo="Impagas" valor={impagas} formato="entero" />
      </div>

      <FiltrosUrl filtros={FILTROS} />

      <DataTable
        columns={COLUMNAS}
        rows={filas}
        rowKey="equipo_torneo_id"
        maxHeight={620}
        emptyMessage={
          torneoElegido
            ? 'Ninguna inscripción con esos filtros.'
            : 'Todavía no hay fichas cargadas.'
        }
      />
    </>
  )
}
