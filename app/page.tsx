import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import Exportar from './Exportar'
import {
  ChartArea,
  ChartBarras,
  ChartTorta,
  KpiCard,
  KpiHero,
  DataTable,
  Waterfall,
  type CeldaBadge,
  type ColumnDef,
  type GajoTorta,
  type SerieBarras,
  type PasoWaterfall,
  type PuntoSerie,
  type ValorKpi,
} from '@/components/ui'

/**
 * La pantalla de inicio.
 *
 * Todo número que se ve acá viene calculado de una vista. La pantalla no suma,
 * no resta y no cuenta: `por_cobrar` ya viene restado, `vencido` ya viene
 * filtrado y `equipos_al_dia` ya viene contado. Los `?? 0` no son cálculo —
 * son el valor por defecto cuando la columna llega nula.
 *
 * Tres consultas, cada una a su dominio:
 *
 *   v_dashboard        el torneo activo: cobranza, equipos y resultado
 *   v_saldo_caja_total la caja, que es de la EMPRESA y no del torneo
 *   v_cashflow         la serie semanal, la misma que usa /proyeccion
 */
interface FilaDeuda {
  tercero_id: string | null
  equipo: string
  dias: number
  vencido: number
  adeudado: number
  estado: CeldaBadge
}

const COLUMNAS_DEUDA: ColumnDef<FilaDeuda>[] = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'estado', label: 'Atraso', format: 'badge', width: 110 },
  { key: 'vencido', label: 'Vencido', format: 'money', width: 140 },
  { key: 'adeudado', label: 'Adeudado', format: 'money', width: 140 },
]

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ torneo?: string; anio?: string }>
}) {
  const { torneo: torneoParam, anio: anioParam } = await searchParams
  const supabase = await createClient()

  // El torneo actual, de la ÚNICA definición. Antes esta pantalla hacía
  // `.eq('activo', true).order('torneo').limit(1)`, y eso quedó falso cuando el
  // ciclo de torneo separó los dos significados: `activo` pasó a ser borrado
  // lógico —los tres torneos lo tienen en true— y el orden alfabético elegía
  // «Apertura 2027», que está PLANIFICADO. O sea que el inicio venía mostrando
  // $66.600.000 comprometidos y $0 cobrados de un torneo que no empezó, en vez
  // de los $206.755.000 y $17.212.502 del que está en curso.
  const [{ data: actual }, { data: torneos }] = await Promise.all([
    supabase.from('v_torneo_actual').select('id, nombre').maybeSingle(),
    supabase.from('v_dashboard').select('torneo_id, torneo').order('torneo'),
  ])

  const torneoElegido = torneoParam ?? actual?.id ?? null
  const anio = Number(anioParam) || new Date().getFullYear()

  const [dash, caja, flujo, etapas, plAnual, plMes, medios, cola] = await Promise.all([
    torneoElegido
      ? supabase.from('v_dashboard').select('*').eq('torneo_id', torneoElegido).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('v_saldo_caja_total').select('saldo_total').single(),
    supabase
      .from('v_cashflow')
      .select('semana, saldo_proyectado, futura')
      .not('semana', 'is', null)
      .order('semana'),
    // Las etapas del torneo elegido. Misma fuente que las colas de /cobranza.
    torneoElegido
      ? supabase.from('v_cobranza_etapa').select('*').eq('torneo_id', torneoElegido)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('v_pl_anual_cuenta').select('*').eq('anio', anio).eq('tipo', 'ingreso'),
    supabase.from('v_pl_mensual_total').select('*').eq('anio', anio).order('mes'),
    supabase.from('v_cobro_medio_anio').select('*').eq('anio', anio),
    // Las deudas urgentes: la misma cola que /cobranza, ordenada por atraso.
    // `limit(8)` es un recorte del DASHBOARD, no de la cola — por eso abajo va
    // el link a verlas todas, con el total que quedó afuera.
    torneoElegido
      ? supabase
          .from('v_cobranza_cola')
          .select('*')
          .eq('torneo_id', torneoElegido)
          .order('dias_atraso_maximo', { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [], error: null }),
  ])

  const d = dash.data
  const error = dash.error ?? caja.error ?? flujo.error

  const enCaja = caja.data?.saldo_total ?? 0

  const resumen: ValorKpi[] = [
    { titulo: 'Resultado del torneo', valor: d?.resultado ?? 0 },
    { titulo: 'En caja', valor: enCaja, tono: 'info' },
    { titulo: 'Por cobrar', valor: d?.por_cobrar ?? 0, tono: 'alerta' },
  ]

  const serie: PuntoSerie[] = (flujo.data ?? []).map((f) => ({
    fecha: f.semana as string,
    valor: f.saldo_proyectado ?? 0,
    proyectado: !!f.futura,
  }))

  // ── Los gráficos ─────────────────────────────────────────────────────────
  //
  // Todo lo de acá abajo es MAPEO: cada importe viene sumado de su vista, y la
  // pantalla sólo lo acomoda en la forma que el componente espera. No hay una
  // sola suma, y por eso el dashboard no puede discrepar con el detalle.

  const ROTULO_ETAPA: Record<string, string> = {
    por_vencer: 'Por vencer',
    aviso: 'Primer aviso',
    firme: 'Reclamo firme',
  }

  const filasEtapa = etapas.data ?? []
  const ejeEtapas = filasEtapa.map((e) => ROTULO_ETAPA[e.etapa ?? ''] ?? e.etapa ?? '—')

  // Apiladas: vencido y por vencer SÍ se suman — dan el adeudado de la etapa.
  const seriesCobranza: SerieBarras[] = [
    { label: 'Vencido', color: 'var(--err)', valores: filasEtapa.map((e) => Number(e.vencido ?? 0)) },
    { label: 'Por vencer', color: 'var(--warn)', valores: filasEtapa.map((e) => Number(e.por_vencer ?? 0)) },
  ]

  // La dona de etapas usa color semántico: acá el color SÍ dice algo.
  const COLOR_ETAPA: Record<string, string> = {
    por_vencer: 'var(--ok)',
    aviso: 'var(--warn)',
    firme: 'var(--err)',
  }
  const gajosEtapa: GajoTorta[] = filasEtapa.map((e) => ({
    label: ROTULO_ETAPA[e.etapa ?? ''] ?? e.etapa ?? '—',
    valor: Number(e.equipos ?? 0),
    color: COLOR_ETAPA[e.etapa ?? ''],
  }))

  const meses = plMes.data ?? []
  const ejeMeses = meses.map((m) => String(m.mes).padStart(2, '0'))
  const seriesIngresoGasto: SerieBarras[] = [
    { label: 'Ingresos', color: 'var(--ok)', valores: meses.map((m) => Number(m.ingresos ?? 0)) },
    // Los egresos vienen POSITIVOS de la vista —es lo que gastó— y se dibujan
    // hacia abajo: el signo es del gráfico, no del dato.
    { label: 'Gastos', color: 'var(--err)', valores: meses.map((m) => -Number(m.egresos ?? 0)) },
  ]

  // Paleta por posición: «Ingresos por partidos» no es mejor ni peor que
  // «Ingresos sponsors», así que el color no debe sugerir nada.
  const gajosIngreso: GajoTorta[] = (plAnual.data ?? [])
    .map((c) => ({ label: c.nombre ?? '—', valor: Number(c.monto ?? 0) }))

  const ROTULO_MEDIO: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    cheque: 'Cheque',
  }
  const gajosMedio: GajoTorta[] = (medios.data ?? []).map((m) => ({
    label: ROTULO_MEDIO[m.medio_pago ?? ''] ?? m.medio_pago ?? '—',
    valor: Number(m.total ?? 0),
  }))

  // ── Deudas urgentes ──────────────────────────────────────────────────────
  //
  // Mapeo puro de v_cobranza_cola, la misma que alimenta las colas de
  // /cobranza. El corte a 8 filas es del dashboard, no de los datos, así que se
  // dice cuántas quedaron afuera en vez de que parezcan no existir.
  const URGENTES = 8
  const filasCola = cola.data ?? []
  const urgentes: FilaDeuda[] = filasCola.slice(0, URGENTES).map((c) => ({
    tercero_id: c.tercero_id,
    equipo: c.equipo ?? '—',
    dias: c.dias_atraso_maximo ?? 0,
    vencido: Number(c.total_vencido ?? 0),
    adeudado: Number(c.total_adeudado ?? 0),
    estado:
      (c.dias_atraso_maximo ?? 0) > 30
        ? { estado: 'vencido', label: `${c.dias_atraso_maximo} días` }
        : (c.dias_atraso_maximo ?? 0) > 0
          ? { estado: 'porVencer', label: `${c.dias_atraso_maximo} días` }
          : { estado: 'ok', label: 'Al día' },
  }))
  const restantes = Math.max(filasCola.length - URGENTES, 0)

  // Los tres salen de la misma fila y reconcilian por construcción:
  // por_cobrar es sum(monto − imputado), o sea comprometido − cobrado.
  const puente: PasoWaterfall[] = [
    { titulo: 'Comprometido', valor: d?.comprometido ?? 0, rol: 'suma' },
    { titulo: 'Por cobrar', valor: d?.por_cobrar ?? 0, rol: 'resta' },
    { titulo: 'Cobrado', valor: d?.cobrado ?? 0, rol: 'resultado' },
  ]

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Inicio</h1>
        <p className="mt-1 text-[12px] text-muted">
          {d ? `${d.torneo} — el estado del torneo y de la caja, hoy.` : 'El estado de la caja, hoy.'}
        </p>

        {/* El selector de torneo. Va en la URL como el resto de los filtros del
            proyecto, así una vista del dashboard se comparte por link. */}
        {(torneos ?? []).length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(torneos ?? []).map((t) => {
              const esta = t.torneo_id === torneoElegido
              return (
                <Link
                  key={t.torneo_id}
                  href={t.torneo_id === actual?.id ? '/' : `/?torneo=${t.torneo_id}`}
                  className={[
                    'rounded-pill border px-2.5 py-1 text-[10.5px] font-bold transition-colors',
                    esta
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-white text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {t.torneo}
                  {t.torneo_id === actual?.id && ' · en curso'}
                </Link>
              )
            })}
          </div>
        )}

        {/* Sin torneo en curso NO se inventa uno: se dice. Mismo criterio que
            la ficha del equipo desde que existe el ciclo de torneo. */}
        {!actual && !torneoParam && (
          <p className="mt-2 rounded-md bg-warnbg px-3 py-2 text-[11px] text-warntx">
            <strong className="font-bold">No hay ningún torneo en curso.</strong> Los números de
            cobranza quedan vacíos hasta que se inicie uno; los de caja y resultado no dependen del
            torneo y siguen siendo los de siempre.
          </p>
        )}
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      <div className="mb-6">
        <KpiHero valores={resumen} />
      </div>

      <div className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <KpiCard
          tono="positivo"
          titulo="En caja hoy"
          valor={enCaja}
          icon="caja"
          subtitulo="Caja real, sin proyectar"
        />
        <KpiCard
          tono="alerta"
          titulo="Deuda vencida"
          valor={d?.vencido ?? 0}
          icon="alerta"
          subtitulo="Vencida e impaga"
        />
        <KpiCard
          tono="info"
          titulo="Por vencer"
          valor={d?.por_vencer ?? 0}
          icon="calendario"
          subtitulo="Todavía no vencido"
        />
        <KpiCard
          tono="info"
          titulo="Equipos al día"
          valor={d?.equipos_al_dia ?? 0}
          formato="entero"
          icon="equipos"
          subtitulo={`de ${d?.equipos_total ?? 0} equipos`}
        />
      </div>

      {/* ── Banda de cobranza ─────────────────────────────────────────────
          🔴 El alcance está ESCRITO, y no es un detalle de estilo.

          Un solo filtro que rija toda la pantalla es imposible sin mentir: la
          caja es de la EMPRESA y no de un torneo, y el P&L es del año. Si el
          selector de torneo dijera «filtra todo», habría paneles que lo ignoran
          en silencio — que es la forma exacta en que un filtro parcial esconde
          plata.

          Así que hay dos alcances y cada banda dice cuál es el suyo. */}
      {d && (
        <section className="mb-7">
          <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            Cobranza · {d.torneo}
          </h2>
          <p className="mb-3 text-[11px] text-muted">
            De las mismas colas que{' '}
            <Link href="/cobranza" className="font-semibold text-blue-d hover:underline">
              Cobranza
            </Link>
            : cada equipo cuenta en UNA etapa, la más severa.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartBarras
              ejeX={ejeEtapas}
              series={seriesCobranza}
              modo="apiladas"
              alto={230}
              titulo="Deuda por etapa de cobranza, vencida y por vencer"
            />
            <ChartTorta
              gajos={gajosEtapa}
              centro={{ valor: String(d.equipos_total ?? 0), nota: 'equipos' }}
              titulo="Equipos por etapa de cobranza"
            />
          </div>
        </section>
      )}

      {/* ── Banda de finanzas: el año, no el torneo ─────────────────────── */}
      <section className="mb-7">
        <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
          Finanzas · {anio}
        </h2>
        <p className="mb-3 text-[11px] text-muted">
          De las mismas vistas que{' '}
          <Link href="/resultados" className="font-semibold text-blue-d hover:underline">
            Resultados
          </Link>
          . <strong className="font-semibold text-ink">No dependen del torneo</strong>: el
          resultado es de la empresa.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartBarras
            ejeX={ejeMeses}
            series={seriesIngresoGasto}
            modo="agrupadas"
            alto={230}
            titulo={`Ingresos contra gastos por mes, ${anio}`}
          />
          <ChartTorta gajos={gajosIngreso} titulo={`Composición de los ingresos ${anio}`} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartTorta gajos={gajosMedio} titulo={`Cómo se cobró en ${anio}`} />
          <div className="rounded-md border border-line bg-white p-4 text-[11px] leading-relaxed text-muted">
            <strong className="font-bold text-ink">Cómo se cobró</strong> sale de los pagos
            registrados, no de lo que cada equipo pactó al inscribirse. Lo pactado está en el
            historial de cada equipo; lo interesante es el desvío entre una cosa y la otra.
          </div>
        </div>
      </section>

      {/* ── Banda de caja: la empresa, hoy ──────────────────────────────── */}
      <section className="mb-7">
        <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
          Caja · la empresa, hoy
        </h2>
        <p className="mb-3 text-[11px] text-muted">
          La misma serie que{' '}
          <Link href="/proyeccion" className="font-semibold text-blue-d hover:underline">
            Proyección
          </Link>
          . No depende del torneo ni del año elegidos.
        </p>
        <ChartArea serie={serie} titulo="Saldo de caja por semana, real y proyectado" />
      </section>

      {urgentes.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            Deudas urgentes
          </h2>
          <p className="mb-3 text-[11px] text-muted">
            Las de mayor atraso, de la misma cola que{' '}
            <Link href="/cobranza" className="font-semibold text-blue-d hover:underline">
              Cobranza
            </Link>
            . Cada fila abre la ficha del equipo.
          </p>
          <DataTable
            columns={COLUMNAS_DEUDA}
            rows={urgentes}
            rowKey={(f, i) => f.tercero_id ?? i}
            rowHref={(f) => (f.tercero_id ? `/equipos/${f.tercero_id}` : undefined)}
            emptyMessage="Ningún equipo con deuda."
          />
          {/* El corte es del dashboard, no de los datos: decir cuántas quedaron
              afuera evita que ocho filas se lean como «son ocho». */}
          {restantes > 0 && (
            <p className="mt-2 text-[11px] text-muted">
              Hay {restantes} equipo{restantes === 1 ? '' : 's'} más con deuda.{' '}
              <Link href="/cobranza" className="font-semibold text-blue-d hover:underline">
                Verlos todos
              </Link>
            </p>
          )}
        </section>
      )}

      <section className="mb-7">
        <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">Exportar</h2>
        <p className="mb-3 text-[11px] text-muted">
          Los datos de los paneles, en planilla. Salen de las mismas vistas que la pantalla, así
          que <strong className="font-semibold text-ink">no traen el recorte</strong>: la cobranza
          baja los 27 equipos, no los 8 que se ven arriba.
        </p>
        <Exportar torneoId={torneoElegido} anio={anio} />
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-[13px] font-extrabold tracking-[-.2px] text-ink">
          De lo comprometido a lo cobrado
        </h2>
        <Waterfall pasos={puente} titulo="Puente entre lo comprometido y lo cobrado" />
      </section>
    </div>
  )
}
