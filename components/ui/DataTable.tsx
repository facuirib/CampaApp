import Link from 'next/link'
import Badge, { type EstadoBadge } from './Badge'
import Money, { type TonoMoney } from './Money'
import { formatDate } from '@/lib/format'

/** Lo que espera una columna con `format: 'badge'`. */
export interface CeldaBadge {
  estado: EstadoBadge
  label: React.ReactNode
}

export type FormatoCelda = 'text' | 'money' | 'badge' | 'date'
export type AlineacionCelda = 'left' | 'right'
export type ValorCelda = React.ReactNode | CeldaBadge
export type DensidadTabla = 'normal' | 'compacta'

export interface ColumnDef<T> {
  /** Key de la fila. Tipada contra `T`: un typo no compila. */
  key: keyof T & string
  label: React.ReactNode
  /** Default: 'left', salvo en `money`, que se alinea a la derecha sola. */
  align?: AlineacionCelda
  format?: FormatoCelda
  /**
   * Sólo para `format: 'money'`: qué significa la columna, y por lo tanto si
   * lleva color. Default `neutro` — el color se pide, no se hereda.
   */
  tono?: TonoMoney
  width?: number | string
}

export interface DataTableProps<T extends object> {
  columns: ColumnDef<T>[]
  rows: T[]
  /** Key de React de cada fila: el nombre de una columna, o una función. */
  rowKey: (keyof T & string) | ((row: T, indice: number) => React.Key)

  /**
   * La fila de total, si la hay.
   *
   * Se MUESTRA, nunca se calcula. Ver la nota del componente.
   */
  total?: Partial<Record<keyof T & string, ValorCelda>>

  /** `compacta` reduce el alto de fila, para planillas largas. */
  densidad?: DensidadTabla
  emptyMessage?: React.ReactNode

  /**
   * Alto máximo del cuerpo. Sin esto no hay scroll vertical, y sin scroll el
   * header sticky no tiene de dónde agarrarse: se queda fijo respecto de nada.
   */
  maxHeight?: number | string

  /**
   * Navegación a detalle. Renderiza un `<Link>` real, así que anda desde un
   * Server Component, con teclado, clic del medio y "copiar dirección".
   * Es la forma recomendada de abrir el detalle de una fila.
   */
  /**
   * Devolver `undefined` deja esa fila SIN navegación, y el resto de la tabla
   * con la suya. El cuerpo ya lo contemplaba —`href != null` decide si la fila
   * es interactiva—; solo el tipo era más estrecho que el comportamiento.
   * Sirve para listas mixtas donde no toda fila tiene detalle: en /arqueo, el
   * arqueo del bar no se entrega a central, así que no va a esa pantalla.
   */
  rowHref?: (row: T) => string | undefined

  /**
   * Interacción que NO es navegación. Requiere que quien use la tabla sea un
   * Client Component: un handler no cruza la frontera del servidor. Para
   * abrir una pantalla de detalle, `rowHref` es lo que corresponde.
   */
  onRowClick?: (row: T) => void

  className?: string
}

/** Lo que se muestra cuando la celda no trae dato. */
const SIN_DATO = '—'

function esCeldaBadge(valor: unknown): valor is CeldaBadge {
  return typeof valor === 'object' && valor !== null && 'estado' in valor && 'label' in valor
}

/**
 * Una celda, según el formato que declara su columna.
 *
 * Un `money` sin dato muestra "—" y no "$0": en una planilla de deuda, "no
 * sé cuánto" y "cero pesos" son cosas distintas y no pueden verse igual.
 */
function renderValor(valor: unknown, formato: FormatoCelda, tono?: TonoMoney): React.ReactNode {
  if (formato === 'money') {
    return typeof valor === 'number' ? <Money value={valor} tono={tono} /> : SIN_DATO
  }
  if (formato === 'date') {
    return typeof valor === 'string' || valor instanceof Date ? formatDate(valor) : SIN_DATO
  }
  if (formato === 'badge') {
    return esCeldaBadge(valor) ? <Badge estado={valor.estado}>{valor.label}</Badge> : SIN_DATO
  }
  if (valor === null || valor === undefined || valor === '') return SIN_DATO
  return valor as React.ReactNode
}

function alineacionDe<T>(col: ColumnDef<T>): AlineacionCelda {
  return col.align ?? (col.format === 'money' ? 'right' : 'left')
}

const PADDING_FILA: Record<DensidadTabla, string> = {
  normal: 'py-[11px]',
  compacta: 'py-[5px]',
}

/**
 * La tabla del sistema.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTE COMPONENTE NO SUMA. Nunca.
 *
 * `total` se dibuja si viene y no se dibuja si no viene. No hay un `else`
 * que sume la columna, y no puede haberlo: el total correcto sale de una
 * vista SQL con los centavos completos, mientras que la tabla muestra
 * importes redondeados a peso. Sumar la columna en pantalla daría un número
 * parecido y equivocado, y el error sería invisible justo donde más caro
 * sale — la regla 1 del proyecto.
 *
 * La fila navy anclada abajo dice lo mismo visualmente: el total viene de
 * otro lado, no es una fila más del cuerpo.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Abajo de 768px la tabla no scrollea al costado: colapsa a una card por
 * fila, con label y valor. Los formatos se respetan igual. El precio de que
 * el corte sea puro CSS —y por eso funcione sin JavaScript y desde un Server
 * Component— es que los dos layouts van al DOM y uno se oculta.
 *
 * ── Cómo se usa ─────────────────────────────────────────────────────────
 *
 * NO va envuelta en `Card`. La tabla ya es su propio contenedor: trae borde,
 * radio y `overflow-hidden`. Adentro de una Card quedan dos bordes, y con
 * `noPadding` quedan pegados y se ve una línea doble.
 *
 * Si necesita título, el título va ARRIBA de la tabla, no envolviéndola:
 *
 *     <section>
 *       <h2>Diferencias sin resolver</h2>
 *       <DataTable … />
 *     </section>
 */
export default function DataTable<T extends object>({
  columns,
  rows,
  rowKey,
  total,
  densidad = 'normal',
  emptyMessage = 'No hay datos para mostrar.',
  maxHeight,
  rowHref,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const keyDe = (row: T, i: number): React.Key =>
    typeof rowKey === 'function' ? rowKey(row, i) : (row[rowKey] as React.Key)

  const padding = PADDING_FILA[densidad]
  const vacia = rows.length === 0

  // Sin filas se dibuja UN bloque, compartido por los dos anchos, en vez de
  // uno adentro de la tabla y otro adentro de la lista de cards. El mensaje
  // llegaba dos veces al DOM: en el navegador se veía una sola —CSS oculta el
  // layout que no toca— pero estaba escrito dos veces igual, y es la clase de
  // duplicado que después alguien copia creyendo que hace falta.
  if (vacia) {
    return (
      <div className={className}>
        <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
          {emptyMessage}
        </div>
      </div>
    )
  }

  const celdasTotal = total
    ? columns.map((col) => ({
        col,
        contenido: col.key in total ? renderValor(total[col.key], col.format ?? 'text', col.tono) : null,
      }))
    : null

  return (
    <div className={className}>
      {/* ── Desktop ─────────────────────────────────────────────────────── */}
      <div className="hidden overflow-hidden rounded-md border border-line bg-white md:block">
        <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={[
                      'sticky top-0 z-20 bg-line2 px-3 py-2.5',
                      'text-[9px] font-bold uppercase tracking-[.04em] text-muted',
                      'whitespace-nowrap',
                      alineacionDe(col) === 'right' ? 'text-right' : 'text-left',
                    ].join(' ')}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="[&>tr:last-child>td]:border-b-0">
              {rows.map((row, i) => {
                const href = rowHref?.(row)
                const interactiva = href != null || onRowClick != null
                return (
                  <tr
                    key={keyDe(row, i)}
                    // `relative` es lo que deja al <Link> de la primera celda
                    // cubrir la fila entera con su ::after.
                    className={[
                      'relative',
                      i % 2 === 1 ? 'bg-zebra' : 'bg-white',
                      interactiva ? 'cursor-pointer hover:bg-row-hover' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    {...(onRowClick && {
                      onClick: () => onRowClick(row),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onRowClick(row)
                        }
                      },
                      tabIndex: 0,
                      role: 'button',
                    })}
                  >
                    {columns.map((col, j) => {
                      const contenido = renderValor(row[col.key], col.format ?? 'text', col.tono)
                      return (
                        <td
                          key={col.key}
                          className={[
                            'border-b border-line2 px-3',
                            padding,
                            alineacionDe(col) === 'right' ? 'text-right' : 'text-left',
                            col.format === 'money' ? 'font-bold text-ink' : 'text-ink/90',
                          ].join(' ')}
                        >
                          {/* El link va en la primera celda y se estira sobre
                              toda la fila. Si el estirado fallara, sigue
                              siendo un link que navega. */}
                          {j === 0 && href ? (
                            <Link
                              href={href}
                              className="font-semibold after:absolute after:inset-0 hover:underline"
                            >
                              {contenido}
                            </Link>
                          ) : (
                            contenido
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>

            {/* Anclado abajo: sticky y no un div hermano, para que siga
                alineado con las columnas cuando la tabla scrollea al costado. */}
            {celdasTotal && (
              <tfoot>
                <tr>
                  {celdasTotal.map(({ col, contenido }) => (
                    <td
                      key={col.key}
                      className={[
                        'sticky bottom-0 z-20 bg-night px-3 py-3',
                        'text-[11px] font-extrabold text-white',
                        alineacionDe(col) === 'right' ? 'text-right' : 'text-left',
                      ].join(' ')}
                    >
                      {contenido}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Mobile: una card por fila, sin scroll horizontal ─────────────── */}
      <div className="grid gap-2 md:hidden">
        {rows.map((row, i) => {
          const href = rowHref?.(row)
          const cuerpo = (
            <dl className="grid gap-1.5">
              {columns.map((col) => (
                <div key={col.key} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[9px] font-bold uppercase tracking-[.04em] text-muted">
                    {col.label}
                  </dt>
                  <dd
                    className={[
                      'min-w-0 text-right text-[11px]',
                      col.format === 'money' ? 'font-bold text-ink' : 'font-semibold text-ink/90',
                    ].join(' ')}
                  >
                    {renderValor(row[col.key], col.format ?? 'text', col.tono)}
                  </dd>
                </div>
              ))}
            </dl>
          )

          const clases = 'rounded-md border border-line bg-white p-3 shadow-sm'

          if (href) {
            // Mismo patrón que la fila desktop: el link cubre toda la card
            // con after:absolute after:inset-0, sin envolver el contenido
            // — así una celda interna (ej. "Adjuntar comprobante") puede
            // tener su propio <a> sin quedar anidado dentro de este.
            return (
              <div key={keyDe(row, i)} className={`${clases} relative`}>
                <Link href={href} className="absolute inset-0" aria-label="Ver detalle" />
                <div className="relative">{cuerpo}</div>
              </div>
            )
          }
          if (onRowClick) {
            return (
              <button
                key={keyDe(row, i)}
                type="button"
                onClick={() => onRowClick(row)}
                className={`${clases} block w-full text-left`}
              >
                {cuerpo}
              </button>
            )
          }
          return (
            <div key={keyDe(row, i)} className={clases}>
              {cuerpo}
            </div>
          )
        })}

        {celdasTotal && (
          <dl className="grid gap-1.5 rounded-md bg-night p-3 text-white">
            {celdasTotal
              .filter(({ contenido }) => contenido !== null)
              .map(({ col, contenido }) => (
                <div key={col.key} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[9px] font-bold uppercase tracking-[.04em] text-white/60">
                    {col.label}
                  </dt>
                  <dd className="min-w-0 text-right text-[11px] font-extrabold">{contenido}</dd>
                </div>
              ))}
          </dl>
        )}
      </div>
    </div>
  )
}
