import { formatMoney, formatMoneyCorto, formatPorcentaje } from '@/lib/format'

/** Un gajo. El `valor` manda el ángulo; nunca se calcula acá. */
export interface GajoTorta {
  label: string
  valor: number
  /**
   * El color, como token CSS —`var(--ok)`—. Sin esto se toma de la paleta por
   * posición.
   *
   * Se pasa cuando el color SIGNIFICA algo: verde ingresos, rojo egresos,
   * ámbar por vencer. Cuando los gajos son categorías sin semántica —«Predio»,
   * «Bar», «Administración»— conviene dejar la paleta neutra, porque pintar de
   * rojo a una categoría cualquiera le inventa una alarma que no tiene.
   */
  color?: string
}

export interface ChartTortaProps {
  gajos: GajoTorta[]
  /**
   * Para cuando el gráfico entra en poco ancho. Mismo criterio que ChartArea:
   * achica el LIENZO, no las letras — el SVG escala por `viewBox`, así que un
   * lienzo más chico deja cada texto en su tamaño nominal en vez de reducirlo.
   */
  compacto?: boolean
  /** Cuántos gajos como máximo. El resto se junta en «Otros». Default 6. */
  tope?: number
  /**
   * La leyenda al costado de la dona en vez de apilada abajo.
   *
   * Es lo que decide la PROPORCIÓN del gráfico, no sólo dónde cae el texto.
   * Con la leyenda abajo el lienzo es casi cuadrado —el alto crece con cada
   * gajo— y al lado de un gráfico de barras, que es ancho y bajo, queda al
   * doble de alto. Al costado, el alto es fijo y la dona entra en un lienzo
   * apaisado que convive con las barras sin que uno aplaste al otro.
   */
  leyendaAlLado?: boolean
  /** Qué se muestra en el centro. Sin esto va el total. */
  centro?: { valor: string; nota?: string }
  /** Texto accesible del gráfico, no un título visible. */
  titulo?: string
  className?: string
}

/**
 * La paleta por defecto, para gajos sin color propio.
 *
 * Arranca en el azul de marca y se abre a los derivados que ya existen en
 * `globals.css`. No se inventan colores nuevos: son los mismos tokens que usa
 * el resto de la app, así que una dona al lado de un badge no discute.
 */
const PALETA = [
  'var(--blue)',
  'var(--flyway)',
  'var(--st-green)',
  'var(--warn)',
  'var(--regale)',
  'var(--muted)',
]

/** El gris de «Otros»: no compite con ninguna categoría real. */
const COLOR_OTROS = 'var(--line)'

/**
 * Una dona: cuánto pesa cada cosa dentro de un total.
 *
 * ── Por qué dona y no torta maciza ────────────────────────────────────────
 *
 * El agujero del medio no es estético: ahí va el TOTAL. Una torta obliga a
 * sumar los gajos con la vista para saber sobre qué se está repartiendo; la
 * dona lo dice. Y en un dashboard, el total es casi siempre el número que se
 * buscaba, con el reparto como respuesta secundaria.
 *
 * ── Ningún número se calcula acá ──────────────────────────────────────────
 *
 * Los porcentajes SÍ se derivan del total de los gajos, y eso no contradice la
 * regla 1: un porcentaje de composición es geometría del gráfico —el ángulo
 * mismo—, no un número de negocio. Los importes que se muestran son los que
 * vinieron, sin tocar. Si hace falta un porcentaje que signifique algo (margen,
 * tasa de cobranza), sale de una vista y entra como `centro`.
 *
 * ── Qué hace con lo que no se puede dibujar ───────────────────────────────
 *
 * Los valores negativos o cero se descartan: un gajo no puede tener ángulo
 * negativo, y meterlo rompería la geometría en silencio. Cuando pasa, se dice
 * al pie —no se esconde—, porque un ingreso negativo suele ser una anulación y
 * es justo lo que alguien querría ver.
 */
export default function ChartTorta({
  gajos,
  compacto = false,
  tope = 6,
  leyendaAlLado = false,
  centro,
  titulo,
  className,
}: ChartTortaProps) {
  // Con la leyenda al costado el lienzo se ensancha y la dona se corre a la
  // izquierda; el `compacto` manda sobre esto, porque en poco ancho no hay
  // lugar para dos columnas.
  const alLado = leyendaAlLado && !compacto
  const lado = compacto ? 300 : alLado ? 640 : 420
  const radio = compacto ? 88 : 116
  const grosor = compacto ? 30 : 38
  const cx = alLado ? 160 : lado / 2
  const cy = compacto ? 108 : 140

  // Lo que no se puede dibujar se separa ANTES de ordenar, para poder contarlo.
  const dibujables = gajos.filter((g) => g.valor > 0)
  const descartados = gajos.length - dibujables.length

  const ordenados = [...dibujables].sort((a, b) => b.valor - a.valor)
  const visibles = ordenados.slice(0, tope)
  const resto = ordenados.slice(tope)
  const items: GajoTorta[] =
    resto.length > 0
      ? [
          ...visibles,
          {
            label: `Otros (${resto.length})`,
            valor: resto.reduce((s, g) => s + g.valor, 0),
            color: COLOR_OTROS,
          },
        ]
      : visibles

  const total = items.reduce((s, g) => s + g.valor, 0)

  if (items.length === 0 || total <= 0) {
    return (
      <div
        className={`rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted ${className ?? ''}`}
      >
        Todavía no hay números para este reparto.
      </div>
    )
  }

  // Los arcos, en orden, arrancando arriba (−90°) y girando a favor del reloj.
  let anguloDesde = -Math.PI / 2
  const arcos = items.map((g, i) => {
    const porcion = g.valor / total
    const anguloHasta = anguloDesde + porcion * Math.PI * 2
    const d = arcoDona(cx, cy, radio, radio - grosor, anguloDesde, anguloHasta)
    const arco = {
      d,
      color: g.color ?? PALETA[i % PALETA.length],
      porcion,
      label: g.label,
      valor: g.valor,
    }
    anguloDesde = anguloHasta
    return arco
  })

  const pasoLeyenda = compacto ? 19 : 21
  const altoLeyenda = items.length * pasoLeyenda + 8
  // Al costado el alto NO depende de cuántos gajos haya: lo fija la dona. Ése
  // es el punto — así la proporción del gráfico es estable y se puede poner al
  // lado de otro sin que la cantidad de categorías decida el layout.
  const alto = alLado ? cy + radio + 24 : cy + radio + 24 + altoLeyenda

  // La columna de la leyenda, centrada verticalmente contra la dona.
  const leyendaX = alLado ? 300 : 14
  const leyendaY0 = alLado
    ? Math.max(28, (alto - items.length * pasoLeyenda) / 2 + 10)
    : cy + radio + 26

  return (
    <div className={`rounded-md border border-line bg-white p-4 ${className ?? ''}`}>
      <svg
        viewBox={`0 0 ${lado} ${alto}`}
        className="block w-full"
        role="img"
        aria-label={titulo ?? 'Reparto por categoría'}
      >
        {titulo && <title>{titulo}</title>}

        {arcos.map((a, i) => (
          <path key={`${a.label}-${i}`} d={a.d} fill={a.color} />
        ))}

        {/* El centro: el total, que es sobre lo que se reparte todo lo demás */}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          fontSize={compacto ? 17 : 21}
          fontWeight={800}
          fill="var(--ink)"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {centro?.valor ?? formatMoneyCorto(total)}
        </text>
        <text
          x={cx}
          y={cy + (compacto ? 14 : 17)}
          textAnchor="middle"
          fontSize={compacto ? 9.5 : 10.5}
          fill="var(--muted)"
        >
          {centro?.nota ?? 'total'}
        </text>

        {/* La leyenda va DENTRO del svg y no en HTML al lado: así el gráfico
            entero es una sola pieza que se puede llevar a un PDF sin rearmar
            nada, que es justo lo que estos componentes tienen que permitir. */}
        {arcos.map((a, i) => {
          const y = leyendaY0 + i * pasoLeyenda
          return (
            <g key={`leyenda-${a.label}-${i}`}>
              <rect x={leyendaX} y={y - 8} width={9} height={9} rx={2} fill={a.color} />
              <text
                x={leyendaX + 16}
                y={y}
                fontSize={compacto ? 10.5 : 11.5}
                fill="var(--ink)"
              >
                {a.label}
              </text>
              <text
                x={lado - 62}
                y={y}
                textAnchor="end"
                fontSize={compacto ? 10.5 : 11.5}
                fill="var(--muted)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatMoney(a.valor)}
              </text>
              <text
                x={lado - 14}
                y={y}
                textAnchor="end"
                fontSize={compacto ? 10.5 : 11.5}
                fontWeight={700}
                fill="var(--ink)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatPorcentaje(a.porcion * 100)}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Lo descartado se DICE. Un ingreso negativo suele ser una anulación, y
          es justo lo que alguien querría ver — esconderlo sería peor que no
          poder dibujarlo. */}
      {descartados > 0 && (
        <p className="mt-2 text-[10.5px] text-muted">
          {descartados === 1
            ? 'Se dejó afuera 1 fila sin importe positivo (no se puede dibujar como gajo).'
            : `Se dejaron afuera ${descartados} filas sin importe positivo (no se pueden dibujar como gajo).`}
        </p>
      )}
    </div>
  )
}

/** El path de un gajo de dona: arco externo, arco interno, y cierra. */
function arcoDona(
  cx: number,
  cy: number,
  rExt: number,
  rInt: number,
  desde: number,
  hasta: number,
): string {
  // Un gajo de 360° no se puede dibujar con un solo arco —el punto inicial y el
  // final coinciden y el path queda vacío—, así que se le resta un pelo. Pasa
  // cuando una sola categoría se lleva todo, que no es un caso raro.
  const fin = hasta - desde >= Math.PI * 2 ? hasta - 0.0001 : hasta
  const grande = fin - desde > Math.PI ? 1 : 0
  const x1 = cx + rExt * Math.cos(desde)
  const y1 = cy + rExt * Math.sin(desde)
  const x2 = cx + rExt * Math.cos(fin)
  const y2 = cy + rExt * Math.sin(fin)
  const x3 = cx + rInt * Math.cos(fin)
  const y3 = cy + rInt * Math.sin(fin)
  const x4 = cx + rInt * Math.cos(desde)
  const y4 = cy + rInt * Math.sin(desde)
  return [
    `M ${x1} ${y1}`,
    `A ${rExt} ${rExt} 0 ${grande} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInt} ${rInt} 0 ${grande} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ')
}
