import { formatMoneyCorto } from '@/lib/format'

export interface PuntoSerie {
  fecha: string | Date
  valor: number
  /** Marca el tramo proyectado. Sin esto, el punto es real. */
  proyectado?: boolean
}

export interface ChartAreaProps {
  serie: PuntoSerie[]
  /**
   * Para cuando el gráfico entra en poco ancho — un dashboard en el teléfono.
   *
   * No agranda las letras: achica el LIENZO. El SVG escala por `viewBox`, así
   * que en 436px de ancho el lienzo normal de 800 se dibuja a 0,545 y una
   * etiqueta de 11px termina midiendo 6 — ilegible. Con un lienzo de 440 la
   * escala queda en ~1 y cada cosa aterriza en su tamaño nominal: no solo el
   * texto, también los trazos y los puntos, que agrandando fuentes seguirían
   * finos. De paso baja la cantidad de marcas, porque en poco ancho el
   * problema además es el amontonamiento.
   *
   * La contracara: un gráfico `compacto` metido en un contenedor ancho se
   * dibuja agrandado. Es la prop que dice "esto va en poco espacio".
   */
  compacto?: boolean
  /** Alto del área de dibujo, en unidades del viewBox. */
  alto?: number
  /** Tope de etiquetas en el eje X. */
  maxEtiquetasX?: number
  /** Resalta en rojo los tramos que caen bajo cero. Default true. */
  marcarNegativo?: boolean
  /** Qué muestra el gráfico. Es el texto accesible, no un título visible. */
  titulo?: string
  className?: string
}

/**
 * Las dos medidas del lienzo. Todo lo demás se calcula a partir de esto, así
 * que cambiar de una a otra reescala el gráfico entero sin tocar nada más.
 */
const LIENZO = {
  normal: {
    ancho: 800,
    alto: 320,
    margen: { izq: 70, der: 20, arr: 20, ab: 40 },
    ticks: 5,
    etiquetasX: 8,
    cuerpo: 11,
    trazo: 2.5,
    punto: 3.5,
  },
  compacto: {
    ancho: 440,
    alto: 220,
    margen: { izq: 54, der: 12, arr: 14, ab: 32 },
    ticks: 4,
    etiquetasX: 4,
    cuerpo: 11,
    trazo: 2,
    punto: 3,
  },
} as const

/** Fecha corta para el eje: "12 mar". */
const EJE_FECHA = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Argentina/Cordoba',
})

function fechaCorta(valor: string | Date): string {
  // Una columna `date` se formatea desde el string: `new Date('2026-07-29')` es
  // medianoche UTC y en Córdoba se muestra como 28/07. Mismo cuidado que
  // `formatDate` en lib/format.
  if (typeof valor === 'string') {
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
    if (soloFecha) {
      const [, a, m, d] = soloFecha
      return EJE_FECHA.format(new Date(Number(a), Number(m) - 1, Number(d)))
    }
  }
  const fecha = valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(fecha.getTime()) ? String(valor) : EJE_FECHA.format(fecha)
}

/**
 * Id estable y propio para el degradado.
 *
 * Dos gráficos en la misma página con el mismo id de `<linearGradient>` hacen
 * que los dos resuelvan al primero. Se deriva de la serie, así que es
 * determinista —el server y el cliente producen el mismo— y distinto por
 * gráfico.
 */
function idDegradado(serie: PuntoSerie[], titulo?: string): string {
  const semilla = `${titulo ?? ''}|${serie.length}|${serie[0]?.valor ?? 0}|${
    serie[serie.length - 1]?.valor ?? 0
  }`
  let h = 0
  for (let i = 0; i < semilla.length; i++) h = (h * 31 + semilla.charCodeAt(i)) | 0
  return `ca-${(h >>> 0).toString(36)}`
}

/**
 * Evolución de un saldo en el tiempo.
 *
 * NO calcula nada: recibe la serie ya resuelta por la pantalla, que la trae de
 * una vista. Acá solo se normaliza a coordenadas —geometría, no aritmética de
 * negocio— y ninguna cifra nueva aparece en pantalla: las del eje son las que
 * vinieron, abreviadas.
 *
 * El eje X es POR ÍNDICE, no por tiempo: los puntos van equiespaciados. Para
 * una serie semanal regular, como `v_cashflow`, es lo correcto y se lee mejor.
 * Si alguna vez hay que graficar fechas con huecos irregulares, esto hay que
 * cambiarlo, porque un salto de tres semanas se vería igual que uno de una.
 */
export default function ChartArea({
  serie,
  compacto = false,
  alto,
  maxEtiquetasX,
  marcarNegativo = true,
  titulo,
  className,
}: ChartAreaProps) {
  if (serie.length === 0) {
    return (
      <div
        className={`rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted ${className ?? ''}`}
      >
        Todavía no hay serie para graficar.
      </div>
    )
  }

  const L = compacto ? LIENZO.compacto : LIENZO.normal
  const ANCHO = L.ancho
  const MARGEN = L.margen
  const altoTotal = alto ?? L.alto
  const topeEtiquetasX = maxEtiquetasX ?? L.etiquetasX

  const anchoPlot = ANCHO - MARGEN.izq - MARGEN.der
  const altoPlot = altoTotal - MARGEN.arr - MARGEN.ab

  // El cero siempre entra en la escala: un gráfico de saldo que no muestra el
  // cero esconde justo lo que hay que mirar.
  const valores = serie.map((p) => p.valor)
  const crudoMin = Math.min(0, ...valores)
  const crudoMax = Math.max(0, ...valores)
  const colchon = (crudoMax - crudoMin || 1) * 0.1
  const minY = crudoMin - colchon
  const maxY = crudoMax + colchon

  const n = serie.length
  const escalaX = (i: number) =>
    n <= 1 ? MARGEN.izq + anchoPlot / 2 : MARGEN.izq + (i / (n - 1)) * anchoPlot
  const escalaY = (v: number) => MARGEN.arr + altoPlot - ((v - minY) / (maxY - minY)) * altoPlot

  const puntos = serie.map((p, i) => ({
    x: escalaX(i),
    y: escalaY(p.valor),
    valor: p.valor,
    proyectado: !!p.proyectado,
  }))

  // El corte real → proyectado. El primer punto proyectado se incluye en los
  // dos tramos para que la línea no quede cortada en el medio.
  const primerProyectado = puntos.findIndex((p) => p.proyectado)
  const hayProyectado = primerProyectado !== -1
  const reales = hayProyectado ? puntos.slice(0, primerProyectado + 1) : puntos
  const proyectados = hayProyectado ? puntos.slice(Math.max(primerProyectado - 1, 0)) : []

  const y0 = escalaY(0)
  const baseArea = Math.min(Math.max(y0, MARGEN.arr), MARGEN.arr + altoPlot)

  const ticksY = Array.from(
    { length: L.ticks },
    (_, i) => maxY - (i / (L.ticks - 1)) * (maxY - minY),
  )
  const pasoX = Math.max(1, Math.ceil(n / topeEtiquetasX))
  // La última fecha se rotula solo si no queda pegada a la anterior. Forzarla
  // siempre hacía que en `compacto` se solaparan las dos últimas ("31 ago7 sept").
  const rotularUltima = (n - 1) % pasoX >= pasoX / 2
  const grad = idDegradado(serie, titulo)

  const aPuntos = (ps: typeof puntos) =>
    ps.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <div className={`rounded-md border border-line bg-white p-4 ${className ?? ''}`}>
      <svg
        viewBox={`0 0 ${ANCHO} ${altoTotal}`}
        className="block w-full"
        role="img"
        aria-label={titulo ?? 'Evolución del saldo'}
      >
        {titulo && <title>{titulo}</title>}

        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--blue)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grilla horizontal, una por tick */}
        {ticksY.map((t, i) => (
          <line
            key={`g${i}`}
            x1={MARGEN.izq}
            y1={escalaY(t)}
            x2={ANCHO - MARGEN.der}
            y2={escalaY(t)}
            stroke="var(--line2)"
            strokeWidth={1}
          />
        ))}

        {/* El marco que cierra el plot. Sin esto el área queda abierta arriba y
            a los costados, que era lo que se veía mal en /proyeccion. */}
        <rect
          x={MARGEN.izq}
          y={MARGEN.arr}
          width={anchoPlot}
          height={altoPlot}
          fill="none"
          stroke="var(--line)"
          strokeWidth={1}
        />

        {/* Etiquetas del eje Y */}
        {ticksY.map((t, i) => (
          <text
            key={`ty${i}`}
            x={MARGEN.izq - 8}
            y={escalaY(t)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={L.cuerpo}
            fill="var(--muted)"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatMoneyCorto(t)}
          </text>
        ))}

        {/* Etiquetas del eje X */}
        {serie.map((p, i) => {
          const esUltima = i === n - 1
          if (i % pasoX !== 0 && !(esUltima && rotularUltima)) return null
          return (
            <text
              key={`tx${i}`}
              x={escalaX(i)}
              y={altoTotal - MARGEN.ab + 14}
              textAnchor="middle"
              fontSize={L.cuerpo}
              fill="var(--muted)"
            >
              {fechaCorta(p.fecha)}
            </text>
          )
        })}

        {/* Relleno degradado bajo la línea, hasta el cero */}
        {puntos.length > 1 && (
          <polygon
            points={`${puntos[0].x.toFixed(1)},${baseArea} ${aPuntos(puntos)} ${puntos[
              puntos.length - 1
            ].x.toFixed(1)},${baseArea}`}
            fill={`url(#${grad})`}
          />
        )}

        {/* La línea de cero va por encima del relleno para que se lea */}
        {crudoMin < 0 && (
          <line
            x1={MARGEN.izq}
            y1={y0}
            x2={ANCHO - MARGEN.der}
            y2={y0}
            stroke="var(--muted)"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        )}

        {/* Tramo real: sólido */}
        {reales.length > 1 && (
          <polyline
            points={aPuntos(reales)}
            fill="none"
            stroke="var(--night)"
            strokeWidth={L.trazo}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Tramo proyectado: punteado y más claro — todavía no pasó */}
        {proyectados.length > 1 && (
          <polyline
            points={aPuntos(proyectados)}
            fill="none"
            stroke="var(--flyway)"
            strokeWidth={L.trazo}
            strokeDasharray="6 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Bajo cero: el tramo se repinta en rojo y se marcan los puntos */}
        {marcarNegativo &&
          puntos.slice(0, -1).map((p, i) => {
            const q = puntos[i + 1]
            if (p.valor >= 0 && q.valor >= 0) return null
            return (
              <line
                key={`neg${i}`}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                stroke="var(--err)"
                strokeWidth={L.trazo}
                strokeLinecap="round"
                strokeDasharray={p.proyectado || q.proyectado ? '6 4' : undefined}
              />
            )
          })}
        {marcarNegativo &&
          puntos
            .filter((p) => p.valor < 0)
            .map((p, i) => (
              <circle key={`pn${i}`} cx={p.x} cy={p.y} r={L.punto} fill="var(--err)" />
            ))}
      </svg>
    </div>
  )
}
