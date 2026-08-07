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
export default async function Home() {
  const supabase = await createClient()

  const [dash, caja, flujo] = await Promise.all([
    // Si por un error de datos hubiera más de un torneo activo, se toma uno
    // solo y de forma determinista en vez de reventar la pantalla.
    supabase
      .from('v_dashboard')
      .select('*')
      .eq('activo', true)
      .order('torneo')
      .limit(1)
      .maybeSingle(),
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
          {d
            ? `${d.torneo} — el estado del torneo y de la caja, hoy.`
            : 'No hay ningún torneo activo.'}
        </p>
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
