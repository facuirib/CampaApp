import { escalaEje, formatTickMoneda } from './escala'

/** Una serie: la misma magnitud a lo largo del eje X. */
export interface SerieBarras {
  label: string
  /** Un valor por cada punto del eje X, en el mismo orden. */
  valores: number[]
  /** Color como token CSS — `var(--ok)`. Sin esto, la paleta por posición. */
  color?: string
}

export interface ChartBarrasProps {
  /** Las etiquetas del eje X. Manda la cantidad de barras. */
  ejeX: string[]
  series: SerieBarras[]
  /**
   * `agrupadas` pone las series una al lado de la otra: sirve para COMPARAR
   * —ingresos contra gastos—.
   * `apiladas` las suma en una sola barra: sirve para COMPONER —vencido más
   * por vencer dan el total adeudado—.
   *
   * No es una preferencia visual: apilar cosas que no se suman entre sí es
   * dibujar un total que no existe.
   */
  modo?: 'agrupadas' | 'apiladas'
  /** Achica el LIENZO, no las letras. Mismo criterio que ChartArea. */
  compacto?: boolean
  /** Alto del área de dibujo, en unidades del viewBox. */
  alto?: number
  /** Tope de etiquetas en el eje X, para que no se amontonen. */
  maxEtiquetasX?: number
  /** Texto accesible del gráfico, no un título visible. */
  titulo?: string
  className?: string
}

const PALETA = ['var(--blue)', 'var(--st-green)', 'var(--err)', 'var(--warn)', 'var(--flyway)']

/**
 * Barras por categoría, agrupadas o apiladas.
 *
 * ── Los negativos se dibujan ──────────────────────────────────────────────
 *
 * El eje cero no está pegado abajo: se ubica según el rango real. Una barra
 * negativa baja del cero y se lee como lo que es. Importa porque el caso de uso
 * más directo —ingresos contra gastos por mes— tiene meses en rojo, y un
 * gráfico que los apoya en cero estaría mintiendo justo en el mes que hay que
 * mirar.
 *
 * ── Ningún número se calcula ──────────────────────────────────────────────
 *
 * Los valores se dibujan como vienen. En `apiladas` los segmentos se suman para
 * saber DÓNDE arranca el siguiente, que es geometría, no un total de negocio: si
 * hace falta mostrar el total de la pila, viene en su propia serie desde la
 * vista.
 */
export default function ChartBarras({
  ejeX,
  series,
  modo = 'agrupadas',
  compacto = false,
  alto = 260,
  maxEtiquetasX,
  titulo,
  className,
}: ChartBarrasProps) {
  const ANCHO = compacto ? 440 : 800
  const MARGEN = { izq: 46, der: 14, arr: 28, ab: series.length > 1 ? 54 : 38 }

  if (ejeX.length === 0 || series.length === 0 || series.every((s) => s.valores.every((v) => v === 0))) {
    return (
      <div
        className={`rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted ${className ?? ''}`}
      >
        Todavía no hay números para este gráfico.
      </div>
    )
  }

  const anchoPlot = ANCHO - MARGEN.izq - MARGEN.der
  const altoPlot = alto - MARGEN.arr - MARGEN.ab

  // El rango incluye el cero SIEMPRE: sin eso, un conjunto todo positivo se
  // dibujaría con la barra más chica pegada al piso y exagerando las
  // diferencias — el error clásico del eje truncado.
  const topes: number[] = [0]
  for (let i = 0; i < ejeX.length; i++) {
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
  // El eje va a números redondos en vez de al máximo exacto del dato: el techo
  // se rotulaba «$7,9M», que es el valor de la barra más alta y no una regla
  // contra la cual leerla. Ver components/ui/escala.ts.
  const eje = escalaEje(Math.min(...topes), Math.max(...topes), 5)
  const minV = eje.min
  const maxV = eje.max
  const rango = maxV - minV || 1
  const escalaY = (v: number) => MARGEN.arr + altoPlot - ((v - minV) / rango) * altoPlot
  const yCero = escalaY(0)

  const paso = anchoPlot / ejeX.length
  const anchoGrupo = Math.min(paso * 0.68, 96)
  const anchoBarra = modo === 'apiladas' ? anchoGrupo : anchoGrupo / series.length

  // Cuántas etiquetas del eje X entran sin amontonarse.
  const tope = maxEtiquetasX ?? (compacto ? 6 : 12)
  const saltoX = Math.max(1, Math.ceil(ejeX.length / tope))

  return (
    <div className={`rounded-md border border-line bg-white p-4 ${className ?? ''}`}>
      <svg
        viewBox={`0 0 ${ANCHO} ${alto}`}
        className="block w-full"
        role="img"
        aria-label={titulo ?? 'Barras por categoría'}
      >
        {titulo && <title>{titulo}</title>}

        {/* Dos referencias y nada más: el techo y el cero. Una grilla completa
            en un gráfico de barras compite con las barras, que son lo que hay
            que leer. */}
        <line
          x1={MARGEN.izq}
          y1={escalaY(maxV)}
          x2={ANCHO - MARGEN.der}
          y2={escalaY(maxV)}
          stroke="var(--line2)"
          strokeWidth={1}
        />
        <text x={MARGEN.izq - 8} y={escalaY(maxV) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
          {formatTickMoneda(maxV, eje.paso)}
        </text>

        <line
          x1={MARGEN.izq}
          y1={yCero}
          x2={ANCHO - MARGEN.der}
          y2={yCero}
          stroke="var(--line)"
          strokeWidth={1}
        />
        {minV < 0 && (
          <text x={MARGEN.izq - 8} y={escalaY(minV) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
            {formatTickMoneda(minV, eje.paso)}
          </text>
        )}

        {ejeX.map((etiqueta, i) => {
          const centro = MARGEN.izq + paso * (i + 0.5)
          const izqGrupo = centro - anchoGrupo / 2
          let acumPos = 0
          let acumNeg = 0

          return (
            <g key={`${etiqueta}-${i}`}>
              {series.map((s, j) => {
                const v = s.valores[i] ?? 0
                if (v === 0) return null
                const color = s.color ?? PALETA[j % PALETA.length]

                let x: number
                let yArriba: number
                let altoBarra: number

                if (modo === 'apiladas') {
                  x = izqGrupo
                  if (v >= 0) {
                    const desde = acumPos
                    acumPos += v
                    yArriba = escalaY(acumPos)
                    altoBarra = escalaY(desde) - escalaY(acumPos)
                  } else {
                    const desde = acumNeg
                    acumNeg += v
                    yArriba = escalaY(desde)
                    altoBarra = escalaY(acumNeg) - escalaY(desde)
                  }
                } else {
                  x = izqGrupo + anchoBarra * j
                  yArriba = v >= 0 ? escalaY(v) : yCero
                  altoBarra = Math.abs(escalaY(v) - yCero)
                }

                return (
                  <rect
                    key={`${s.label}-${i}`}
                    x={x}
                    y={yArriba}
                    width={Math.max(anchoBarra - (modo === 'agrupadas' ? 2 : 0), 1)}
                    height={Math.max(altoBarra, 1)}
                    fill={color}
                    rx={2}
                  />
                )
              })}

              {i % saltoX === 0 && (
                <text
                  x={centro}
                  y={alto - MARGEN.ab + 16}
                  textAnchor="middle"
                  fontSize={compacto ? 9.5 : 10.5}
                  fill="var(--muted)"
                >
                  {etiqueta}
                </text>
              )}
            </g>
          )
        })}

        {/* La leyenda, sólo si hay más de una serie: con una sola, el título ya
            dice qué es y la referencia sería ruido. Va dentro del SVG para que
            el gráfico sea una pieza sola —y pueda ir a un PDF entero—. */}
        {series.length > 1 &&
          series.map((s, j) => {
            const anchoItem = Math.min(anchoPlot / series.length, 190)
            const x = MARGEN.izq + anchoItem * j
            const y = alto - 10
            return (
              <g key={`leyenda-${s.label}`}>
                <rect x={x} y={y - 8} width={9} height={9} rx={2} fill={s.color ?? PALETA[j % PALETA.length]} />
                <text x={x + 15} y={y} fontSize={compacto ? 10 : 11} fill="var(--ink)">
                  {s.label}
                </text>
              </g>
            )
          })}
      </svg>
    </div>
  )
}
