import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { formatMoney } from '@/lib/format'
import { etapaCobranza, etiquetaEtapa } from '@/lib/domain/cobranza'
import Exportar from './Exportar'
import {
  ChartArea,
  ChartBarras,
  ChartBarrasH,
  ChartTorta,
  KpiCard,
  DataTable,
  Icon,
  Waterfall,
  type CeldaBadge,
  type ColumnDef,
  type GajoTorta,
  type NombreIcono,
  type SerieBarras,
  type PasoWaterfall,
  type PuntoSerie,
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
/**
 * El encabezado de un bloque: ícono, título y el link a la pantalla que resuelve.
 *
 * Del mockup: los íconos por bloque y el «Ver X →». Los dos ayudan y son
 * baratos — el ícono da el ancla visual para encontrar un panel en una pantalla
 * larga, y el link dice dónde se hace algo con lo que el panel muestra.
 */
function Bloque({
  icono,
  titulo,
  href,
  verTexto,
  children,
  pie,
}: {
  icono: NombreIcono
  titulo: string
  href?: string
  verTexto?: string
  children: React.ReactNode
  /** La frase al pie. Sale del dato: si es null, no se dibuja. */
  pie?: string | null
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[12.5px] font-extrabold tracking-[-.2px] text-ink">
          <Icon name={icono} size={15} className="text-muted" />
          {titulo}
        </h3>
        {href && (
          <Link href={href} className="shrink-0 text-[10.5px] font-semibold text-blue-d hover:underline">
            {verTexto ?? 'Ver'} →
          </Link>
        )}
      </div>
      {children}
      {pie && <p className="mt-2 text-[10.5px] italic leading-snug text-muted">{pie}</p>}
    </section>
  )
}

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

  const mesEnCurso = new Date().toISOString().slice(0, 7)

  const [dash, caja, flujo, etapas, plAnual, plMes, medios, cola, gastosCat, gastosDia, cajas] =
    await Promise.all([
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
    // Por SEMANA y no por mes: es lo que pide el panel de ingresos vs gastos.
    // `v_pl_semanal_total` es la mensual con otro corte temporal —mismo origen,
    // misma convención de signo—, verificado que los totales del año dan
    // idénticos por las dos vías.
    supabase.from('v_pl_semanal_total').select('*').eq('anio', anio).order('semana'),
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
    // Composición de gastos: la vista ya existía, sólo faltaba el bloque.
    supabase.from('v_gasto_categoria_mes').select('*').eq('anio', anio),
    // Cuándo sale la plata, día por día del mes en curso.
    supabase
      .from('v_gasto_dia_mes')
      .select('*')
      .eq('anio', Number(mesEnCurso.slice(0, 4)))
      .eq('mes', Number(mesEnCurso.slice(5, 7)))
      .order('dia'),
    // Cuánta plata hay en cada caja. La MISMA vista que /caja, así que los dos
    // números son el mismo número (A2).
    supabase.from('v_saldo_caja').select('nombre, saldo').order('saldo', { ascending: false }),
  ])

  const d = dash.data
  const error = dash.error ?? caja.error ?? flujo.error

  const enCaja = caja.data?.saldo_total ?? 0

  // La banda oscura de tres números (KpiHero) se sacó: sus tres valores
  // —resultado, en caja, por cobrar— viven ahora como tarjetas en la única fila
  // de KPIs, con su link. Ningún dato se perdió; «En caja» dejó de estar dos
  // veces en la misma pantalla.

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

  // Las etiquetas salen de `lib/domain/cobranza`, que es la misma fuente que
  // usan las colas de /cobranza y el historial de avisos. Acá había un mapa a
  // mano que rotulaba una etapa `aviso` inexistente —el valor real de la base es
  // `recordatorio`—, y por eso esa etapa se iba a dibujar con el valor crudo y
  // sin color en cuanto cayera alguien en ella.
  const filasEtapa = etapas.data ?? []
  const ejeEtapas = filasEtapa.map((e) => etiquetaEtapa(e.etapa))

  // Apiladas: vencido y por vencer SÍ se suman — dan el adeudado de la etapa.
  const seriesCobranza: SerieBarras[] = [
    { label: 'Vencido', color: 'var(--err)', valores: filasEtapa.map((e) => Number(e.vencido ?? 0)) },
    { label: 'Por vencer', color: 'var(--warn)', valores: filasEtapa.map((e) => Number(e.por_vencer ?? 0)) },
  ]

  // La dona de etapas usa color semántico: acá el color SÍ dice algo. Sale de
  // la misma tabla que la etiqueta, así que no pueden desalinearse.
  const gajosEtapa: GajoTorta[] = filasEtapa.map((e) => ({
    label: etiquetaEtapa(e.etapa),
    valor: Number(e.equipos ?? 0),
    color: etapaCobranza(e.etapa)?.color,
  }))

  // ── Ingresos vs gastos, por semana ───────────────────────────────────────
  //
  // El corte a las últimas 12 es del DASHBOARD, no de los datos: un año son 52
  // filas horizontales y eso no es un panel, es una tabla. Se dice cuántas
  // quedaron afuera, igual que con las deudas urgentes.
  //
  // Las 12 más recientes, pero dibujadas de la más vieja a la más nueva: se lee
  // hacia abajo como avanza el tiempo.
  const SEMANAS = 12
  const semanasTodas = plMes.data ?? []
  const semanas = semanasTodas.slice(-SEMANAS)
  const semanasFuera = Math.max(semanasTodas.length - SEMANAS, 0)

  const ejeSemanas = semanas.map((s) => {
    const [, m, dd] = String(s.semana).split('-')
    return `Sem. ${dd}/${m}`
  })
  // 🔴 Los dos POSITIVOS, al revés que en la versión vertical. Allá el gasto se
  // dibujaba hacia abajo porque compartían el eje cero; acá son dos barras
  // lado a lado y lo que se compara es el LARGO. Un gasto hacia la izquierda se
  // leería como un gasto negativo.
  const seriesIngresoGasto: SerieBarras[] = [
    { label: 'Ingresos', color: 'var(--ok)', valores: semanas.map((s) => Number(s.ingresos ?? 0)) },
    { label: 'Gastos', color: 'var(--err)', valores: semanas.map((s) => Number(s.egresos ?? 0)) },
  ]

  // ── Cuánta plata hay en cada caja ────────────────────────────────────────
  //
  // Mapeo de v_saldo_caja, la misma vista que dibuja /caja. Una sola serie, así
  // que el gráfico escribe el saldo al final de cada barra.
  const filasCaja = cajas.data ?? []
  const ejeCajas = filasCaja.map((c) => c.nombre ?? 'Caja')
  const serieCajas: SerieBarras[] = [
    { label: 'Saldo', color: 'var(--blue)', valores: filasCaja.map((c) => Number(c.saldo ?? 0)) },
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

  // ── Composición de gastos, y cuándo sale la plata ────────────────────────
  //
  // Mapeo, no cálculo: cada importe viene sumado de su vista.
  const gajosGasto: GajoTorta[] = (gastosCat.data ?? [])
    .filter((g) => Number(g.total ?? 0) > 0)
    .map((g) => ({ label: g.categoria ?? '—', valor: Number(g.total ?? 0) }))

  const diasGasto = gastosDia.data ?? []
  const ejeDias = diasGasto.map((d) => String(d.dia))
  const seriesGasto: SerieBarras[] = [
    // Dos series y no una: «ya salió» y «va a salir» son cosas distintas, y
    // apilarlas sin distinguirlas convertiría una previsión en un hecho.
    { label: 'Ya pagado', color: 'var(--err)', valores: diasGasto.map((d) => Number(d.pagado ?? 0)) },
    {
      label: 'Comprometido',
      color: 'var(--warn)',
      valores: diasGasto.map((d) => Number(d.comprometido ?? 0)),
    },
  ]

  // ── Las frases al pie ────────────────────────────────────────────────────
  //
  // 🔴 Salen del DATO, no escritas a mano. Una frase como «el efectivo es el
  // medio dominante» es verdadera hoy y puede dejar de serlo el mes que viene:
  // hardcodearla la convierte en una mentira con fecha de vencimiento. Si el
  // dato no alcanza para afirmar algo, no se afirma nada.
  const medioMayor = [...gajosMedio].sort((a, b) => b.valor - a.valor)[0]
  const totalMedios = gajosMedio.reduce((a, g) => a + g.valor, 0)
  const fraseMedios =
    medioMayor && totalMedios > 0
      ? `${medioMayor.label} concentra el ${Math.round((medioMayor.valor / totalMedios) * 100)}% de lo cobrado.`
      : null

  /**
   * «X se lleva el N% de …», para el pie de una dona.
   *
   * 🔴 El `reduce` es sobre los gajos que la dona YA está dibujando, y el
   * resultado es un porcentaje para una frase — no un total de plata que salga
   * a pantalla. El total que se muestra lo calcula la dona en su propio centro,
   * sobre los mismos gajos. La regla 1 prohíbe que la pantalla invente un
   * número; acá no hay ninguno que no esté ya en el gráfico.
   *
   * Una sola función y no dos copias: las dos composiciones dicen lo mismo con
   * distinto sustantivo, y separadas se iban a desincronizar como se
   * desincronizaron los mapas de etapas.
   */
  const fraseConcentracion = (gajos: GajoTorta[], sufijo: string) => {
    const mayor = [...gajos].sort((a, b) => b.valor - a.valor)[0]
    const total = gajos.reduce((a, g) => a + g.valor, 0)
    if (!mayor || total <= 0) return null
    return `${mayor.label} se lleva el ${Math.round((mayor.valor / total) * 100)}% ${sufijo}`
  }

  const fraseGastos = fraseConcentracion(gajosGasto, 'del gasto.')
  const fraseIngresos = fraseConcentracion(gajosIngreso, 'de lo que entra.')

  const diaPico = [...diasGasto].sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0))[0]
  const fraseDias =
    diaPico && Number(diaPico.total ?? 0) > 0
      ? `El día ${diaPico.dia} es el de mayor salida del mes.`
      : null

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

      {/* ── Los KPIs ───────────────────────────────────────────────────────
          Una sola fila, y antes eran dos: arriba una banda oscura con tres
          números y abajo cuatro tarjetas blancas. Dos formas distintas para la
          misma clase de dato —un número con su rótulo— obligaban a leer la
          pantalla dos veces, y «En caja» aparecía en las dos.

          🔴 Cada una LLEVA a la pantalla que la explica. Un KPI es la punta de
          un hilo: dice cuánto, y el detalle dice de qué está hecho. Sin el
          link, ese hilo se corta y hay que buscar el camino por el menú.

          Los números no cambiaron: son los mismos de `v_dashboard` y
          `v_saldo_caja_total` que ya estaban (A2). */}
      <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        <KpiCard
          href="/resultados"
          tono={(d?.resultado ?? 0) >= 0 ? 'positivo' : 'alerta'}
          titulo="Resultado del torneo"
          valor={d?.resultado ?? 0}
          icon="resultados"
          subtitulo="Cobrado menos gastos"
        />
        <KpiCard
          href="/caja"
          tono="positivo"
          titulo="En caja hoy"
          valor={enCaja}
          icon="caja"
          subtitulo="Caja real, sin proyectar"
        />
        <KpiCard
          href="/cobranza"
          tono="info"
          titulo="Por cobrar"
          valor={d?.por_cobrar ?? 0}
          icon="cobranza"
          subtitulo="Vencido y por vencer"
        />
        <KpiCard
          href="/cobranza"
          tono="alerta"
          titulo="Deuda vencida"
          valor={d?.vencido ?? 0}
          icon="alerta"
          subtitulo="Vencida e impaga"
        />
        <KpiCard
          href="/equipos"
          tono="info"
          titulo="Equipos al día"
          valor={d?.equipos_al_dia ?? 0}
          formato="entero"
          icon="equipos"
          subtitulo={`de ${d?.equipos_total ?? 0} equipos`}
        />
      </div>

      {/* ── Evolución de caja · el gráfico PRINCIPAL ────────────────────────
          Arriba de todo y a ancho completo, porque es la única pregunta que se
          contesta sola de un vistazo: si la caja sube o baja. Estaba anteúltimo
          y del mismo tamaño que los cinco gráficos de apoyo, así que había que
          bajar toda la pantalla para llegar a lo más importante.

          Su alcance es la EMPRESA y no el torneo, y por eso lo dice: el
          selector de arriba no lo toca. */}
      <section className="mb-7">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="flex items-center gap-1.5 text-[14px] font-extrabold tracking-[-.2px] text-ink">
            <Icon name="proyeccion" size={16} className="text-muted" />
            Evolución de la caja
          </h2>
          <Link
            href="/proyeccion"
            className="shrink-0 text-[10.5px] font-semibold text-blue-d hover:underline"
          >
            Ver flujo →
          </Link>
        </div>
        <p className="mb-3 text-[11px] text-muted">
          La misma serie que{' '}
          <Link href="/proyeccion" className="font-semibold text-blue-d hover:underline">
            Proyección
          </Link>
          , semana por semana: lo real y lo proyectado.{' '}
          <strong className="font-semibold text-ink">Es de la empresa</strong> — no depende del
          torneo ni del año elegidos.
        </p>
        <ChartArea serie={serie} alto={380} titulo="Saldo de caja por semana, real y proyectado" />

        {/* ── Dónde está esa plata ──────────────────────────────────────────
            La curva de arriba dice cuánto hay en total; ésta, en qué caja está.
            Son la misma pregunta a dos niveles y por eso van juntas: el saldo
            total no dice nada sobre si la plata está donde hace falta.

            Horizontal porque las cajas tienen nombre —«Bar Efectivo
            Aeropuerto»— y en vertical no entra ninguno. Y porque hay una en
            −$48M: el eje ubica el cero según el rango, así que esa barra sale
            para el otro lado en vez de apoyarse contra el borde. */}
        <div className="mt-4">
          <Bloque icono="caja" titulo="Dónde está la plata" href="/caja" verTexto="Ver cajas">
            <ChartBarrasH
              categorias={ejeCajas}
              series={serieCajas}
              anchoEtiqueta={190}
              titulo="Saldo de cada caja"
            />
          </Bloque>
        </div>
      </section>

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
            <Bloque
              icono="calendario"
              titulo="Cobranza por vencimiento"
              href="/cobranza"
              verTexto="Ver cuentas"
            >
              <ChartBarras
                ejeX={ejeEtapas}
                series={seriesCobranza}
                modo="apiladas"
                alto={230}
                titulo="Deuda por etapa de cobranza, vencida y por vencer"
              />
            </Bloque>

            <Bloque
              icono="equipos"
              titulo="Estado de equipos"
              href="/equipos"
              verTexto="Ver equipos"
            >
              {/* Barras de progreso, como el mockup: con tres categorías se
                  comparan mejor que en una dona, porque el ojo compara largos
                  mucho mejor que ángulos. */}
              <div className="rounded-md border border-line bg-white p-4">
                {gajosEtapa.map((g) => {
                  const pct =
                    (d.equipos_total ?? 0) > 0
                      ? Math.round((g.valor / (d.equipos_total ?? 1)) * 100)
                      : 0
                  return (
                    <div key={g.label} className="mb-3 last:mb-0">
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="text-muted">{g.label}</span>
                        <span className="font-bold text-ink">
                          {g.valor} equipo{g.valor === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className="block h-1.5 overflow-hidden rounded-pill bg-line2">
                        <span
                          className="block h-full rounded-pill"
                          style={{ width: `${pct}%`, background: g.color }}
                        />
                      </span>
                    </div>
                  )
                })}
                <div className="mt-4 flex gap-4 border-t border-line pt-3">
                  <div className="flex-1 text-center">
                    <div className="text-[20px] font-extrabold text-blue">
                      {d.equipos_total ?? 0}
                    </div>
                    <div className="text-[9px] text-muted">equipos</div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="text-[20px] font-extrabold text-blue">
                      {d.equipos_al_dia ?? 0}
                    </div>
                    <div className="text-[9px] text-muted">al día</div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="text-[20px] font-extrabold text-blue">
                      {d.equipos_en_mora ?? 0}
                    </div>
                    <div className="text-[9px] text-muted">en mora</div>
                  </div>
                </div>
              </div>
            </Bloque>
          </div>

          {/* El puente vive acá y no suelto al final de la pantalla: es de
              cobranza —comprometido, por cobrar, cobrado del torneo— y a 700px
              de distancia de la banda que lo explica quedaba como un gráfico
              huérfano. Ocupa la fila entera, así que además cierra la banda sin
              dejar hueco. */}
          <div className="mt-4">
            <Bloque
              icono="cobranza"
              titulo="De lo comprometido a lo cobrado"
              href="/cobranza"
              verTexto="Ver cobranza"
            >
              <Waterfall pasos={puente} titulo="Puente entre lo comprometido y lo cobrado" />
            </Bloque>
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
        {/* ── Ingresos vs gastos, por semana y en horizontal ────────────────
            Ancho completo: es el único de la banda que compara dos magnitudes
            a lo largo del tiempo.

            🔴 Por SEMANA y no por mes calendario. La decisión de la Ola 3 —mes
            calendario— era sobre qué balde usar contra la alternativa de la
            JORNADA del torneo, y eso sigue igual: esto se sigue midiendo por
            fecha del calendario y no por fecha del fixture. Lo que cambia es el
            tamaño del balde.

            La semana sale de `v_pl_semanal_total`, una vista nueva: no se
            reusó `v_cashflow.entradas/salidas`, que ya tenía semana, porque
            mide CAJA y este panel muestra RESULTADO. Para los ingresos
            coinciden —el ingreso se reconoce al cobrar— pero para los gastos
            no: el gasto se devenga al cargarlo y se paga después. Habría
            cambiado el significado del gráfico con la excusa de cambiarle la
            granularidad. */}
        <div className="mb-4">
          <Bloque
            icono="resultados"
            titulo="Ingresos vs gastos por semana"
            href="/resultados"
            verTexto="Ver resultados"
            pie={
              semanasFuera > 0
                ? `Las últimas ${SEMANAS} semanas con movimiento. Hay ${semanasFuera} anteriores en ${anio}, en Resultados.`
                : null
            }
          >
            <ChartBarrasH
              categorias={ejeSemanas}
              series={seriesIngresoGasto}
              modo="agrupadas"
              anchoEtiqueta={110}
              titulo={`Ingresos contra gastos por semana, ${anio}`}
            />
          </Bloque>
        </div>

        {/* ── Las dos composiciones, una al lado de la otra ─────────────────
            Estaban separadas por «Cómo cobran los equipos», así que para
            comparar de qué está hecho lo que entra contra lo que sale había que
            saltear un panel del medio. Son la misma pregunta espejada y ahora
            se leen juntas.

            🔴 Y son del MISMO alto por construcción, no por casualidad: las dos
            usan `leyendaAlLado`, que fija la proporción del lienzo. Con la
            leyenda apilada abajo, el alto crecía con la cantidad de categorías
            —los ingresos tienen tres cuentas y los gastos siete—, así que una
            salía casi al doble que la otra. */}
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Bloque
            icono="monedas"
            titulo="Composición de ingresos"
            href="/resultados"
            verTexto="Ver resultados"
            pie={fraseIngresos}
          >
            <ChartTorta
              gajos={gajosIngreso}
              leyendaAlLado
              titulo={`Composición de los ingresos ${anio}`}
            />
          </Bloque>

          {/* Teníamos la de ingresos y no la de egresos. La vista
              v_gasto_categoria_mes ya existía: faltaba el panel. */}
          <Bloque
            icono="comprobante"
            titulo="Composición de gastos"
            href="/gastos"
            verTexto="Ver gastos"
            pie={fraseGastos}
          >
            <ChartTorta
              gajos={gajosGasto}
              leyendaAlLado
              titulo={`Composición de los gastos ${anio}`}
            />
          </Bloque>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Bloque icono="caja" titulo="Cómo cobran los equipos" href="/cobranza" pie={fraseMedios}>
            {/* Barra apilada horizontal y no dona, como el mockup: con tres
                medios, una barra deja comparar proporciones de un vistazo y
                ocupa un tercio del alto. */}
            <div className="rounded-md border border-line bg-white p-4">
              <div className="mb-3 flex h-6 overflow-hidden rounded-md">
                {gajosMedio.map((m, i) => {
                  const pct = totalMedios > 0 ? (m.valor / totalMedios) * 100 : 0
                  const color = ['var(--ok)', 'var(--blue)', 'var(--flyway)'][i % 3]
                  return (
                    <div
                      key={m.label}
                      title={m.label}
                      style={{ width: `${pct}%`, background: color }}
                      className="flex items-center justify-center"
                    >
                      {pct > 12 && (
                        <span className="text-[9px] font-bold text-white">{Math.round(pct)}%</span>
                      )}
                    </div>
                  )
                })}
              </div>
              {gajosMedio.map((m, i) => (
                <div key={m.label} className="flex items-center gap-2 py-1 text-[11px]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: ['var(--ok)', 'var(--blue)', 'var(--flyway)'][i % 3] }}
                  />
                  <span className="flex-1 text-muted">{m.label}</span>
                  <span className="cifra font-bold text-ink">{formatMoney(m.valor)}</span>
                </div>
              ))}
              <p className="mt-2 text-[10.5px] leading-snug text-muted">
                Sale de los pagos registrados, no de lo que cada equipo pactó al inscribirse. Lo
                pactado está en el historial del equipo; lo interesante es el desvío.
              </p>
            </div>
          </Bloque>

          {/* ── Bloque nuevo · cuándo sale la plata ──────────────────────────
              🔴 NO se llama «día de vencimiento», como el mockup: en CAMPA un
              gasto no tiene esa fecha. Tiene cuándo se reconoció y cuándo se
              pagó. Copiar esa etiqueta inventaría una obligación con fecha que
              el modelo no tiene. */}
          <Bloque
            icono="calendario"
            titulo="Cuándo sale la plata este mes"
            href="/calendario-pagos"
            verTexto="Ver calendario"
            pie={fraseDias}
          >
            <ChartBarras
              ejeX={ejeDias}
              series={seriesGasto}
              modo="apiladas"
              alto={200}
              maxEtiquetasX={16}
              titulo="Salidas por día del mes: pagado y comprometido"
            />
          </Bloque>
        </div>
      </section>

      {/* La banda de caja subió al tope de la pantalla como gráfico principal.
          Acá quedaba anteúltima y del mismo tamaño que los de apoyo. */}

      {urgentes.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-1 flex items-center gap-1.5 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            <Icon name="alerta" size={15} className="text-errtx" />
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
    </div>
  )
}
