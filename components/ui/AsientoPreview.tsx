import Badge from './Badge'
import Icon from './Icon'
import Money from './Money'
import { formatDate } from '@/lib/format'

/** Una línea del asiento. Viene de una función de preview, nunca se arma acá. */
export interface LineaAsiento {
  /** Código de cuenta: 'CAJA_TRANSFERENCIA'. */
  cuenta: string
  /** Nombre legible, si la función de preview lo devuelve. Si no, va el código. */
  nombre?: string | null
  /** Solo viene el lado que corresponde; el otro llega ausente. */
  debe?: number | null
  haber?: number | null
}

export interface AsientoPreviewProps {
  lineas: LineaAsiento[]

  /**
   * Totales y balance TAL COMO los devuelve la función de preview.
   *
   * El componente no los calcula. Sumar las líneas acá sería exactamente el
   * error que el patrón preview existe para evitar: el front mostraría un
   * total propio, que podría no ser el del asiento que se va a escribir.
   */
  totalDebe: number
  totalHaber: number
  balanceado: boolean

  /** Los pone la pantalla: el payload del preview no trae ni una ni otra. */
  descripcion?: React.ReactNode
  fecha?: string | Date

  cargando?: boolean
  error?: string | null

  colapsable?: boolean
  defaultAbierto?: boolean

  className?: string
}

/**
 * El asiento contable, dibujado.
 *
 * No sabe si es un cobro, un gasto, un arqueo o un retiro de socio: recibe las
 * líneas ya resueltas y las muestra. Por eso el asiento se ve igual en toda la
 * app — lo dibuja siempre el mismo componente.
 *
 * Tampoco llama a ninguna función SQL. Cada pantalla consigue su asiento de SU
 * función de preview (`preview_cobro` hoy; `preview_gasto` y las demás cuando
 * existan), que espeja a la función real de escritura. Si el front armara el
 * asiento por su cuenta, podría diferir del que se va a escribir de verdad y
 * el preview estaría mintiendo.
 *
 * `balanceado` se dibuja como viene, no se recalcula. Si una función de preview
 * informa un balance real, el badge lo refleja; si informa uno tautológico, el
 * arreglo va en la función.
 */
export default function AsientoPreview({
  lineas,
  totalDebe,
  totalHaber,
  balanceado,
  descripcion,
  fecha,
  cargando = false,
  error = null,
  colapsable = false,
  defaultAbierto = false,
  className,
}: AsientoPreviewProps) {
  const marco = ['overflow-hidden rounded-md border border-line bg-white', className]
    .filter(Boolean)
    .join(' ')

  const cuerpo = (
    <div className="px-3 pb-3">
      {cargando && <p className="py-3 text-[11px] text-muted">Calculando asiento…</p>}

      {error && (
        <p className="my-2 rounded-sm bg-errbg px-3 py-2 text-[11px] text-errtx">{error}</p>
      )}

      {!cargando && !error && (
        <>
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                <th className="border-b border-line px-1 py-1.5 text-left text-[9px] font-bold uppercase tracking-[.04em] text-muted">
                  Cuenta
                </th>
                <th className="border-b border-line px-1 py-1.5 text-right text-[9px] font-bold uppercase tracking-[.04em] text-muted">
                  Debe
                </th>
                <th className="border-b border-line px-1 py-1.5 text-right text-[9px] font-bold uppercase tracking-[.04em] text-muted">
                  Haber
                </th>
              </tr>
            </thead>

            <tbody>
              {lineas.map((linea, i) => {
                const esHaber = linea.haber != null
                return (
                  <tr key={`${linea.cuenta}-${i}`} className="border-b border-line2">
                    {/* Las líneas al haber van indentadas, como se escribe un
                        asiento a mano: el debe arriba y a la izquierda, el
                        haber debajo y corrido. Se lee de un vistazo qué entra
                        y qué sale. */}
                    <td
                      className={`px-1 py-1.5 text-ink ${esHaber ? 'pl-5 text-muted' : 'font-semibold'}`}
                    >
                      {esHaber && <span aria-hidden>a </span>}
                      {linea.nombre || linea.cuenta}
                    </td>
                    <td className="px-1 py-1.5 text-right font-bold text-ink">
                      {/* El lado vacío va en blanco, no con "—": no es un dato
                          que falta, es la estructura del asiento. */}
                      {linea.debe != null && <Money value={linea.debe} />}
                    </td>
                    <td className="px-1 py-1.5 text-right font-bold text-ink">
                      {linea.haber != null && <Money value={linea.haber} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>

            <tfoot>
              <tr className="bg-line2/70">
                <td className="px-1 py-2 text-[10px] font-extrabold uppercase tracking-[.04em] text-ink">
                  Total
                </td>
                <td className="px-1 py-2 text-right text-[11px] font-extrabold text-ink">
                  <Money value={totalDebe} />
                </td>
                <td className="px-1 py-2 text-right text-[11px] font-extrabold text-ink">
                  <Money value={totalHaber} />
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-2.5">
            {balanceado ? (
              <Badge estado="ok">Debe = Haber</Badge>
            ) : (
              <Badge estado="mora">No balancea</Badge>
            )}
          </div>
        </>
      )}
    </div>
  )

  const encabezado = (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="text-[11px] font-bold text-ink">Asiento contable</span>
      {descripcion && <span className="truncate text-[10px] text-muted">{descripcion}</span>}
      {fecha && (
        <span className="ml-auto shrink-0 text-[10px] text-muted">{formatDate(fecha)}</span>
      )}
    </span>
  )

  if (!colapsable) {
    return (
      <div className={marco}>
        <div className="border-b border-line px-3 py-2.5">{encabezado}</div>
        {cuerpo}
      </div>
    )
  }

  // <details> nativo: el plegado no necesita estado ni JavaScript, así que el
  // componente se puede renderizar desde un Server Component. Y el teclado
  // funciona solo.
  return (
    <details className={`group ${marco}`} open={defaultAbierto}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 hover:bg-row-hover [&::-webkit-details-marker]:hidden">
        <Icon
          name="chevronDerecha"
          size={13}
          className="shrink-0 text-muted transition-transform group-open:rotate-90"
        />
        {encabezado}
      </summary>
      <div className="border-t border-line pt-1">{cuerpo}</div>
    </details>
  )
}
