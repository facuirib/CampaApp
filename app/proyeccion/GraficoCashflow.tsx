import { ChartArea, ChartBarras, type PuntoSerie, type SerieBarras } from '@/components/ui'

export interface PeriodoGrafico {
  /** ISO: el lunes de la semana, o el 1º del mes. */
  fecha: string
  saldo: number
  entradas: number
  salidas: number
  proyectado: boolean
  incompleto: boolean
}

/** "17 nov" para una semana, "11/2026" para un mes — mismo criterio de
 *  brevedad que `ChartArea` usa puertas adentro (`fechaCorta`, no exportada),
 *  pero acá hace falta como string plano: `ChartBarras.ejeX` no formatea
 *  fechas por su cuenta, a diferencia de `ChartArea.serie[].fecha`. */
function etiquetaEje(fecha: string, granularidad: 'semana' | 'mes'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (!m) return fecha
  const [, aaaa, mm, dd] = m
  if (granularidad === 'mes') return `${mm}/${aaaa}`
  const d = new Date(Date.UTC(Number(aaaa), Number(mm) - 1, Number(dd)))
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
}

/** Una muestra de color + texto, para la leyenda que `ChartArea` no dibuja
 *  (su `titulo` es sólo el `aria-label` del SVG, invisible en pantalla). */
function LeyendaItem({
  color,
  texto,
  punteado = false,
}: {
  color: string
  texto: string
  punteado?: boolean
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-[2px] w-4 shrink-0 rounded-full"
        style={
          punteado
            ? {
                backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`,
              }
            : { backgroundColor: color }
        }
      />
      {texto}
    </span>
  )
}

/**
 * El gráfico principal de `/proyeccion` — dos piezas, no una:
 *
 * **La curva de saldo**, con la leyenda que `ChartArea` nunca dibujó — hoy
 * `sólido/punteado/ámbar` se lee sin explicación, y quien no conoce la
 * pantalla no tiene forma de saber qué significa cada trazo.
 *
 * **La composición de cada período**, debajo: `ChartBarras` (ya existe, ya la
 * usa `/calendario-pagos` para exactamente esto) mostrando entradas y salidas
 * lado a lado. La curva de arriba sólo muestra el RESULTANTE acumulado — dos
 * semanas con el mismo saldo final pueden venir de mover $100 o de mover
 * $10M, y la curva sola no distingue una de la otra.
 *
 * Es un componente propio de esta pantalla, no de `components/ui/`: así el
 * rediseño no le cambia el color a ningún otro gráfico del proyecto que use
 * `ChartArea` tal como está (Inicio, etc.).
 */
export default function GraficoCashflow({
  periodos,
  granularidad,
}: {
  periodos: PeriodoGrafico[]
  granularidad: 'semana' | 'mes'
}) {
  const serieSaldo: PuntoSerie[] = periodos.map((p) => ({
    fecha: p.fecha,
    valor: p.saldo,
    proyectado: p.proyectado,
    incompleto: p.incompleto,
  }))

  const ejeX = periodos.map((p) => etiquetaEje(p.fecha, granularidad))

  const seriesComposicion: SerieBarras[] = [
    { label: 'Entra', color: 'var(--ok)', valores: periodos.map((p) => p.entradas) },
    { label: 'Sale', color: 'var(--err)', valores: periodos.map((p) => p.salidas) },
  ]

  const unidad = granularidad === 'mes' ? 'mes' : 'semana'

  return (
    <div className="mb-6">
      <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
        Saldo de caja proyectado por {unidad}
      </h2>
      <p className="mb-2 max-w-[76ch] text-[11px] leading-relaxed text-muted">
        La línea es el saldo <strong className="font-semibold text-ink">acumulado</strong> —cada
        punto ya contiene a los anteriores—, no el movimiento de ese {unidad} solo.
      </p>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-muted">
        <LeyendaItem color="var(--night)" texto="Real" />
        <LeyendaItem color="var(--flyway)" texto="Proyectado" punteado />
        <LeyendaItem color="var(--warn)" texto="Incompleto — sin gasto estimado" punteado />
        <LeyendaItem color="var(--err)" texto="Bajo cero" />
      </div>

      <ChartArea
        className="mb-4"
        serie={serieSaldo}
        titulo={`Saldo de caja proyectado por ${unidad}`}
      />

      <h3 className="mb-1 text-[12px] font-extrabold tracking-[-.2px] text-ink">
        Cómo se compone cada {unidad}
      </h3>
      <p className="mb-2 max-w-[76ch] text-[11px] leading-relaxed text-muted">
        Lo que arma el resultante de arriba, {unidad} a {unidad} — dos períodos con el mismo saldo
        final pueden venir de mover montos muy distintos, y la curva sola no lo muestra.
      </p>
      <ChartBarras
        ejeX={ejeX}
        series={seriesComposicion}
        modo="agrupadas"
        titulo={`Entradas y salidas por ${unidad}`}
      />
    </div>
  )
}
