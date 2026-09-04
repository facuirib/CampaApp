import { formatMoney } from '@/lib/format'
import { escalaEje, formatTickMoneda } from './escala'
import type { SerieBarras } from './ChartBarras'

export interface ChartBarrasHProps {
  /** Una etiqueta por fila. Manda la cantidad de barras. */
  categorias: string[]
  series: SerieBarras[]
  /** Ver `ChartBarras`: agrupadas COMPARA, apiladas COMPONE. */
  modo?: 'agrupadas' | 'apiladas'
  /** Ancho reservado a los rótulos de la izquierda, en unidades del viewBox. */
  anchoEtiqueta?: number
  /** Escribe el valor al final de cada barra. Con muchas filas, estorba. */
  mostrarValor?: boolean
  /** Texto accesible del gráfico, no un título visible. */
  titulo?: string
  className?: string
}

const PALETA = ['var(--blue)', 'var(--st-green)', 'var(--err)', 'var(--warn)', 'var(--flyway)']

/**
 * Barras horizontales: una fila por categoría.
 *
 * ── Por qué horizontal y no rotar el otro ─────────────────────────────────
 *
 * Porque el rótulo cambia de naturaleza. En vertical la etiqueta va debajo de
 * la barra, tiene el ancho de la barra y por eso todo lo que entra es «03» o
 * «S12»; cuando no entra, se saltean etiquetas. En horizontal el rótulo tiene
 * una columna propia y entra entero — «Bar Efectivo Aeropuerto», «Semana del
 * 14/07»—. Eso es lo que hace legible un ranking de categorías con nombre, que
 * es justo lo que el vertical no puede mostrar.
 *
 * Y el alto crece con la cantidad de filas en vez de apretarlas: veinte
 * categorías en vertical son veinte barras de cuatro píxeles.
 *
 * ── Los negativos ─────────────────────────────────────────────────────────
 *
 * El cero se ubica según el rango real y las barras negativas van hacia la
 * izquierda. No es un caso de laboratorio: la caja de transferencias está en
 * −$48M, y un gráfico que apoyara todo contra el borde izquierdo la dibujaría
 * como si fuera la más chica en vez de la más grande al revés.
 *
 * ── Ningún número se calcula ──────────────────────────────────────────────
 *
 * Los valores se dibujan como vienen de la vista. En `apiladas` se acumula para
 * saber dónde arranca el segmento siguiente, que es geometría y no un total de
 * negocio.
 */
export default function ChartBarrasH({
  categorias,
  series,
  modo = 'agrupadas',
  anchoEtiqueta = 150,
  mostrarValor = true,
  titulo,
  className,
}: ChartBarrasHProps) {
  if (
    categorias.length === 0 ||
    series.length === 0 ||
    series.every((s) => s.valores.every((v) => v === 0))
  ) {
    return (
      <div
        className={`rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted ${className ?? ''}`}
      >
        Todavía no hay números para este gráfico.
      </div>
    )
  }

  const ANCHO = 800
  const PASO_FILA = modo === 'apiladas' || series.length === 1 ? 30 : 34
  const MARGEN = {
    izq: anchoEtiqueta,
    der: mostrarValor ? 96 : 20,
    arr: 24,
    ab: series.length > 1 ? 42 : 26,
  }

  const anchoPlot = ANCHO - MARGEN.izq - MARGEN.der
  const altoPlot = categorias.length * PASO_FILA
  const alto = altoPlot + MARGEN.arr + MARGEN.ab

  // El cero SIEMPRE entra: sin eso un conjunto todo positivo arranca la barra
  // más chica pegada al eje y exagera las diferencias.
  const topes: number[] = [0]
  for (let i = 0; i < categorias.length; i++) {
    if (modo === 'apiladas') {
      let pos = 0
      let neg = 0
      for (const s of series) {
        const v = s.valores[i] ?? 0
        if (v >= 0) pos += v
        else neg += v
      }
      topes.push(pos, neg)
    } else {
      for (const s of series) topes.push(s.valores[i] ?? 0)
    }
  }

  const eje = escalaEje(Math.min(...topes), Math.max(...topes), 5)
  const escalaX = (v: number) =>
    MARGEN.izq + ((v - eje.min) / (eje.max - eje.min || 1)) * anchoPlot
  const xCero = escalaX(0)

  const anchoGrupo = PASO_FILA * 0.68
  const altoBarra = modo === 'apiladas' ? anchoGrupo : anchoGrupo / series.length

  return (
    <div className={`rounded-md border border-line bg-white p-4 ${className ?? ''}`}>
      <svg
        viewBox={`0 0 ${ANCHO} ${alto}`}
        className="block w-full"
        role="img"
        aria-label={titulo ?? 'Barras horizontales por categoría'}
      >
        {titulo && <title>{titulo}</title>}

        {/* La grilla vertical: acá sí conviene, porque una barra horizontal se
            mide contra la marca que tiene arriba y sin líneas hay que llevar el
            largo con la vista hasta el pie del gráfico. */}
        {eje.ticks.map((t) => (
          <g key={`tick-${t}`}>
            <line
              x1={escalaX(t)}
              y1={MARGEN.arr - 6}
              x2={escalaX(t)}
              y2={MARGEN.arr + altoPlot}
              stroke={t === 0 ? 'var(--line)' : 'var(--line2)'}
              strokeWidth={1}
            />
            <text
              x={escalaX(t)}
              y={MARGEN.arr + altoPlot + 16}
              textAnchor="middle"
              fontSize={10}
              fill="var(--muted)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatTickMoneda(t, eje.paso)}
            </text>
          </g>
        ))}

        {categorias.map((cat, i) => {
          const yFila = MARGEN.arr + i * PASO_FILA
          const yGrupo = yFila + (PASO_FILA - anchoGrupo) / 2
          let acumPos = 0
          let acumNeg = 0

          return (
            <g key={`${cat}-${i}`}>
              <text
                x={MARGEN.izq - 10}
                y={yFila + PASO_FILA / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--ink)"
              >
                {cat}
              </text>

              {series.map((s, j) => {
                const v = s.valores[i] ?? 0
                const color = s.color ?? PALETA[j % PALETA.length]

                let x: number
                let ancho: number
                if (modo === 'apiladas') {
                  const desde = v >= 0 ? acumPos : acumNeg
                  const hasta = desde + v
                  if (v >= 0) acumPos = hasta
                  else acumNeg = hasta
                  x = Math.min(escalaX(desde), escalaX(hasta))
                  ancho = Math.abs(escalaX(hasta) - escalaX(desde))
                } else {
                  x = Math.min(xCero, escalaX(v))
                  ancho = Math.abs(escalaX(v) - xCero)
                }

                const y = modo === 'apiladas' ? yGrupo : yGrupo + j * altoBarra

                return (
                  <rect
                    key={`${s.label}-${i}`}
                    x={x}
                    y={y}
                    width={Math.max(ancho, v === 0 ? 0 : 1)}
                    height={Math.max(altoBarra - 1, 1)}
                    fill={color}
                    rx={2}
                  />
                )
              })}

              {/* El valor al final de la fila. Con una sola serie es el número
                  que se viene a leer; con varias, el total no existe como dato
                  —habría que sumarlo acá— así que sólo se escribe cuando hay
                  una. */}
              {mostrarValor && series.length === 1 && (
                <text
                  x={ANCHO - MARGEN.der + 8}
                  y={yFila + PASO_FILA / 2}
                  dominantBaseline="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={(series[0].valores[i] ?? 0) < 0 ? 'var(--errtx)' : 'var(--ink)'}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatMoney(series[0].valores[i] ?? 0)}
                </text>
              )}
            </g>
          )
        })}

        {/* La leyenda, sólo con más de una serie: con una sola el título ya
            dice qué es, y una leyenda de un ítem es ruido. */}
        {series.length > 1 &&
          series.map((s, j) => {
            const x = MARGEN.izq + j * 150
            const y = alto - 8
            return (
              <g key={`leyenda-${s.label}`}>
                <rect
                  x={x}
                  y={y - 8}
                  width={9}
                  height={9}
                  rx={2}
                  fill={s.color ?? PALETA[j % PALETA.length]}
                />
                <text x={x + 15} y={y} fontSize={11} fill="var(--muted)">
                  {s.label}
                </text>
              </g>
            )
          })}
      </svg>
    </div>
  )
}
