import Icon, { type NombreIcono } from './Icon'
import Money from './Money'
import { formatEntero, formatPorcentaje, formatUSD } from '@/lib/format'

/**
 * Qué SIGNIFICA el número, no de qué color va.
 *
 * La pantalla dice que el saldo de caja es `positivo` y que la mora es
 * `alerta`; el color lo elige el sistema. Si mañana la alerta deja de ser
 * roja, cambia acá y no en las pantallas que la muestran. Es el mismo
 * criterio que el `estado` del Badge.
 */
export type TonoKpi = 'positivo' | 'alerta' | 'info' | 'neutro'

/**
 * `money` lleva `$`; `entero` es un conteo y no lleva; `usd` es la otra moneda.
 *
 * `usd` está acá y no resuelto en la pantalla por lo mismo que `money` no se
 * formatea a mano: que haya UN lugar donde se decide cómo se escribe cada
 * moneda. Una pantalla que armara el string por su cuenta podría mostrar los
 * dólares distinto de la siguiente que los muestre.
 */
export type FormatoKpi = 'money' | 'entero' | 'usd' | 'porcentaje'

/** Un número con su etiqueta. Es la unidad que comparten KpiCard y KpiHero. */
export interface ValorKpi {
  titulo: string
  /**
   * `null` es "todavía no hay número", y se muestra como guion.
   *
   * No es lo mismo que cero: el TC promedio ponderado sin tenencia no es
   * «$0» —un tipo de cambio de cero pesos no existe— sino que no está
   * definido. Mostrar cero ahí inventa un dato.
   */
  valor: number | null
  /** Default: 'money'. */
  formato?: FormatoKpi
  /** En la card tiñe la barra lateral; en la hero, el número. */
  tono?: TonoKpi
}

export interface VariacionKpi {
  /** Positivo sube, negativo baja. El signo decide la flecha y el color. */
  porcentaje: number
  /**
   * Contra qué compara: "vs. la fecha anterior", "vs. el mes pasado".
   *
   * Es obligatoria a propósito. Un porcentaje sin base es un número
   * engañoso —el mismo riesgo que tenía el corte por fecha del cashflow—, y
   * la forma de que nadie lo olvide no es un comentario: es que no compile.
   */
  base: string
}

export interface KpiCardProps extends ValorKpi {
  /** Línea chica debajo del número. */
  subtitulo?: React.ReactNode
  icon?: NombreIcono
  /**
   * Serie para la mini-tendencia. Sin serie no se dibuja nada.
   *
   * Muestra la FORMA, no las cifras: de acá no sale ningún número a
   * pantalla. Antes de usarla hay que tener una serie de verdad —una por
   * fecha, comparable— que hoy no toda pantalla tiene.
   */
  sparkline?: number[]
  /** Sin esta prop no hay badge. Ver `VariacionKpi`. */
  variacion?: VariacionKpi
  className?: string
}

/** La barra lateral. No es texto, así que acá manda la marca y no el contraste. */
const BARRA: Record<TonoKpi, string> = {
  positivo: 'border-l-ok',
  alerta: 'border-l-err',
  info: 'border-l-blue',
  neutro: 'border-l-line',
}

/** El color de la línea del sparkline, del mismo tono que la barra. */
const TRAZO: Record<TonoKpi, string> = {
  positivo: 'text-ok',
  alerta: 'text-err',
  info: 'text-blue',
  neutro: 'text-muted',
}

export function valorKpi(valor: number | null, formato: FormatoKpi = 'money') {
  if (valor === null) return <span className="cifra text-muted">—</span>
  if (formato === 'money') return <Money value={valor} />
  if (formato === 'usd') return <span className="cifra">{formatUSD(valor)}</span>
  if (formato === 'porcentaje') return <span className="cifra">{formatPorcentaje(valor)}</span>
  return <span className="cifra">{formatEntero(valor)}</span>
}

/**
 * Mini-tendencia: una polilínea normalizada al alto del recuadro.
 *
 * Sin ejes, sin escala y sin números — es la silueta de la serie. Cualquier
 * cifra que haga falta leer va en el valor de la card, que sale de una vista.
 */
function Sparkline({ serie, className }: { serie: number[]; className?: string }) {
  if (serie.length < 2) return null

  const ANCHO = 70
  const ALTO = 26
  const MARGEN = 2 // para que el trazo no se corte contra el borde

  const min = Math.min(...serie)
  const max = Math.max(...serie)
  const rango = max - min || 1
  const util = ALTO - MARGEN * 2

  const puntos = serie
    .map((v, i) => {
      const x = (i / (serie.length - 1)) * ANCHO
      const y = MARGEN + util - ((v - min) / rango) * util
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      width={ANCHO}
      height={ALTO}
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      className={`shrink-0 ${className ?? ''}`}
      aria-hidden
      focusable="false"
    >
      <polyline
        points={puntos}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * El badge de variación.
 *
 * La base va pegada al porcentaje, no en otra línea ni en un tooltip: son una
 * sola afirmación. "▲12%" solo no dice nada; "▲12% vs. la fecha anterior" sí.
 */
function Variacion({ porcentaje, base }: VariacionKpi) {
  const sube = porcentaje >= 0
  return (
    <span className="flex flex-wrap items-baseline gap-1.5">
      <span
        className={`inline-flex items-center gap-0.5 rounded-pill px-2 py-0.5 text-[9px] font-extrabold ${
          sube ? 'bg-okbg text-oktx' : 'bg-errbg text-errtx'
        }`}
      >
        <span aria-hidden>{sube ? '▲' : '▼'}</span>
        <span className="cifra">{Math.abs(porcentaje)}%</span>
      </span>
      <span className="text-[9px] text-muted">{base}</span>
    </span>
  )
}

/**
 * La tarjeta de un número.
 *
 * Un número por tarjeta. Para el resumen de varios juntos está `KpiHero`, que
 * no es esta tarjeta pintada de oscuro: muestra N valores, no uno.
 */
export default function KpiCard({
  titulo,
  valor,
  formato = 'money',
  tono = 'neutro',
  subtitulo,
  icon,
  sparkline,
  variacion,
  className,
}: KpiCardProps) {
  return (
    <div
      className={[
        'rounded-md border border-line border-l-4 bg-white p-4 shadow-sm',
        BARRA[tono],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center gap-1.5 text-[9.5px] font-semibold text-muted">
        {icon && <Icon name={icon} size={12} className="shrink-0" />}
        {titulo}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-[22px] font-extrabold tracking-[-.5px] text-ink">
          {valorKpi(valor, formato)}
        </div>
        {sparkline && <Sparkline serie={sparkline} className={TRAZO[tono]} />}
      </div>

      {subtitulo && <div className="mt-1.5 text-[9px] text-muted">{subtitulo}</div>}
      {variacion && (
        <div className="mt-2">
          <Variacion {...variacion} />
        </div>
      )}
    </div>
  )
}
