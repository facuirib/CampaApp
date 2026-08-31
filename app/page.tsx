import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import {
  ChartArea,
  KpiCard,
  KpiHero,
  Waterfall,
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

  const [dash, caja, flujo] = await Promise.all([
    torneoElegido
      ? supabase.from('v_dashboard').select('*').eq('torneo_id', torneoElegido).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('v_saldo_caja_total').select('saldo_total').single(),
    supabase
      .from('v_cashflow')
      .select('semana, saldo_proyectado, futura')
      .not('semana', 'is', null)
      .order('semana'),
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

      <section className="mb-7">
        <h2 className="mb-3 text-[13px] font-extrabold tracking-[-.2px] text-ink">
          Evolución de la caja
        </h2>
        <ChartArea serie={serie} titulo="Saldo de caja por semana, real y proyectado" />
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
