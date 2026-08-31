import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { formatDate, formatMoney } from '@/lib/format'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { ChartBarras, type SerieBarras } from '@/components/ui'
import { Badge, DataTable, KpiCard, Money, type CeldaBadge, type ColumnDef } from '@/components/ui'
import MatrizMes, { type DiaCalendario } from './MatrizMes'
import type { Database } from '@/lib/db/database.types'

type Vencimiento = Database['public']['Views']['v_cashflow_comprometido']['Row']

/**
 * Calendario de pagos · lo que vence, en dos presentaciones.
 *
 * La ruta es `/calendario-pagos` y no `/calendario` porque ese nombre ya es del
 * **calendario de jornadas**, que es otra cosa: ahí se definen las fechas del
 * torneo, acá se mira qué plata entra y sale en cada una.
 *
 * Todo el estado —vista, mes, día abierto, filtro— vive en la URL. Por eso la
 * pantalla entera es Server Component y lo único cliente es la barra de
 * filtros: la consulta se rehace en el servidor con el filtro puesto, en vez de
 * traer todo y esconder filas. Y un día concreto es una dirección que se
 * comparte.
 *
 * Ningún total se calcula acá (regla 1): `v_calendario_kpi` da los del
 * encabezado, `v_calendario_mes` el del mes y `v_calendario_dia` el de cada
 * celda. El front sólo dibuja.
 */

const ROTULO_ORIGEN: Record<string, string> = {
  cuota_equipo: 'Cuota de equipo',
  cuota_sponsor: 'Cuota de sponsor',
  gasto_impago: 'Gasto impago',
  cheque_recibido: 'Cheque recibido',
  cheque_emitido: 'Cheque emitido',
  compromiso_factura: 'Factura',
  compromiso_cuota_plan: 'Cuota de plan',
  compromiso_cheque_emitido: 'Cheque emitido',
  compromiso_cheque_recibido: 'Cheque recibido',
  compromiso_otro: 'Compromiso',
  // Los sueldos de socios entraron al comprometido el 29/08 y esta pantalla no
  // se enteró: sin rótulo salían con la clave cruda («sueldo_socio») en la
  // columna Tipo, y sin href rompían la lista entera. Ver `hrefOrigen`.
  sueldo_socio: 'Sueldo de socio',
}

function rotulo(origen: string | null): string {
  if (!origen) return '—'
  return ROTULO_ORIGEN[origen] ?? origen
}

/**
 * A dónde lleva cada vencimiento.
 *
 * El destino lo decide `origen`, no `tercero_id`: un NULL ahí no significa que
 * no se pueda enlazar, significa que no se enlaza por tercero. Los gastos y los
 * cheques se abren por su propio registro; las cuotas, por su contraparte.
 *
 * Enlaces y nada más: son pantallas de otro carril y se cruzan con un `<Link>`,
 * no se tocan por dentro.
 */
function hrefOrigen(v: Vencimiento): string | null {
  const o = v.origen ?? ''
  if (o === 'cuota_equipo') return v.tercero_id ? `/equipos/${v.tercero_id}` : '/equipos'
  if (o === 'cuota_sponsor') return v.tercero_id ? `/sponsors/${v.tercero_id}` : '/sponsors'
  if (o.startsWith('cheque_')) return v.origen_id ? `/cheques/${v.origen_id}` : '/cheques'
  if (o === 'gasto_impago') return '/gastos'
  // El origen que rompía la lista. `v_cashflow_comprometido` empezó a devolver
  // `sueldo_socio` el 29/08 —dos fuentes: el sueldo proyectado de cada mes y el
  // saldo a favor arrastrado— y acá caía en el `return null` de abajo.
  //
  // El calendario nunca lo notó porque no usa esta función; la LISTA sí, y con
  // `href` en null la fila terminaba en un `<Link href="">`, que Next rechaza.
  // Nueve filas alcanzaban para tumbar las 285.
  if (o === 'sueldo_socio') return v.tercero_id ? `/socios/${v.tercero_id}` : '/socios'
  return null
}

function mesLegible(iso: string): string {
  const [anio, m] = iso.split('-').map(Number)
  const nombres = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  const nombre = nombres[m - 1]
  // Se capitaliza acá y no con `capitalize` de Tailwind, que sube todas las
  // palabras y dejaba "Agosto De 2026".
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} de ${anio}`
}

function correrMes(iso: string, delta: number): string {
  const [anio, m] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(anio, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

interface FilaLista {
  clave: string
  fecha: string | null
  tipo: string
  detalle: string | null
  /** Ya viene coloreado: el signo es el dato, no un detalle de formato. */
  monto: React.ReactNode
  estado: CeldaBadge
  /**
   * El acumulado del DÍA, de v_calendario_dia. Va como nodo y no como número
   * para poder dejar la celda EN BLANCO en las filas que repiten día: un "—"
   * ahí se leería como "falta el dato", y el dato no falta — es el de arriba.
   */
  acumulado: React.ReactNode
  href: string | null
}

/**
 * Las columnas dependen del filtro, así que se arman por llamada.
 *
 * El ACUMULADO sólo se muestra sin filtrar, y esa es la parte que importa: es
 * el acumulado de la serie COMPLETA, no de las filas visibles. Mostrarlo junto
 * a una lista filtrada por tipo invitaría a leerlo como «el acumulado de los
 * gastos», que no es. Sumar sólo lo filtrado tampoco es opción: sería el front
 * calculando un total (regla 1).
 *
 * Se escribe UNA vez por día. Dentro de un día el orden entre vencimientos es
 * arbitrario, así que un acumulado que saltara fila a fila informaría sobre un
 * orden que no existe.
 */
function columnasDe(conAcumulado: boolean): ColumnDef<FilaLista>[] {
  const cols: ColumnDef<FilaLista>[] = [
    { key: 'fecha', label: 'Vence', format: 'date', width: 108 },
    { key: 'tipo', label: 'Tipo', width: 150 },
    // "Quién" no vale para un gasto impago, donde el detalle es la categoría y
    // no una persona. "Detalle" es honesto para las cinco ramas.
    { key: 'detalle', label: 'Detalle' },
    // Celda armada, no `format: 'money'`, porque la fila ya trae el ReactNode.
    // Lo que dibuja es `<Money tono="auto">`: el signo decide el color. Antes
    // esto era un <span> a mano «porque Money no colorea» — ahora sí, y el
    // workaround se fue.
    { key: 'monto', label: 'Monto', align: 'right', width: 148 },
    { key: 'estado', label: 'Estado', format: 'badge', width: 118 },
  ]
  if (conAcumulado) {
    cols.push({ key: 'acumulado', label: 'Acumulado', align: 'right', width: 150 })
  }
  return cols
}

export default async function CalendarioPagosPage({
  searchParams,
}: {
  searchParams: Promise<{
    vista?: string
    mes?: string
    dia?: string
    origen?: string
    flujo?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const hoy = hoyEnCordoba()
  const vista = params.vista === 'lista' ? 'lista' : 'calendario'
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? '') ? params.mes! : hoy.slice(0, 7)
  const diaAbierto = /^\d{4}-\d{2}-\d{2}$/.test(params.dia ?? '') ? params.dia! : null

  const inicioMes = `${mes}-01`
  const finMes = `${correrMes(mes, 1)}-01`

  let listaQuery = supabase
    .from('v_cashflow_comprometido')
    .select('*')
    .order('fecha_original')
    .order('monto', { ascending: false })

  if (params.origen) listaQuery = listaQuery.eq('origen', params.origen)

  // Entra o sale, por el signo del monto. Es lo que se pregunta primero —«¿qué
  // tengo que pagar este mes?»— y antes había que deducirlo del tipo, sabiendo
  // de memoria cuáles de los diez orígenes son salida.
  if (params.flujo === 'entra') listaQuery = listaQuery.gt('monto', 0)
  if (params.flujo === 'sale') listaQuery = listaQuery.lt('monto', 0)

  const [kpiRes, mesesRes, diasRes, detalleRes, listaRes] = await Promise.all([
    supabase.from('v_calendario_kpi').select('*').maybeSingle(),
    supabase.from('v_calendario_mes').select('*').order('mes'),
    supabase
      .from('v_calendario_dia')
      .select('*')
      .gte('dia', inicioMes)
      .lt('dia', finMes)
      .order('dia'),
    diaAbierto
      ? supabase
          .from('v_cashflow_comprometido')
          .select('*')
          .eq('fecha_original', diaAbierto)
          .order('monto', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    vista === 'lista' ? listaQuery : Promise.resolve({ data: [], error: null }),
  ])

  const error = kpiRes.error ?? mesesRes.error ?? diasRes.error ?? detalleRes.error ?? listaRes.error
  const kpi = kpiRes.data
  const mesActual = (mesesRes.data ?? []).find((m) => m.mes === inicioMes)

  const dias: DiaCalendario[] = (diasRes.data ?? []).map((d) => ({
    dia: d.dia!,
    items: d.items ?? 0,
    entra: d.entra ?? 0,
    sale: d.sale ?? 0,
    neto: d.neto ?? 0,
    vencidos: d.vencidos ?? 0,
  }))

  // Las tres series del gráfico. Reparto de lo YA traído, no una consulta nueva
  // ni un cálculo: cada número sale tal cual de v_calendario_dia.
  //
  // `vencidos` es un CONTEO de items, no un importe — por eso no va como serie
  // de plata. Se marca el día que tiene alguno reusando su propio `entra`, que
  // es la magnitud a la que pertenece: lo vencido es plata que debía entrar.
  const seriesDelMes: SerieBarras[] = [
    {
      label: 'Entra',
      color: 'var(--ok)',
      valores: dias.map((d) => (d.vencidos > 0 ? 0 : d.entra)),
    },
    {
      label: 'Entra, con vencidos',
      color: 'var(--warn)',
      valores: dias.map((d) => (d.vencidos > 0 ? d.entra : 0)),
    },
    { label: 'Sale', color: 'var(--err)', valores: dias.map((d) => d.sale) },
  ]

  // El acumulado corre sobre TODOS los días, así que se lee del día, no de la
  // lista filtrada: filtrar por tipo no cambia lo que se acumuló hasta esa fecha.
  const acumuladoPorDia = new Map<string | null, number | null>(
    vista === 'lista'
      ? ((await supabase.from('v_calendario_dia').select('dia, acumulado')).data ?? []).map((d) => [
          d.dia,
          d.acumulado,
        ])
      : [],
  )

  const listaFilas = (listaRes.data ?? []) as Vencimiento[]

  const filas: FilaLista[] = listaFilas.map((v, i) => {
    const monto = v.monto ?? 0
    // El acumulado se escribe UNA vez por día: es el mismo número para todas
    // las filas de esa fecha, y repetirlo catorce veces lo hace parecer un
    // error. No se recalcula nada — se elige dónde mostrarlo.
    const primeroDelDia = i === 0 || listaFilas[i - 1].fecha_original !== v.fecha_original

    return {
      clave: `${v.origen}-${v.origen_id}-${i}`,
      fecha: v.fecha_original,
      tipo: rotulo(v.origen),
      detalle: v.detalle,
      monto: <Money value={monto} tono="auto" className="font-bold" />,
      estado: v.arrastrada
        ? { estado: 'vencido', label: 'Vencido' }
        : { estado: 'porVencer', label: 'Por vencer' },
      acumulado: primeroDelDia ? (
        <span className="cifra font-semibold text-ink">
          {formatMoney(acumuladoPorDia.get(v.fecha_original) ?? 0)}
        </span>
      ) : (
        <span />
      ),
      href: hrefOrigen(v),
    }
  })

  const hrefCon = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const base: Record<string, string | null> = {
      vista: vista === 'calendario' ? null : vista,
      mes: mes === hoy.slice(0, 7) ? null : mes,
      origen: params.origen ?? null,
      flujo: params.flujo ?? null,
      ...extra,
    }
    for (const [k, val] of Object.entries(base)) if (val) p.set(k, val)
    const q = p.toString()
    return q ? `/calendario-pagos?${q}` : '/calendario-pagos'
  }

  // La matriz agrega `&dia=`, así que la base necesita al menos un parámetro.
  const hrefMatriz = `/calendario-pagos?vista=calendario&mes=${mes}`

  const filtros: FiltroUrl[] = [
    {
      parametro: 'flujo',
      label: 'Flujo',
      todos: 'Todo',
      opciones: [
        { valor: 'entra', label: 'Entra' },
        { valor: 'sale', label: 'Sale' },
      ],
    },
    {
      parametro: 'origen',
      label: 'Tipo',
      todos: 'Todos',
      opciones: Object.entries(ROTULO_ORIGEN)
        .filter(([k]) => !k.startsWith('compromiso_'))
        .map(([valor, label]) => ({ valor, label })),
    },
  ]

  const detalle = (detalleRes.data ?? []) as Vencimiento[]

  return (
    <div className="pb-10">
      <header className="mb-5">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Calendario de pagos</h1>
        <p className="mt-1 max-w-[80ch] text-[12px] text-muted">
          Todo lo que vence, entre y salga: cuotas de equipos y de sponsors, cheques, gastos
          comprometidos. Cada cosa aparece{' '}
          <strong className="font-semibold">el día que vence de verdad</strong> — lo que ya venció y
          sigue sin resolverse queda marcado, no se corre a hoy. Lo que ya se cobró o se pagó no
          está acá:{' '}
          <Link href="/movimientos" className="font-semibold text-blue-d hover:underline">
            eso es Movimientos
          </Link>
          .
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {/* ── Los KPIs ────────────────────────────────────────────────────────
          Los cuatro que contestan «¿tengo que preocuparme?»: cuánto neto hay
          comprometido, cuánto de eso ya venció, y qué es lo próximo. Todos
          salen de v_calendario_kpi, que es una fila. */}
      {kpi && (
        <div className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          <KpiCard
            tono={(kpi.neto ?? 0) >= 0 ? 'positivo' : 'alerta'}
            titulo="Neto comprometido"
            valor={kpi.neto}
            icon="proyeccion"
            subtitulo={`${kpi.items ?? 0} vencimientos en total`}
          />
          <KpiCard
            tono="info"
            titulo="Por cobrar"
            valor={kpi.entra}
            icon="cobranza"
            subtitulo="Cuotas, sponsors y cheques a favor"
          />
          <KpiCard
            tono="neutro"
            titulo="Por pagar"
            valor={kpi.sale}
            icon="comprobante"
            subtitulo="Gastos impagos y cheques emitidos"
          />
          <KpiCard
            tono={(kpi.vencidos ?? 0) > 0 ? 'alerta' : 'neutro'}
            titulo="Vencido"
            valor={kpi.vencido_monto}
            icon="alerta"
            subtitulo={
              (kpi.vencidos ?? 0) > 0
                ? `${kpi.vencidos} sin resolver`
                : 'Nada pendiente de fecha pasada'
            }
          />
        </div>
      )}

      {kpi?.proximo_dia && (
        <p className="mb-4 rounded-md border border-line bg-white px-4 py-2.5 text-[11px] text-muted">
          Próximo vencimiento:{' '}
          <strong className="font-bold text-ink">{formatDate(kpi.proximo_dia)}</strong> ·{' '}
          {kpi.proximo_items} {kpi.proximo_items === 1 ? 'movimiento' : 'movimientos'} ·{' '}
          <span className="cifra font-bold text-ink">{formatMoney(kpi.proximo_monto ?? 0)}</span>
        </p>
      )}

      {/* ── El toggle ───────────────────────────────────────────────────────
          Dos links, no un botón con estado: la vista elegida es parte de la
          dirección, así que se comparte y el "atrás" funciona. */}
      <div className="mb-4 inline-flex rounded-md border border-line bg-white p-0.5">
        {(['calendario', 'lista'] as const).map((v) => {
          const activo = v === vista
          return (
            <Link
              key={v}
              href={hrefCon({ vista: v === 'calendario' ? null : v, dia: null })}
              scroll={false}
              className={`rounded-[5px] px-4 py-1.5 text-[11px] font-bold transition ${
                activo ? 'bg-blue-d text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {v === 'calendario' ? 'Calendario' : 'Lista'}
            </Link>
          )
        })}
      </div>

      {vista === 'calendario' ? (
        <>
          {/* ── El encabezado del mes ────────────────────────────────────── */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link
                href={hrefCon({ mes: correrMes(mes, -1), dia: null })}
                scroll={false}
                className="rounded-md border border-line bg-white px-2.5 py-1 text-[12px] font-bold text-muted hover:text-ink"
              >
                ‹
              </Link>
              <span className="min-w-[168px] text-center text-[13px] font-bold text-ink">
                {mesLegible(mes)}
              </span>
              <Link
                href={hrefCon({ mes: correrMes(mes, 1), dia: null })}
                scroll={false}
                className="rounded-md border border-line bg-white px-2.5 py-1 text-[12px] font-bold text-muted hover:text-ink"
              >
                ›
              </Link>
              {mes !== hoy.slice(0, 7) && (
                <Link
                  href={hrefCon({ mes: null, dia: null })}
                  scroll={false}
                  className="ml-1 text-[11px] font-semibold text-blue-d hover:underline"
                >
                  Hoy
                </Link>
              )}
            </div>

            {mesActual && (
              <div className="flex flex-wrap items-center gap-4 text-[11px]">
                <span className="text-muted">
                  {mesActual.items} en {mesActual.dias_con_algo}{' '}
                  {mesActual.dias_con_algo === 1 ? 'día' : 'días'}
                </span>
                {(mesActual.entra ?? 0) !== 0 && (
                  <span className="cifra font-bold text-oktx">+{formatMoney(mesActual.entra ?? 0)}</span>
                )}
                {(mesActual.sale ?? 0) !== 0 && (
                  <span className="cifra font-bold text-errtx">{formatMoney(mesActual.sale ?? 0)}</span>
                )}
                <span className="cifra font-extrabold text-ink">
                  Neto {formatMoney(mesActual.neto ?? 0)}
                </span>
              </div>
            )}
          </div>

          {dias.length === 0 ? (
            <div className="rounded-md border border-line bg-white px-4 py-12 text-center">
              <p className="text-[12px] font-semibold text-ink">
                No vence nada en {mesLegible(mes)}
              </p>
              <p className="mx-auto mt-2 max-w-[52ch] text-[11px] text-muted">
                Ningún equipo, sponsor, cheque ni gasto tiene vencimiento este mes. Probá con otro
                mes, o mirá la lista completa.
              </p>
            </div>
          ) : (
            <MatrizMes
              mes={inicioMes}
              dias={dias}
              diaAbierto={diaAbierto}
              hrefBase={hrefMatriz}
              hoy={hoy}
            />
          )}

          {/* ── El desfasaje del mes, día por día ────────────────────────────
              La matriz dice QUÉ día vence algo; esto dice CUÁNTO y de qué lado,
              que es lo que se pierde en una grilla de celdas parejas. Las dos
              vistas salen de `dias` — la misma consulta a v_calendario_dia, ya
              traída— así que no hay una segunda fuente ni una segunda consulta.

              Apiladas y no agrupadas: entra y sale ocupan lados opuestos del
              cero, así que apilarlas no suma peras con manzanas — deja ver el
              NETO del día como la distancia entre las dos puntas, que es
              exactamente la pregunta («¿este día me alcanza?»). */}
          {dias.length > 0 && (
            <div className="mt-4">
              <h2 className="mb-2 text-[13px] font-extrabold tracking-[-.2px] text-ink">
                Cómo se reparte el mes
              </h2>
              <ChartBarras
                ejeX={dias.map((d) => d.dia.slice(8, 10))}
                series={seriesDelMes}
                modo="apiladas"
                alto={220}
                maxEtiquetasX={16}
                titulo="Entradas y salidas comprometidas por día del mes"
              />
              <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                Verde entra, rojo sale. Los días con algo{' '}
                <strong className="font-semibold text-ink">vencido</strong> van en ámbar sobre la
                barra de entrada: es plata que ya tendría que haber llegado.
              </p>
            </div>
          )}

          {/* ── El día abierto ───────────────────────────────────────────── */}
          {diaAbierto && (
            <div className="mt-4 overflow-hidden rounded-md border border-line bg-white">
              <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-2.5">
                <span className="text-[12px] font-bold text-ink">{formatDate(diaAbierto)}</span>
                <Link
                  href={hrefCon({ dia: null })}
                  scroll={false}
                  className="text-[11px] font-semibold text-muted hover:text-ink"
                >
                  Cerrar
                </Link>
              </div>

              {detalle.length === 0 ? (
                <p className="px-4 py-6 text-center text-[11px] text-muted">
                  No vence nada este día.
                </p>
              ) : (
                // Un día puede tener 34 vencimientos: sin techo, el detalle
                // empuja la matriz fuera de la pantalla y hay que scrollear
                // hasta abajo para volver a ella.
                <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-[12px]">
                  <tbody>
                    {detalle.map((v, i) => {
                      const href = hrefOrigen(v)
                      return (
                        <tr key={`${v.origen}-${v.origen_id}-${i}`} className="border-b border-line2 last:border-0">
                          <td className="px-4 py-2.5" style={{ width: 150 }}>
                            <span className="text-[11px] text-muted">{rotulo(v.origen)}</span>
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-ink">
                            {href ? (
                              <Link href={href} className="text-blue-d hover:underline">
                                {v.detalle ?? '—'}
                              </Link>
                            ) : (
                              (v.detalle ?? '—')
                            )}
                          </td>
                          <td className="px-4 py-2.5" style={{ width: 110 }}>
                            {v.arrastrada && <Badge estado="vencido">Vencido</Badge>}
                          </td>
                          <td
                            className={`cifra px-4 py-2.5 text-right font-bold ${
                              (v.monto ?? 0) < 0 ? 'text-errtx' : 'text-oktx'
                            }`}
                            style={{ width: 150 }}
                          >
                            {(v.monto ?? 0) > 0 ? '+' : ''}
                            {formatMoney(v.monto ?? 0)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          )}

          {!diaAbierto && dias.length > 0 && (
            <p className="mt-3 text-[11px] text-muted">
              Clickeá un día para ver qué vence. Los días con franja roja tienen vencimientos que ya
              pasaron y siguen sin resolverse.
            </p>
          )}
        </>
      ) : (
        <>
          <FiltrosUrl filtros={filtros} />

          {filas.length === 0 ? (
            <div className="rounded-md border border-line bg-white px-4 py-12 text-center">
              <p className="text-[12px] font-semibold text-ink">Sin vencimientos</p>
              <p className="mx-auto mt-2 max-w-[52ch] text-[11px] text-muted">
                {params.origen || params.flujo
                  ? 'Ningún vencimiento con esos filtros. Probá con otros.'
                  : 'No hay nada comprometido.'}
              </p>
            </div>
          ) : (
            <>
              <DataTable
                columns={columnasDe(!params.origen && !params.flujo)}
                rows={filas}
                rowKey="clave"
                maxHeight={620}
                emptyMessage="Sin vencimientos."
                // `undefined` y NO `''`: es la diferencia entre «esta fila no
                // navega» y «esta fila navega a ninguna parte». DataTable
                // contempla el primero —«devolver undefined deja esa fila SIN
                // navegación»—; el segundo produce un <Link href=""> que Next
                // rechaza y se lleva puesta la pantalla entera.
                //
                // Con esto, el día que aparezca otro origen sin destino la
                // lista sigue andando: esa fila queda sin link y nada más.
                rowHref={(f) => f.href ?? undefined}
              />
              <p className="mt-3 text-[11px] text-muted">
                {filas.length} {filas.length === 1 ? 'vencimiento' : 'vencimientos'}, del más
                próximo al más lejano. Cada fila abre su origen: la cuenta corriente del equipo, el
                sponsor, el cheque o los gastos.{' '}
                {params.origen || params.flujo ? (
                  <>
                    El acumulado no se muestra al filtrar: corre sobre{' '}
                    <strong className="font-semibold">todos</strong> los vencimientos, no sólo sobre
                    los de este tipo.
                  </>
                ) : (
                  <>
                    El acumulado es <strong className="font-semibold">por día</strong> y se escribe
                    una vez por fecha.
                  </>
                )}
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
