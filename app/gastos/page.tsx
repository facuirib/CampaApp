import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { formatDate } from '@/lib/format'
import { MESES_LARGO } from '@/lib/domain/pl'
import { areaLabel, estadoGasto, naturalezaLabel, NATURALEZAS } from '@/lib/domain/gasto'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import {
  BarrasComposicion,
  Button,
  DataTable,
  KpiCard,
  type CeldaBadge,
  type ColumnDef,
  type ItemComposicion,
} from '@/components/ui'
import TarjetasNaturaleza, { type TotalNaturaleza } from './TarjetasNaturaleza'
import { hrefGastos, rangoPeriodo, type ParamsGastos } from './filtros'
import type { Database } from '@/lib/db/database.types'

type GastoRow = Database['public']['Views']['v_gasto_detalle']['Row']

/**
 * Los gastos, por naturaleza.
 *
 * Toda la pantalla es LECTURA. Las dos escrituras del módulo —registrar y
 * pagar— viven en `/gastos/nuevo` y `/gastos/[id]/pagar`, que son de otro
 * carril; de acá salen dos links hacia ellas y nada más.
 *
 * Ningún total se calcula acá: las tarjetas salen de `v_gasto_naturaleza_mes`,
 * los KpiCards de `v_gasto_kpi` —que trae la fila del año y la de cada mes, y
 * la pantalla ELIGE la que corresponde en vez de sumar— y los gráficos de sus
 * propias vistas.
 */

interface FilaGasto {
  gasto_id: string
  concepto: string | null
  categoria: string | null
  area: string
  naturaleza: string
  cuando: string
  total: number | null
  pago: string
  estado: CeldaBadge
}

const COLUMNAS: ColumnDef<FilaGasto>[] = [
  { key: 'concepto', label: 'Concepto' },
  { key: 'categoria', label: 'Categoría', width: 150 },
  { key: 'naturaleza', label: 'Tipo', width: 92 },
  { key: 'area', label: 'Área', width: 108 },
  // «Cuándo» y no «Devengado»: para un gasto por fecha lo que ubica es la
  // jornada —«Fecha 1 · 01/08»—, no el día en que se cargó. La columna dice
  // una cosa u otra según la naturaleza del gasto.
  { key: 'cuando', label: 'Cuándo', width: 132 },
  { key: 'total', label: 'Total', format: 'money', width: 128 },
  { key: 'pago', label: 'Pago', width: 190 },
  { key: 'estado', label: 'Estado', format: 'badge', width: 96 },
]

/** «Fecha 1 · 01/08/2026» para los por fecha; la de devengo para el resto. */
function cuando(g: GastoRow): string {
  if (g.jornada_numero != null) {
    return `Fecha ${g.jornada_numero} · ${formatDate(g.jornada_fecha)}`
  }
  return formatDate(g.devengado_at)
}

/** Quién pagó y de dónde salió, en una línea. Vacío si todavía no se pagó. */
function pago(g: GastoRow): string {
  if (g.estado !== 'pagado') return '—'

  const caja = g.caja_pago === 'CAJA_EFECTIVO' ? 'Efectivo' : 'Transferencia'
  const donde = g.predio_pago ? ` (${g.predio_pago})` : ''
  // El email completo no entra en la columna: alcanza con la parte de antes
  // de la arroba, que es como se nombran entre ellos.
  const quien = g.pagado_por ? g.pagado_por.split('@')[0] : 'sin responsable'

  return `${caja}${donde} · ${quien}`
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<ParamsGastos>
}) {
  const params = await searchParams
  const { naturaleza } = params
  // El toggle: cuando está prendido, la tabla deja de mirar el período. Es la
  // lista de trabajo -«qué falta pagar»- y ahí un impago de julio importa
  // tanto como uno de agosto.
  const soloImpagos = params.impagos === '1'
  const supabase = await createClient()

  // Los años primero: el resto de las consultas dependen de cuál.
  const aniosRes = await supabase
    .from('v_gasto_kpi')
    .select('anio')
    .is('mes', null)
    .order('anio', { ascending: false })

  const anios = [...new Set((aniosRes.data ?? []).map((a) => a.anio))].filter(
    (a): a is number => a != null,
  )
  const anio = params.anio ? Number(params.anio) : (anios[0] ?? new Date().getFullYear())
  const mes = params.mes ? Number(params.mes) : null

  const [kpiRes, natRes, catRes, gastosRes] = await Promise.all([
    // `mes is null` es la fila del año entero. Se ELIGE la fila; no se suma.
    (() => {
      const q = supabase.from('v_gasto_kpi').select('*').eq('anio', anio)
      return mes == null ? q.is('mes', null).maybeSingle() : q.eq('mes', mes).maybeSingle()
    })(),
    (() => {
      const q = supabase.from('v_gasto_naturaleza_mes').select('*').eq('anio', anio)
      return mes == null ? q : q.eq('mes', mes)
    })(),
    (() => {
      const q = supabase.from('v_gasto_categoria_mes').select('*').eq('anio', anio)
      return mes == null ? q : q.eq('mes', mes)
    })(),
    // ── La tabla ───────────────────────────────────────────────────────
    // Por defecto acompaña al período, igual que los KpiCards, las tarjetas y
    // los gráficos: si el filtro dice agosto, la tabla muestra agosto. Que una
    // parte de la pantalla ignorara el filtro que el usuario acaba de mover
    // era justamente lo confuso.
    //
    // Con el toggle prendido, en cambio, se ignora el período a propósito y se
    // traen TODOS los impagos: un gasto viejo sin pagar no puede esconderse
    // detrás de un filtro de mes.
    (() => {
      const q = supabase
        .from('v_gasto_detalle')
        .select('*')
        .order('devengado_at', { ascending: false })

      if (soloImpagos) return q.eq('estado', 'devengado')

      const [desde, hasta] = rangoPeriodo(anio, mes)
      return q.gte('devengado_at', desde).lt('devengado_at', hasta)
    })(),
  ])

  const error = aniosRes.error ?? kpiRes.error ?? natRes.error ?? catRes.error ?? gastosRes.error
  const kpi = kpiRes.data

  // ── Las tarjetas ─────────────────────────────────────────────────────────
  // `v_gasto_naturaleza_mes` viene por mes; sin filtro de mes hay que juntar
  // los meses del año. Es la única agregación de la pantalla y es sobre filas
  // que ya vienen totalizadas por la vista — no recorre gastos.
  const porNaturaleza = new Map<string, TotalNaturaleza>()
  for (const n of natRes.data ?? []) {
    if (!n.naturaleza) continue
    const a = porNaturaleza.get(n.naturaleza) ?? {
      naturaleza: n.naturaleza,
      total: 0,
      pagado: 0,
      adeudado: 0,
      gastos: 0,
    }
    a.total += Number(n.total ?? 0)
    a.pagado += Number(n.pagado ?? 0)
    a.adeudado += Number(n.adeudado ?? 0)
    a.gastos += Number(n.gastos ?? 0)
    porNaturaleza.set(n.naturaleza, a)
  }
  const totalesNaturaleza = [...porNaturaleza.values()]

  // ── Los gráficos ─────────────────────────────────────────────────────────
  const graficoNaturaleza: ItemComposicion[] = NATURALEZAS.map((nat) => {
    const t = porNaturaleza.get(nat.valor)
    return { label: nat.label, valor: t?.total ?? 0, parte: t?.pagado ?? 0 }
  })
    .filter((i) => i.valor > 0)
    .sort((a, b) => b.valor - a.valor)

  const porCategoria = new Map<string, ItemComposicion>()
  for (const c of catRes.data ?? []) {
    if (!c.categoria) continue
    const a = porCategoria.get(c.categoria) ?? {
      label: c.categoria,
      valor: 0,
      parte: 0,
      nota: naturalezaLabel(c.naturaleza),
    }
    a.valor += Number(c.total ?? 0)
    a.parte = (a.parte ?? 0) + Number(c.pagado ?? 0)
    porCategoria.set(c.categoria, a)
  }
  const graficoCategoria = [...porCategoria.values()].sort((a, b) => b.valor - a.valor)

  // ── La lista ─────────────────────────────────────────────────────────────
  // El período y el estado ya vinieron filtrados por la consulta; acá sólo
  // queda la naturaleza, que se combina con los dos: «sólo impagos» + «por
  // fecha» son los impagos por fecha de cualquier mes.
  const gastosRaw = (gastosRes.data ?? []) as GastoRow[]
  const filtrados = naturaleza ? gastosRaw.filter((g) => g.naturaleza === naturaleza) : gastosRaw

  const filas: FilaGasto[] = filtrados.map((g) => ({
    gasto_id: g.gasto_id!,
    concepto: g.concepto,
    categoria: g.categoria,
    area: areaLabel(g.area),
    naturaleza: naturalezaLabel(g.naturaleza),
    cuando: cuando(g),
    total: g.total,
    pago: pago(g),
    estado: estadoGasto(g.estado),
  }))

  const FILTROS: FiltroUrl[] = [
    {
      parametro: 'anio',
      label: 'Año',
      todos: 'Año…',
      valorPorDefecto: String(anio),
      opciones: anios.map((a) => ({ valor: String(a), label: String(a) })),
    },
    {
      parametro: 'mes',
      label: 'Mes',
      todos: 'Todo el año',
      opciones: MESES_LARGO.map((m, i) => ({
        valor: String(i + 1),
        label: m[0].toUpperCase() + m.slice(1),
      })),
    },
  ]

  const adeudado = Number(kpi?.adeudado ?? 0)
  const natActiva = NATURALEZAS.find((n) => n.valor === naturaleza)

  return (
    <div className="pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Gastos</h1>
          <p className="mt-1 text-[12px] text-muted">
            Del torneo y de la estructura. Se cuentan al{' '}
            <strong className="font-semibold text-ink">cargarlos</strong> —devengado—, se hayan
            pagado o no; por eso el total no es lo que salió de caja.
          </p>
        </div>
        {/* La pantalla de alta existía y no la enlazaba nada: sólo se llegaba
            escribiendo la URL. Es de otro carril, así que de acá sale un link
            y nada más. */}
        <Link href="/gastos/nuevo">
          <Button icon="plus">Registrar gasto</Button>
        </Link>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      <FiltrosUrl filtros={FILTROS} />

      <div className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        <KpiCard
          tono="neutro"
          titulo="Total del período"
          valor={Number(kpi?.total ?? 0)}
          icon="comprobante"
          subtitulo={`${kpi?.gastos ?? 0} ${kpi?.gastos === 1 ? 'gasto' : 'gastos'} · sin anulados`}
        />
        <KpiCard
          tono="positivo"
          titulo="Pagado"
          valor={Number(kpi?.pagado ?? 0)}
          icon="check"
          subtitulo="Ya salió de caja"
        />
        <KpiCard
          tono={adeudado > 0 ? 'alerta' : 'positivo'}
          titulo="Adeudado"
          valor={adeudado}
          icon="alerta"
          subtitulo={
            adeudado > 0 ? `${kpi?.gastos_impagos ?? 0} sin pagar` : 'No queda nada sin pagar'
          }
        />
      </div>

      <TarjetasNaturaleza
        totales={totalesNaturaleza}
        activa={naturaleza ?? null}
        params={{ ...params, anio: String(anio) }}
      />

      {(graficoNaturaleza.length > 0 || graficoCategoria.length > 0) && (
        <div className="mb-7 grid gap-3 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[.08em] text-muted">
              Por tipo de gasto
            </h2>
            <BarrasComposicion
              items={graficoNaturaleza}
              etiquetaParte="ya pagado"
              titulo="Gasto por naturaleza"
            />
          </div>
          <div>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[.08em] text-muted">
              Por categoría
            </h2>
            <BarrasComposicion
              items={graficoCategoria}
              tope={7}
              etiquetaParte="ya pagado"
              titulo="Gasto por categoría"
            />
          </div>
        </div>
      )}

      {/* ── El encabezado de la tabla ──────────────────────────────────────
          El título dice las TRES cosas que definen qué se está viendo —el
          estado, la naturaleza y el período— porque las tres se combinan y
          ninguna se deduce de las otras. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[13px] font-extrabold tracking-[-.2px] text-ink">
          {soloImpagos ? 'Impagos' : 'Gastos'}
          {natActiva && ` · ${natActiva.label}`}
          {!soloImpagos && ` · ${mes == null ? anio : `${MESES_LARGO[mes - 1]} ${anio}`}`}
        </h2>

        {/* El toggle es un Link y no un checkbox: el estado vive en la URL,
            así que «los impagos por fecha» es una dirección que se puede
            mandar por WhatsApp y el botón atrás vuelve a lo anterior. */}
        <Link
          href={hrefGastos(params, { impagos: soloImpagos ? null : '1' })}
          aria-pressed={soloImpagos}
          className={[
            'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-[11px] font-bold transition-colors',
            soloImpagos
              ? 'border-warn bg-warnbg text-warntx'
              : 'border-line bg-white text-muted hover:border-regale hover:text-ink',
          ].join(' ')}
        >
          {soloImpagos ? '✓ ' : ''}Ver sólo impagos
        </Link>
      </div>

      {/* Que la tabla deje de seguir al período es lo bastante inesperado como
          para decirlo donde se está mirando, no en una nota al pie. */}
      {soloImpagos && (
        <p className="mb-2 rounded-md bg-warnbg px-4 py-2.5 text-[11px] text-warntx">
          <strong className="font-bold">Se está ignorando el filtro de período.</strong> La tabla
          muestra los {filas.length} gastos impagos
          {natActiva ? ` de tipo ${natActiva.label.toLowerCase()}` : ''} de cualquier mes — un gasto
          viejo sin pagar no tiene que esconderse detrás de un filtro. Los indicadores y los
          gráficos de arriba sí siguen{' '}
          {mes == null ? `todo ${anio}` : `${MESES_LARGO[mes - 1]} de ${anio}`}.
        </p>
      )}

      <DataTable
        columns={COLUMNAS}
        rows={filas}
        rowKey="gasto_id"
        rowHref={(f) => `/gastos/${f.gasto_id}/pagar`}
        maxHeight={560}
        emptyMessage={
          soloImpagos
            ? 'No queda ningún gasto sin pagar.'
            : naturaleza
              ? 'Ningún gasto de este tipo en el período.'
              : 'No hay gastos cargados en el período.'
        }
      />
    </div>
  )
}
