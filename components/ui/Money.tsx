import { formatMoney } from '@/lib/format'

/**
 * Qué significa el número, que es lo que decide si lleva color.
 *
 * `neutro` — una magnitud a secas: el valor de un activo, el precio de una
 *   tarifa, el monto de un cheque. **Es el default**, y es el caso más común:
 *   pintar todo lo que es plata deja el color sin significado.
 * `ingreso` / `egreso` — el número tiene lado. Verde entra, rojo sale.
 * `auto` — el SIGNO decide: negativo en rojo, positivo en verde. Para saldos,
 *   diferencias de arqueo y resultados, donde lo que hay que ver de un vistazo
 *   es si el número está de un lado o del otro del cero.
 */
export type TonoMoney = 'neutro' | 'ingreso' | 'egreso' | 'auto'

export interface MoneyProps {
  /** El importe, en pesos. Sale de una vista SQL, nunca de una suma del front. */
  value: number
  /** Qué significa. Default `neutro`: sin color. */
  tono?: TonoMoney
  className?: string
}

/** Los tokens de siempre. Acá no se inventa ningún color. */
const CLASE: Record<Exclude<TonoMoney, 'auto'>, string> = {
  neutro: '',
  ingreso: 'text-oktx',
  egreso: 'text-errtx',
}

/**
 * Un importe en pesos.
 *
 * El formateo NO vive acá: delega en `formatMoney()` (lib/format), que es el
 * único lugar donde se decide cómo se escribe la plata en toda la app. Este
 * componente aporta la otra mitad, que es tipográfica: `cifra` activa
 * `tabular-nums`, así todos los dígitos ocupan lo mismo y una columna de
 * importes queda alineada por los miles en vez de bailar fila a fila.
 *
 *   <Money value={1750000} />                  →  $1.750.000
 *   <Money value={-48000} tono="auto" />       →  −$48.000 en rojo
 *
 * ── Por qué el color entra por acá y no en cada pantalla ──────────────────
 *
 * Porque ya había pantallas resolviéndolo por su cuenta. `/calendario-pagos`
 * dejó escrito que armaba la celda a mano «porque `Money` no colorea», y esa es
 * exactamente la clase de decisión que, repetida cinco veces, deja cinco rojos
 * apenas distintos. Un componente compartido que no sabe hacer algo obliga a
 * cada consumidor a inventarlo.
 *
 * ── Y por qué el default es SIN color ─────────────────────────────────────
 *
 * Un importe es casi siempre una magnitud, no una alarma: el valor de un
 * activo, el precio de una tarifa. Si toda la plata llevara color, el color
 * dejaría de decir algo — el mismo criterio por el que ChartTorta no pinta de
 * rojo una categoría neutra. Se pide cuando significa.
 */
export default function Money({ value, tono = 'neutro', className }: MoneyProps) {
  const efectivo = tono === 'auto' ? (value < 0 ? 'egreso' : value > 0 ? 'ingreso' : 'neutro') : tono
  const clases = ['cifra', CLASE[efectivo], className].filter(Boolean).join(' ')
  return <span className={clases}>{formatMoney(value)}</span>
}
