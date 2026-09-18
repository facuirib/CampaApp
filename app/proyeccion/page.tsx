import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { formatDate, formatMoney } from '@/lib/format'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { KpiCard, type EstadoBadge } from '@/components/ui'
import GraficoCashflow, { type PeriodoGrafico } from './GraficoCashflow'
import FilaPeriodo from './FilaPeriodo'

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
  /**
   * El período cae después del último con gasto estimado: tiene los ingresos
   * comprometidos y ninguno de los egresos que los acompañan. Sale de la vista
   * —es un agregado sobre toda la serie— y no se recalcula acá.
   */
  cola_incompleta: boolean
  entradas: number | null
  salidas: number | null
  flujo_neto: number | null
  saldo_proyectado: number | null
}

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Suma días a una fecha YYYY-MM-DD en UTC, sin pasar por husos horarios. */
function sumarDias(fecha: string, dias: number): string {
  const m = SOLO_FECHA.exec(fecha)
  if (!m) return fecha
  const [aaaa, mm, dd] = fecha.split('-').map(Number)
  const base = new Date(Date.UTC(aaaa, mm - 1, dd))
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

/** El 1º del mes siguiente — el fin exclusivo de un período mensual. */
function siguienteMes(fecha: string): string {
  const m = SOLO_FECHA.exec(fecha)
  if (!m) return fecha
  const [aaaa, mm] = fecha.split('-').map(Number)
  const base = new Date(Date.UTC(aaaa, mm - 1, 1))
  base.setUTCMonth(base.getUTCMonth() + 1)
  return base.toISOString().slice(0, 10)
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
 * cliente en esta ruta hasta llegar a una fila.
 *
 * `desde`/`hasta` viajan con el cambio de pestaña: filtrar un rango y después
 * mirar la vista mensual no tendría que perder el filtro.
 */
function Pestanas({
  activa,
  desde,
  hasta,
}: {
  activa: Vista
  desde?: string
  hasta?: string
}) {
  const href = (v: Vista) => {
    const params = new URLSearchParams()
    if (v !== 'semanal') params.set('vista', v)
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    const q = params.toString()
    return q ? `/proyeccion?${q}` : '/proyeccion'
  }

  return (
    <div className="mb-5 inline-flex gap-1 rounded-md bg-line2 p-1" role="tablist">
      {Object.values(VISTAS).map((v) => {
        const esActiva = v.vista === activa
        return (
          <Link
            key={v.vista}
            href={href(v.vista)}
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
  searchParams: Promise<{ vista?: string; desde?: string; hasta?: string; abrir?: string }>
}) {
  const { vista, desde: desdeParam, hasta: hastaParam, abrir } = await searchParams
  const activa: Vista = vista === 'mensual' ? 'mensual' : 'semanal'
  const config = VISTAS[activa]
  const esMensual = activa === 'mensual'
  const columnaPeriodo = esMensual ? 'mes' : 'semana'

  const supabase = await createClient()

  // Dos ramas explícitas en vez de un nombre de tabla en una variable: así el
  // cliente de Supabase sigue tipado —sabe qué columnas tiene cada vista— y un
  // typo no llega a producción. Las dos ramas devuelven la misma forma, que es
  // lo que permite que todo lo de abajo sea uno solo.
  const cajaPromesa = supabase.from('v_saldo_caja_total').select('saldo_total').single()

  // El rango de fechas se aplica ACÁ, sobre la consulta ya resuelta —no toca
  // ninguna vista—: `saldo_proyectado` es un acumulado que la base ya calculó
  // correcto sobre TODA la serie; mostrar sólo un recorte no lo recalcula ni
  // lo desalinea, sólo esconde filas de los dos extremos.
  const aplicarRango = <T extends { gte: unknown; lte: unknown }>(q: T): T => {
    let r = q as unknown as { gte: (c: string, v: string) => unknown; lte: (c: string, v: string) => unknown }
    if (desdeParam) r = r.gte(columnaPeriodo, desdeParam) as typeof r
    if (hastaParam) r = r.lte(columnaPeriodo, hastaParam) as typeof r
    return r as unknown as T
  }

  const [filas, caja, conEgresos, bajoCero, error] = esMensual
    ? await (async () => {
        const [f, c, e, b] = await Promise.all([
          aplicarRango(
            supabase.from('v_cashflow_mensual').select('*').not('mes', 'is', null),
          ).order('mes'),
          cajaPromesa,
          aplicarRango(
            supabase
              .from('v_cashflow_mensual')
              .select('*', { count: 'exact', head: true })
              .eq('futura', true)
              .lt('salidas', 0),
          ),
          aplicarRango(
            supabase
              .from('v_cashflow_mensual')
              .select('*', { count: 'exact', head: true })
              .lt('saldo_proyectado', 0),
          ),
        ])
        const norm: Periodo[] = (f.data ?? []).map((r) => ({
          inicio: r.mes ?? '',
          futura: !!r.futura,
          cola_incompleta: !!r.cola_incompleta,
          entradas: r.entradas,
          salidas: r.salidas,
          flujo_neto: r.flujo_neto,
          saldo_proyectado: r.saldo_proyectado,
        }))
        return [norm, c, e, b, f.error ?? c.error ?? e.error ?? b.error] as const
      })()
    : await (async () => {
        const [f, c, e, b] = await Promise.all([
          aplicarRango(supabase.from('v_cashflow').select('*').not('semana', 'is', null)).order(
            'semana',
          ),
          cajaPromesa,
          aplicarRango(
            supabase
              .from('v_cashflow')
              .select('*', { count: 'exact', head: true })
              .eq('futura', true)
              .lt('salidas', 0),
          ),
          aplicarRango(
            supabase
              .from('v_cashflow')
              .select('*', { count: 'exact', head: true })
              .lt('saldo_proyectado', 0),
          ),
        ])
        const norm: Periodo[] = (f.data ?? []).map((r) => ({
          inicio: r.semana ?? '',
          futura: !!r.futura,
          cola_incompleta: !!r.cola_incompleta,
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

  // Dónde arranca la cola incompleta. Es un `find` sobre la columna que ya
  // trae la vista, no una regla escrita de nuevo: el día que se cargue el
  // presupuesto del Apertura, la marca retrocede sola y esto la sigue.
  const filaCorte = filas.find((f) => f.cola_incompleta)

  // Lo único que se suma en toda la pantalla, y es deliberado: es el tamaño
  // del agujero —cuántos ingresos hay sin ningún gasto al lado—, un número que
  // NO existe en ninguna vista porque no es flujo ni saldo, es la medida de lo
  // que falta. Si algún día hace falta en otra pantalla, se muda a SQL.
  const ingresosSinGasto = filas
    .filter((f) => f.cola_incompleta)
    .reduce((t, f) => t + (f.entradas ?? 0), 0)

  const rotular = (inicio: string) => (esMensual ? formatMes(inicio) : formatDate(inicio))

  const periodosGrafico: PeriodoGrafico[] = filas.map((f) => ({
    fecha: f.inicio,
    saldo: f.saldo_proyectado ?? 0,
    entradas: f.entradas ?? 0,
    salidas: f.salidas ?? 0,
    proyectado: f.futura,
    incompleto: f.cola_incompleta,
  }))

  const filasTabla = filas.map((f, i) => {
    const clave = f.inicio || String(i)
    const tramo: { estado: EstadoBadge; label: string } = f.cola_incompleta
      ? { estado: 'porVencer', label: 'Incompleto' }
      : f.futura
        ? { estado: 'info', label: 'Proyectado' }
        : { estado: 'ok', label: 'Real' }
    return {
      clave,
      periodoLabel: rotular(f.inicio),
      tramo,
      entradas: f.entradas,
      salidas: f.salidas,
      flujoNeto: f.flujo_neto,
      saldoProyectado: f.saldo_proyectado,
      desde: f.inicio,
      // El drill-down siempre miraba una ventana de 7 días exacta —incluso en
      // la vista mensual no había drill-down—, y acá el desplegable respeta
      // la granularidad real de cada fila: 7 días para una semana, el mes
      // entero para un mes.
      hasta: esMensual ? siguienteMes(f.inicio) : sumarDias(f.inicio, 7),
    }
  })

  const filtros: FiltroUrl[] = []

  return (
    <div className="pb-10">
      <header className="mb-4">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Proyección de caja</h1>
        <p className="mt-1 text-[12px] text-muted">
          Saldo {esMensual ? 'mensual' : 'semanal'}: real hasta hoy, estimado hacia adelante.
          {' '}Tocá el ícono de una fila para ver de dónde sale cada peso.
        </p>
      </header>

      <Pestanas activa={activa} desde={desdeParam} hasta={hastaParam} />

      <FiltrosUrl
        filtros={filtros}
        rangoFecha={{
          desdeParametro: 'desde',
          hastaParametro: 'hasta',
          labelDesde: esMensual ? 'Desde (mes)' : 'Desde (semana)',
          labelHasta: esMensual ? 'Hasta (mes)' : 'Hasta (semana)',
        }}
      />

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && filas.length === 0 && (
        <div className="rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted">
          {desdeParam || hastaParam
            ? 'Nada en ese rango de fechas. Probá con otro.'
            : 'Todavía no hay datos de flujo. La proyección aparece cuando se registren cuotas, cobros o presupuesto.'}
        </div>
      )}

      {filas.length > 0 && (
        <>
          {filaCorte && (
            <p className="mb-6 rounded-md bg-warnbg px-4 py-3 text-[11px] leading-relaxed text-warntx">
              <strong className="font-bold">
                Desde {rotular(filaCorte.inicio)} la proyección tiene ingresos pero no gastos.
              </strong>{' '}
              Son {formatMoney(ingresosSinGasto)} de cuotas ya comprometidas sin nada de lo que
              cuesta correr el torneo: el saldo de esa cola es optimista. No está mal calculado —
              está calculado sobre datos que faltan. Se corrige cargando el presupuesto del torneo
              que las genera.
            </p>
          )}

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
              tono={
                (filaFinal?.saldo_proyectado ?? 0) < 0
                  ? 'alerta'
                  : filaFinal?.cola_incompleta
                    ? 'advertencia'
                    : 'info'
              }
              titulo="Saldo proyectado"
              valor={filaFinal?.saldo_proyectado ?? 0}
              icon="proyeccion"
              subtitulo={
                filaFinal
                  ? `Al cierre de ${filasTabla[filasTabla.length - 1]?.periodoLabel}` +
                    (filaCorte ? ` · sin gastos desde ${rotular(filaCorte.inicio)}` : '')
                  : 'A fin del rango'
              }
            />
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

          <GraficoCashflow periodos={periodosGrafico} granularidad={esMensual ? 'mes' : 'semana'} />

          <div className="overflow-x-auto rounded-md border border-line bg-white">
            <table className="w-full text-[12px]">
              <thead className="bg-panel text-[9px] uppercase tracking-[.06em] text-muted">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2.5 text-left font-bold">{esMensual ? 'Mes' : 'Semana'}</th>
                  <th className="px-3 py-2.5 text-left font-bold">Tramo</th>
                  <th className="px-3 py-2.5 text-right font-bold">Entradas</th>
                  <th className="px-3 py-2.5 text-right font-bold">Salidas</th>
                  <th className="px-3 py-2.5 text-right font-bold">Flujo neto</th>
                  <th className="px-3 py-2.5 text-right font-bold">Saldo proyectado</th>
                </tr>
              </thead>
              <tbody>
                {filasTabla.map((f) => (
                  <FilaPeriodo
                    key={f.clave}
                    periodoLabel={f.periodoLabel}
                    tramo={f.tramo}
                    entradas={f.entradas}
                    salidas={f.salidas}
                    flujoNeto={f.flujoNeto}
                    saldoProyectado={f.saldoProyectado}
                    desde={f.desde}
                    hasta={f.hasta}
                    abiertoInicial={!esMensual && !!abrir && abrir === f.clave}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
