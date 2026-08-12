import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { formatDate } from '@/lib/format'
import { ChartArea, DataTable, KpiCard, type ColumnDef, type PuntoSerie } from '@/components/ui'

type Vista = 'semanal' | 'mensual'

/**
 * Las dos granularidades de la misma pregunta.
 *
 * `v_cashflow` y `v_cashflow_mensual` tienen la MISMA forma —flujo, saldo
 * proyectado y la marca `futura`— y sólo cambia el grano. Por eso la pantalla
 * es una sola con pestañas y no dos rutas: el encabezado, los KpiCards y el
 * gráfico son idénticos, y lo único que cambia es de dónde sale la serie.
 */
const VISTAS: Record<Vista, { vista: Vista; label: string; unidad: string }> = {
  semanal: { vista: 'semanal', label: 'Semanal', unidad: 'Semanas' },
  mensual: { vista: 'mensual', label: 'Mensual', unidad: 'Meses' },
}

/** Lo que la pantalla necesita de cualquiera de las dos vistas. */
interface Periodo {
  /** El inicio del período en ISO: el lunes de la semana o el 1º del mes. */
  inicio: string
  futura: boolean
  entradas: number | null
  salidas: number | null
  flujo_neto: number | null
  saldo_proyectado: number | null
}

interface FilaPeriodo {
  clave: string
  periodo: string
  tramo: string
  entradas: number | null
  salidas: number | null
  flujo_neto: number | null
  saldo_proyectado: number | null
}

function columnas(rotuloPeriodo: string): ColumnDef<FilaPeriodo>[] {
  return [
    { key: 'periodo', label: rotuloPeriodo, width: 112 },
    { key: 'tramo', label: 'Tramo', width: 104 },
    { key: 'entradas', label: 'Entradas', format: 'money', width: 140 },
    { key: 'salidas', label: 'Salidas', format: 'money', width: 140 },
    { key: 'flujo_neto', label: 'Flujo neto', format: 'money', width: 140 },
    { key: 'saldo_proyectado', label: 'Saldo proyectado', format: 'money', width: 156 },
  ]
}

/** "08/2026" a partir del primer día del mes que devuelve la vista. */
function formatMes(mes: string): string {
  const [aaaa, mm] = mes.split('-')
  return `${mm}/${aaaa}`
}

/**
 * Las pestañas viven en la URL, no en un `useState`.
 *
 * Son `<Link>` y no un `<select>`: con dos opciones visibles a la vez se ve
 * cuál está activa y cuál es la otra, sin desplegar nada. Y al ser enlaces, la
 * pantalla sigue siendo Server Component entera — no hay una sola línea de
 * cliente en esta ruta.
 */
function Pestanas({ activa }: { activa: Vista }) {
  return (
    <div className="mb-5 inline-flex gap-1 rounded-md bg-line2 p-1" role="tablist">
      {Object.values(VISTAS).map((v) => {
        const esActiva = v.vista === activa
        return (
          <Link
            key={v.vista}
            href={v.vista === 'semanal' ? '/proyeccion' : `/proyeccion?vista=${v.vista}`}
            role="tab"
            aria-selected={esActiva}
            className={[
              'rounded-sm px-3 py-1 text-[11px] font-bold transition-colors',
              esActiva ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {v.label}
          </Link>
        )
      })}
    </div>
  )
}

export default async function ProyeccionPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>
}) {
  const { vista } = await searchParams
  const activa: Vista = vista === 'mensual' ? 'mensual' : 'semanal'
  const config = VISTAS[activa]
  const esMensual = activa === 'mensual'

  const supabase = await createClient()

  // Dos ramas explícitas en vez de un nombre de tabla en una variable: así el
  // cliente de Supabase sigue tipado —sabe qué columnas tiene cada vista— y un
  // typo no llega a producción. Las dos ramas devuelven la misma forma, que es
  // lo que permite que todo lo de abajo sea uno solo.
  const cajaPromesa = supabase.from('v_saldo_caja_total').select('saldo_total').single()

  // Los dos conteos los hace LA BASE, con `head: true`: no traen filas, sólo el
  // número. Recorrer el array acá sería el mismo cálculo que la regla 1 saca de
  // la pantalla, aunque el resultado sea un booleano.
  const [filas, caja, conEgresos, bajoCero, error] = esMensual
    ? await (async () => {
        const [f, c, e, b] = await Promise.all([
          supabase.from('v_cashflow_mensual').select('*').not('mes', 'is', null).order('mes'),
          cajaPromesa,
          supabase
            .from('v_cashflow_mensual')
            .select('*', { count: 'exact', head: true })
            .eq('futura', true)
            .lt('salidas', 0),
          supabase
            .from('v_cashflow_mensual')
            .select('*', { count: 'exact', head: true })
            .lt('saldo_proyectado', 0),
        ])
        const norm: Periodo[] = (f.data ?? []).map((r) => ({
          inicio: r.mes ?? '',
          futura: !!r.futura,
          entradas: r.entradas,
          salidas: r.salidas,
          flujo_neto: r.flujo_neto,
          saldo_proyectado: r.saldo_proyectado,
        }))
        return [norm, c, e, b, f.error ?? c.error ?? e.error ?? b.error] as const
      })()
    : await (async () => {
        const [f, c, e, b] = await Promise.all([
          supabase.from('v_cashflow').select('*').not('semana', 'is', null).order('semana'),
          cajaPromesa,
          supabase
            .from('v_cashflow')
            .select('*', { count: 'exact', head: true })
            .eq('futura', true)
            .lt('salidas', 0),
          supabase
            .from('v_cashflow')
            .select('*', { count: 'exact', head: true })
            .lt('saldo_proyectado', 0),
        ])
        const norm: Periodo[] = (f.data ?? []).map((r) => ({
          inicio: r.semana ?? '',
          futura: !!r.futura,
          entradas: r.entradas,
          salidas: r.salidas,
          flujo_neto: r.flujo_neto,
          saldo_proyectado: r.saldo_proyectado,
        }))
        return [norm, c, e, b, f.error ?? c.error ?? e.error ?? b.error] as const
      })()

  const saldoHoy = caja.data?.saldo_total ?? 0
  const periodosConEgresos = conEgresos.count ?? 0
  const periodosBajoCero = bajoCero.count ?? 0

  // Buscar la primera fila que cumple algo es filtrar, no calcular: el número
  // que se muestra sigue siendo el de su fila.
  const filaFinal = filas[filas.length - 1]
  const filaQuiebre = filas.find((f) => (f.saldo_proyectado ?? 0) < 0)

  const rotular = (inicio: string) => (esMensual ? formatMes(inicio) : formatDate(inicio))

  const serie: PuntoSerie[] = filas.map((f) => ({
    fecha: f.inicio,
    valor: f.saldo_proyectado ?? 0,
    proyectado: f.futura,
  }))

  const periodos: FilaPeriodo[] = filas.map((f, i) => ({
    clave: f.inicio || String(i),
    periodo: rotular(f.inicio),
    tramo: f.futura ? 'Proyectado' : 'Real',
    entradas: f.entradas,
    salidas: f.salidas,
    flujo_neto: f.flujo_neto,
    saldo_proyectado: f.saldo_proyectado,
  }))

  return (
    <div className="pb-10">
      <header className="mb-4">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Proyección de caja</h1>
        <p className="mt-1 text-[12px] text-muted">
          Saldo {esMensual ? 'mensual' : 'semanal'}: real hasta hoy, estimado hacia adelante.
          {/* Sólo en la semanal: la tabla mensual no es clickeable, así que
              invitar a tocarla sería prometer algo que no pasa. */}
          {!esMensual && ' Tocá una semana para ver de dónde sale cada peso.'}
        </p>
      </header>

      <Pestanas activa={activa} />

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && filas.length === 0 && (
        <div className="rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted">
          Todavía no hay datos de flujo. La proyección aparece cuando se registren cuotas, cobros o
          presupuesto.
        </div>
      )}

      {filas.length > 0 && (
        <>
          {/* La advertencia se apaga sola en cuanto haya presupuesto cargado, y
              vale para las dos vistas: la mensual agrupa las mismas semanas, así
              que si no hay egresos en una tampoco los hay en la otra.

              Sin ella, una curva que sólo sube se lee como una proyección
              optimista y en realidad es una proyección INCOMPLETA: le faltan
              todos los egresos. */}
          {periodosConEgresos === 0 && (
            <p className="mb-6 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
              <strong className="font-bold">Proyección sin egresos presupuestados.</strong> Ningún{' '}
              {esMensual ? 'mes' : 'semana'} futuro tiene gastos estimados, así que la curva refleja
              sólo los ingresos y el saldo proyectado es más alto de lo que va a ser. Se corrige
              cargando el presupuesto.
            </p>
          )}

          <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            <KpiCard
              tono="neutro"
              titulo="Saldo actual"
              valor={saldoHoy}
              icon="banco"
              subtitulo="Caja real, hoy"
            />
            <KpiCard
              tono={(filaFinal?.saldo_proyectado ?? 0) < 0 ? 'alerta' : 'info'}
              titulo="Saldo proyectado"
              valor={filaFinal?.saldo_proyectado ?? 0}
              icon="proyeccion"
              subtitulo={
                filaFinal
                  ? `Al cierre de ${periodos[periodos.length - 1]?.periodo}`
                  : 'A fin del rango'
              }
            />
            {/* El rótulo sigue a la granularidad: en semanal cuenta semanas, en
                mensual cuenta meses. Un "semanas bajo cero" sobre la serie
                mensual estaría contando otra cosa. */}
            <KpiCard
              tono={periodosBajoCero > 0 ? 'alerta' : 'positivo'}
              titulo={`${config.unidad} bajo cero`}
              valor={periodosBajoCero}
              formato="entero"
              icon="alerta"
              subtitulo={
                filaQuiebre
                  ? `${esMensual ? 'El primero' : 'La primera'}, ${rotular(filaQuiebre.inicio)}`
                  : 'Sin quiebre proyectado'
              }
            />
          </div>

          {/* Sin envoltorio: ChartArea ya trae su propio marco —el mismo caso
              que DataTable dentro de Card—, y anidarlo dibuja dos bordes. */}
          <ChartArea
            className="mb-6"
            serie={serie}
            titulo={`Saldo de caja proyectado por ${esMensual ? 'mes' : 'semana'}`}
          />

          {/* Sin fila de total: `saldo_proyectado` es stock —cada período ya
              contiene a los anteriores— y las columnas de flujo suman períodos
              reales y estimados mezclados, que no es un número que signifique
              nada. Lo que sí significa está arriba, en los KpiCards. */}
          {/* El drill-down abre una ventana de SIETE DÍAS desde la fecha que
              recibe, así que sólo tiene sentido en la vista semanal. Un mes
              linkeado ahí no fallaría —'2026-08-01' también es una fecha
              válida— sino que mostraría los primeros siete días como si fueran
              el mes entero, que es peor que no linkear: no rompe, miente.

              `clave` es el ISO crudo que devuelve la vista ('2026-07-06'), sin
              pasar por `Date` en ningún punto: se concatena tal cual. Por eso
              no hay corrimiento de zona posible, que es el bug que apareció en
              el eje de ChartArea cuando una fecha sin hora se convertía a Date
              local y se leía en otra zona. */}
          <DataTable
            columns={columnas(esMensual ? 'Mes' : 'Semana')}
            rows={periodos}
            rowKey="clave"
            rowHref={esMensual ? undefined : (f) => `/proyeccion/${f.clave}`}
            densidad="compacta"
            maxHeight={520}
            emptyMessage="Sin períodos para proyectar."
          />
        </>
      )}
    </div>
  )
}
