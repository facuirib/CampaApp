import Link from 'next/link'
import { formatMoney } from '@/lib/format'
import { DataTable, KpiCard, type CeldaBadge, type ColumnDef, type EstadoBadge } from '@/components/ui'

/**
 * Presupuesto contra gasto real.
 *
 * Todo sale de tres vistas y el front no suma nada (regla 1):
 * `v_presupuesto_vs_real_kpi` los totales por tramo y estado,
 * `v_presupuesto_vs_real` el detalle mensual, y `v_presupuesto_vs_real_anual`
 * el acumulado del ejercicio.
 *
 * **No hay un total único, y es a propósito.** Sumar los cuatro estados crudos
 * da −$126.500.000, que se lee como «ahorramos 126 millones» y son los meses
 * que todavía no pasaron. Cada estado responde una pregunta distinta.
 */

export interface FilaKpi {
  tramo: string
  estado: string
  filas: number
  categorias: number
  presupuestado: number
  real: number
  desvio: number
}

export interface FilaMes {
  mes: string
  categoria: string
  ambito: string
  es_estructura: boolean
  presupuestado: number
  real: number
  desvio: number
  desvio_pct: number | null
  estado: string
}

export interface FilaAnual {
  categoria: string
  ambito: string
  presupuestado: number
  real: number
  desvio: number
  desvio_pct: number | null
  meses_con_gasto: number
  meses_excedidos: number
  estado: string
}

const BADGE: Record<string, { estado: EstadoBadge; label: string }> = {
  excedido: { estado: 'mora', label: 'Excedido' },
  dentro: { estado: 'ok', label: 'Dentro' },
  sin_presupuesto: { estado: 'vencido', label: 'Sin presupuesto' },
  sin_ejecutar: { estado: 'neutro', label: 'Sin ejecutar' },
}

function badge(estado: string): CeldaBadge {
  const b = BADGE[estado]
  return b ? { estado: b.estado, label: b.label } : { estado: 'neutro', label: estado }
}

function formatMes(iso: string): string {
  const [a, m] = iso.split('-')
  return `${m}/${a.slice(2)}`
}

/** El desvío, con el signo y el color que distinguen gastar de más de no gastar. */
function celdaDesvio(monto: number, estado: string) {
  if (estado === 'sin_ejecutar') {
    return <span className="text-[11px] text-muted">no ejecutado</span>
  }
  const positivo = monto > 0
  return (
    <span className={`cifra font-bold ${positivo ? 'text-errtx' : 'text-oktx'}`}>
      {positivo ? '+' : ''}
      {formatMoney(monto)}
    </span>
  )
}

interface FilaMesTabla {
  clave: string
  mes: string
  categoria: string
  ambito: string
  presupuestado: number
  real: number
  desvio: React.ReactNode
  pct: string
  estado: CeldaBadge
}

const COL_MES: ColumnDef<FilaMesTabla>[] = [
  { key: 'mes', label: 'Mes', width: 76 },
  { key: 'categoria', label: 'Categoría' },
  { key: 'ambito', label: 'Ámbito', width: 170 },
  { key: 'presupuestado', label: 'Presupuestado', format: 'money', width: 140 },
  { key: 'real', label: 'Real', format: 'money', width: 130 },
  { key: 'desvio', label: 'Desvío', align: 'right', width: 140 },
  { key: 'pct', label: '%', align: 'right', width: 84 },
  { key: 'estado', label: 'Estado', format: 'badge', width: 148 },
]

interface FilaAnualTabla {
  clave: string
  categoria: string
  ambito: string
  presupuestado: number
  real: number
  desvio: React.ReactNode
  pct: string
  meses: string
  estado: CeldaBadge
}

const COL_ANUAL: ColumnDef<FilaAnualTabla>[] = [
  { key: 'categoria', label: 'Categoría' },
  { key: 'ambito', label: 'Ámbito', width: 170 },
  { key: 'presupuestado', label: 'Presupuestado', format: 'money', width: 140 },
  { key: 'real', label: 'Real', format: 'money', width: 130 },
  { key: 'desvio', label: 'Desvío', align: 'right', width: 140 },
  { key: 'pct', label: '%', align: 'right', width: 84 },
  { key: 'meses', label: 'Meses', width: 150 },
  { key: 'estado', label: 'Estado', format: 'badge', width: 148 },
]

export interface VsRealProps {
  kpis: FilaKpi[]
  meses: FilaMes[]
  anual: FilaAnual[]
  /** 'hasta_hoy' (pasado + en curso) o 'todo'. */
  corte: string
  /** 'mensual' o 'anual'. */
  tabla: string
  /** Primer día del mes corriente, en ISO. Lo pasa el server: el componente no
   *  decide qué día es hoy — igual que la matriz del Calendario de pagos. */
  mesActual: string
  hrefCon: (extra: Record<string, string | null>) => string
}

export default function VsReal({ kpis, meses, anual, corte, tabla, mesActual, hrefCon }: VsRealProps) {
  // El corte elige un ROLLUP de la vista —'hasta_hoy' o 'todo'—, no una lista
  // de tramos que después haya que sumar. Sumar `pasado + en_curso` acá sería
  // el total calculado en el front que la regla 1 prohíbe, y quedaría corto el
  // día que aparezca un tramo nuevo.
  const rollup = corte === 'todo' ? 'todo' : 'hasta_hoy'

  // El detalle mensual NO trae `tramo` —eso vive en la vista de KPIs—, así que
  // acá se decide por fecha. Comparar dos ISO no es calcular un total: es el
  // mismo filtro que hace la vista, del lado de la lista.
  const visible = (mes: string) => (corte === 'todo' ? true : mes <= mesActual)

  /** La fila que la vista ya totalizó para este corte. Puede no existir. */
  const kpi = (estado: string) => kpis.find((k) => k.tramo === rollup && k.estado === estado)

  const excedido = kpi('excedido')
  const sinPresup = kpi('sin_presupuesto')
  const sinEjec = kpi('sin_ejecutar')
  const dentro = kpi('dentro')

  // La señal vive en el tramo FINO: el rollup la esconde mezclándola con el mes
  // en curso, que todavía puede ejecutarse.
  const sinEjecPasado = kpis.find((k) => k.tramo === 'pasado' && k.estado === 'sin_ejecutar')

  const filasMes: FilaMesTabla[] = meses
    .filter((m) => visible(m.mes))
    .map((m, i) => ({
      clave: `${m.mes}-${m.categoria}-${i}`,
      mes: formatMes(m.mes),
      categoria: m.categoria,
      ambito: m.ambito,
      presupuestado: m.presupuestado,
      real: m.real,
      desvio: celdaDesvio(m.desvio, m.estado),
      pct: m.desvio_pct === null ? '—' : `${m.desvio_pct}%`,
      estado: badge(m.estado),
    }))

  const filasAnual: FilaAnualTabla[] = anual.map((a, i) => ({
    clave: `${a.categoria}-${i}`,
    categoria: a.categoria,
    ambito: a.ambito,
    presupuestado: a.presupuestado,
    real: a.real,
    desvio: celdaDesvio(a.desvio, a.estado),
    pct: a.desvio_pct === null ? '—' : `${a.desvio_pct}%`,
    meses:
      a.meses_excedidos > 0
        ? `${a.meses_con_gasto} con gasto · ${a.meses_excedidos} excedido${a.meses_excedidos === 1 ? '' : 's'}`
        : `${a.meses_con_gasto} con gasto`,
    estado: badge(a.estado),
  }))

  return (
    <>
      {/* ── El corte ────────────────────────────────────────────────────────
          Por defecto sólo lo comparable. El año completo se ofrece, pero con la
          advertencia de qué significa el número que aparece al incluirlo. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-line bg-white p-0.5">
          {(
            [
              ['hasta_hoy', 'Hasta hoy'],
              ['todo', 'Año completo'],
            ] as const
          ).map(([v, label]) => (
            <Link
              key={v}
              href={hrefCon({ corte: v === 'hasta_hoy' ? null : v })}
              scroll={false}
              className={`rounded-[5px] px-3.5 py-1.5 text-[11px] font-bold transition ${
                corte === v || (v === 'hasta_hoy' && corte !== 'todo')
                  ? 'bg-blue-d text-white'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <span className="text-[11px] text-muted">
          {corte === 'todo'
            ? 'Incluye los meses que no llegaron: casi todo va a figurar «sin ejecutar».'
            : 'Meses cerrados y el corriente — lo único que tiene con qué compararse.'}
        </span>
      </div>

      {/* ── Los cuatro estados, nunca un total único ───────────────────────
          Sumarlos da −$126.500.000, que se lee como un ahorro y son los meses
          que todavía no pasaron. Cada tarjeta responde otra pregunta. */}
      <div className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(232px,1fr))]">
        <KpiCard
          tono={excedido ? 'alerta' : 'positivo'}
          titulo="Excedido"
          valor={excedido?.desvio ?? 0}
          icon="alerta"
          subtitulo={
            excedido
              ? `${excedido.categorias} ${excedido.categorias === 1 ? 'categoría se pasó' : 'categorías se pasaron'} de lo planeado`
              : 'Ninguna categoría se pasó del presupuesto'
          }
        />
        <KpiCard
          tono={sinPresup ? 'alerta' : 'neutro'}
          titulo="Gastado sin presupuestar"
          valor={sinPresup?.real ?? 0}
          icon="comprobante"
          subtitulo={
            sinPresup
              ? `${sinPresup.categorias} ${sinPresup.categorias === 1 ? 'categoría' : 'categorías'} que nadie planeó`
              : 'Todo el gasto tiene su línea de presupuesto'
          }
        />
        <KpiCard
          tono="info"
          titulo="Dentro de lo planeado"
          valor={dentro?.real ?? 0}
          icon="check"
          subtitulo={
            dentro
              ? `de ${formatMoney(dentro.presupuestado)} presupuestados`
              : 'Sin categorías ejecutadas todavía'
          }
        />
        <KpiCard
          tono="neutro"
          titulo="Sin ejecutar"
          valor={sinEjec?.presupuestado ?? 0}
          icon="reloj"
          subtitulo="Presupuesto que todavía no se gastó — no es un ahorro"
        />
      </div>

      {/* ── La señal de calidad de dato ─────────────────────────────────────
          Un mes CERRADO con presupuesto y sin un solo gasto cargado no es lo
          mismo que un mes que no llegó. O falta cargarlo, o no se gastó — y
          las dos cosas hay que saberlas. */}
      {sinEjecPasado && sinEjecPasado.presupuestado > 0 && (
        <p className="mb-4 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
          <strong className="font-bold">
            {formatMoney(sinEjecPasado.presupuestado)} presupuestados en meses ya cerrados, sin un
            solo gasto cargado.
          </strong>{' '}
          Son {sinEjecPasado.filas} {sinEjecPasado.filas === 1 ? 'mes-categoría' : 'meses-categoría'}{' '}
          en {sinEjecPasado.categorias}{' '}
          {sinEjecPasado.categorias === 1 ? 'categoría' : 'categorías'}. No es lo mismo que el mes en
          curso, que todavía puede ejecutarse:{' '}
          <strong className="font-semibold">o falta cargar esos gastos, o no se gastaron</strong>. Las
          dos cosas conviene saberlas.
        </p>
      )}

      {sinPresup && (
        <p className="mb-4 rounded-md border border-line bg-white px-4 py-3 text-[11px] text-muted">
          <strong className="font-bold text-ink">
            {formatMoney(sinPresup.real)} gastados sin presupuesto.
          </strong>{' '}
          No es un desvío del 100%: son categorías que{' '}
          <strong className="font-semibold text-ink">nunca se presupuestaron</strong>. Se corrige
          agregándoles una línea en la pestaña de carga — no revisando el gasto.
        </p>
      )}

      {/* ── Mensual vs anual ────────────────────────────────────────────────
          Los dos, porque dicen cosas distintas: el prorrateo por calendario
          desfasa el mensual —un aguinaldo, una factura a 30 días— y el anual
          lo neutraliza. El mensual dice CUÁNDO, el anual dice CUÁNTO. */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-line bg-white p-0.5">
          {(
            [
              ['mensual', 'Mes a mes'],
              ['anual', 'Acumulado del año'],
            ] as const
          ).map(([v, label]) => (
            <Link
              key={v}
              href={hrefCon({ tabla: v === 'mensual' ? null : v })}
              scroll={false}
              className={`rounded-[5px] px-3.5 py-1.5 text-[11px] font-bold transition ${
                tabla === v || (v === 'mensual' && tabla !== 'anual')
                  ? 'bg-blue-d text-white'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <span className="text-[11px] text-muted">
          {tabla === 'anual'
            ? 'El acumulado neutraliza los desfases de fecha: un aguinaldo o una factura a 30 días desvían el mes y no el año.'
            : 'Dice cuándo pasó cada cosa. Ojo que el prorrateo por calendario puede desfasar un mes.'}
        </span>
      </div>

      {tabla === 'anual' ? (
        <DataTable
          columns={COL_ANUAL}
          rows={filasAnual}
          rowKey="clave"
          densidad="compacta"
          maxHeight={560}
          emptyMessage="Sin datos para comparar."
        />
      ) : (
        <DataTable
          columns={COL_MES}
          rows={filasMes}
          rowKey="clave"
          densidad="compacta"
          maxHeight={560}
          emptyMessage="Sin datos para comparar."
        />
      )}

      <p className="mt-3 text-[11px] text-muted">
        El desvío es <strong className="font-semibold">real menos presupuestado</strong>: positivo y
        en rojo es gastar de más. Se mide contra el{' '}
        <strong className="font-semibold">devengado</strong>, no contra lo pagado — el presupuesto es
        de gasto, no de caja. El presupuesto se reparte por el calendario: los de partido siguen las
        jornadas del mes, los de día de cancha sus días, y los mensuales van parejos.
      </p>
    </>
  )
}
