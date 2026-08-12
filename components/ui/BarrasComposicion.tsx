import { formatMoney, formatMoneyCorto } from '@/lib/format'

/**
 * Un ítem de la composición. El `valor` manda el largo de la barra.
 *
 * `parte` es opcional y se dibuja encima, más oscura: sirve para decir "de
 * estos $4.800.000, $3.000.000 ya se pagaron" sin dos gráficos.
 */
export interface ItemComposicion {
  label: string
  valor: number
  /** Porción destacada dentro de la barra. Nunca mayor que `valor`. */
  parte?: number
  /** Texto chico a la derecha del rótulo: la categoría, el tipo, lo que sea. */
  nota?: string
}

export interface BarrasComposicionProps {
  items: ItemComposicion[]
  /** Qué significa la porción oscura. Sin esto no se dibuja la referencia. */
  etiquetaParte?: string
  /** Cuántas barras como máximo. El resto se agrupa en «Otros». */
  tope?: number
  /** Texto accesible del gráfico. */
  titulo?: string
  className?: string
}

/**
 * Composición: cuánto pesa cada cosa dentro de un total.
 *
 * Barras horizontales y no un área temporal, por lo que la pregunta es: «¿en
 * qué se va la plata?» no tiene eje de tiempo. `ChartArea` dibuja UNA serie a
 * lo largo del tiempo y `Waterfall` encadena sumas y restas — ninguno de los
 * dos contesta esto.
 *
 * Con CSS y no con SVG: son rectángulos proporcionales y texto, y el ancho lo
 * resuelve el navegador mejor que un `viewBox` que hay que escalar a mano.
 * Además el texto queda seleccionable y crece con el zoom del sistema.
 *
 * **El orden lo decide quien llama.** Acá no se ordena: un gráfico que
 * reordena por su cuenta rompe la correspondencia con la tabla de al lado.
 */
export default function BarrasComposicion({
  items,
  etiquetaParte,
  tope,
  titulo,
  className,
}: BarrasComposicionProps) {
  if (items.length === 0) return null

  // El tope agrupa la cola en una barra «Otros» en vez de recortarla: un
  // gráfico que muestra 8 de 20 categorías y no lo dice hace parecer que el
  // total es la suma de lo que se ve.
  const visibles = tope ? items.slice(0, tope) : items
  const cola = tope ? items.slice(tope) : []
  const otros = cola.reduce((a, i) => a + i.valor, 0)

  const filas: ItemComposicion[] =
    otros > 0 ? [...visibles, { label: `Otros (${cola.length})`, valor: otros }] : visibles

  // El máximo define la escala. Se toma del conjunto dibujado, no del total:
  // así la barra más grande siempre llega al borde y las diferencias entre
  // las chicas se ven.
  const max = Math.max(...filas.map((f) => f.valor), 1)

  return (
    <figure
      className={['rounded-md border border-line bg-white p-4 shadow-sm', className]
        .filter(Boolean)
        .join(' ')}
    >
      {titulo && <figcaption className="sr-only">{titulo}</figcaption>}

      <ul className="grid gap-2.5">
        {filas.map((f) => {
          const ancho = (f.valor / max) * 100
          const anchoParte = f.parte ? (Math.min(f.parte, f.valor) / max) * 100 : 0

          return (
            <li key={f.label} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[11.5px] font-semibold text-ink">
                  {f.label}
                  {f.nota && <span className="ml-1.5 font-normal text-muted">{f.nota}</span>}
                </span>
                <span
                  className="shrink-0 cifra text-[11.5px] tabular-nums text-ink"
                  title={formatMoney(f.valor)}
                >
                  {formatMoneyCorto(f.valor)}
                </span>
              </div>

              <div className="relative h-[9px] overflow-hidden rounded-pill bg-line2">
                <div
                  className="absolute inset-y-0 left-0 rounded-pill bg-regale"
                  style={{ width: `${ancho}%` }}
                />
                {anchoParte > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-pill bg-blue"
                    style={{ width: `${anchoParte}%` }}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {etiquetaParte && (
        <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted">
          <span className="inline-block h-[7px] w-[14px] rounded-pill bg-blue" />
          {etiquetaParte}
          <span className="ml-2 inline-block h-[7px] w-[14px] rounded-pill bg-regale" />
          el resto
        </p>
      )}
    </figure>
  )
}
