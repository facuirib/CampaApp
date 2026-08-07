import { formatMoneyCorto } from '@/lib/format'

/**
 * El papel de cada barra en el puente.
 *
 * `suma` y `resta` arrancan donde terminó la anterior. `resultado` se dibuja
 * desde cero, con SU valor: es el número que llega de otro lado, no el que
 * sale de encadenar los pasos.
 */
export type RolPaso = 'suma' | 'resta' | 'resultado'

export interface PasoWaterfall {
  titulo: string
  /** El valor tal como viene. Una `resta` se pasa en positivo: el rol da el signo. */
  valor: number
  rol: RolPaso
}

export interface WaterfallProps {
  pasos: PasoWaterfall[]
  /** Alto del área de dibujo, en unidades del viewBox. Default 260. */
  alto?: number
  /** Qué muestra el gráfico. Es el texto accesible, no un título visible. */
  titulo?: string
  className?: string
}

const ANCHO = 800
const MARGEN = { izq: 20, der: 20, arr: 34, ab: 46 }

/** Una `resta` no siempre es una pérdida: en un puente puede ser lo que todavía
 *  no entró. El ámbar dice "retiene" sin decir "está mal", que es lo que hace
 *  falta para "por cobrar". El rojo queda para lo que sí es problema. */
const RELLENO: Record<RolPaso, string> = {
  suma: 'var(--ok)',
  resta: 'var(--warn)',
  resultado: 'var(--night)',
}

const TEXTO_VALOR: Record<RolPaso, string> = {
  suma: 'var(--oktx)',
  resta: 'var(--warntx)',
  resultado: 'var(--night)',
}

/**
 * El puente entre dos magnitudes: cada barra arranca donde terminó la anterior.
 *
 * NO verifica que el puente cierre, y eso es deliberado. Los pasos se apilan
 * desde el acumulado; el `resultado` se dibuja desde cero con el valor que le
 * pasaron. Si los números no reconcilian, la barra final no coincide con donde
 * llegó el acumulado y se ve a simple vista — que es exactamente lo que uno
 * quiere que pase. Un puente que no cierra es un problema del dato, y taparlo
 * calculando el resultado acá sería convertir un error visible en uno mudo.
 *
 * Ninguna cifra se calcula: las que se muestran son las que vinieron.
 */
export default function Waterfall({ pasos, alto = 260, titulo, className }: WaterfallProps) {
  // Sin pasos, o con todos en cero. El segundo caso importa: un puente cuyos
  // tres números son 0 dibuja tres hilos sobre la línea de base y deja un
  // recuadro vacío del alto completo. No está roto, pero no dice nada y ocupa
  // como si dijera algo — mejor una frase que explique por qué está vacío.
  if (pasos.length === 0 || pasos.every((p) => p.valor === 0)) {
    return (
      <div
        className={`rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted ${className ?? ''}`}
      >
        Todavía no hay números para este puente.
      </div>
    )
  }

  const anchoPlot = ANCHO - MARGEN.izq - MARGEN.der
  const altoPlot = alto - MARGEN.arr - MARGEN.ab

  // Posición de cada barra: desde dónde y hasta dónde, en unidades del dato.
  let acumulado = 0
  const barras = pasos.map((paso) => {
    let desde: number
    let hasta: number
    if (paso.rol === 'resultado') {
      desde = 0
      hasta = paso.valor
    } else {
      desde = acumulado
      hasta = paso.rol === 'resta' ? acumulado - Math.abs(paso.valor) : acumulado + paso.valor
      acumulado = hasta
    }
    return { paso, desde, hasta }
  })

  const topes = barras.flatMap((b) => [b.desde, b.hasta])
  const maxV = Math.max(0, ...topes)
  const minV = Math.min(0, ...topes)
  const rango = maxV - minV || 1
  const escalaY = (v: number) => MARGEN.arr + altoPlot - ((v - minV) / rango) * altoPlot

  const paso = anchoPlot / barras.length
  const anchoBarra = Math.min(paso * 0.52, 92)

  return (
    <div className={`rounded-md border border-line bg-white p-4 ${className ?? ''}`}>
      <svg
        viewBox={`0 0 ${ANCHO} ${alto}`}
        className="block w-full"
        role="img"
        aria-label={titulo ?? 'Puente entre magnitudes'}
      >
        {titulo && <title>{titulo}</title>}

        {/* La base: el cero, que es de donde se lee todo */}
        <line
          x1={MARGEN.izq}
          y1={escalaY(0)}
          x2={ANCHO - MARGEN.der}
          y2={escalaY(0)}
          stroke="var(--line)"
          strokeWidth={1}
        />

        {barras.map(({ paso: p, desde, hasta }, i) => {
          const cx = MARGEN.izq + paso * (i + 0.5)
          const x = cx - anchoBarra / 2
          const yArriba = escalaY(Math.max(desde, hasta))
          const yAbajo = escalaY(Math.min(desde, hasta))
          const altoBarra = Math.max(yAbajo - yArriba, 1)
          const siguiente = barras[i + 1]

          return (
            <g key={`${p.titulo}-${i}`}>
              <rect
                x={x}
                y={yArriba}
                width={anchoBarra}
                height={altoBarra}
                fill={RELLENO[p.rol]}
                rx={3}
              />

              {/* Conector punteado a la altura donde quedó el acumulado.
                  También antes del `resultado`, y sobre todo ahí: es la línea
                  que deja VER si el puente cierra. Si el resultado no coincide
                  con donde llegó el acumulado, el conector no toca su borde
                  superior y el desajuste queda a la vista. */}
              {siguiente && (
                <line
                  x1={x + anchoBarra}
                  y1={escalaY(hasta)}
                  x2={MARGEN.izq + paso * (i + 1.5) - anchoBarra / 2}
                  y2={escalaY(hasta)}
                  stroke="var(--line)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              )}

              {/* El importe, arriba de la barra */}
              <text
                x={cx}
                y={yArriba - 10}
                textAnchor="middle"
                fontSize={13}
                fontWeight={800}
                fill={TEXTO_VALOR[p.rol]}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {p.rol === 'resta' ? '−' : ''}
                {formatMoneyCorto(Math.abs(p.valor))}
              </text>

              {/* El rótulo, abajo */}
              <text
                x={cx}
                y={alto - MARGEN.ab + 20}
                textAnchor="middle"
                fontSize={11}
                fontWeight={p.rol === 'resultado' ? 700 : 400}
                fill={p.rol === 'resultado' ? 'var(--ink)' : 'var(--muted)'}
              >
                {p.titulo}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
