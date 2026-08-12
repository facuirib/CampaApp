import Link from 'next/link'
import { formatMoney, formatMoneyCorto } from '@/lib/format'
import { NATURALEZAS } from '@/lib/domain/gasto'
import { hrefGastos, type ParamsGastos } from './filtros'

/**
 * Las cuatro tarjetas de naturaleza: monitoreo y filtro a la vez.
 *
 * Son `<Link>` y no botones: el filtro vive en la URL —igual que `FiltrosUrl`—
 * así que la pantalla filtrada se puede compartir, el botón «atrás» hace lo
 * que uno espera, y **la página sigue siendo Server Component**. Un `useState`
 * acá obligaría a bajar toda la lista al cliente para esconder filas.
 *
 * Tocar la tarjeta activa la limpia: el `href` de la que ya está seleccionada
 * quita el parámetro en vez de repetirlo. Sin eso, la única forma de volver a
 * «todas» sería un botón aparte que nadie busca.
 *
 * Se muestran **las cuatro siempre**, tengan gastos o no. Una naturaleza en
 * cero es información —«este mes no hubo inversiones»— y además son la leyenda
 * de qué clasificaciones existen: si desaparecieran, nadie sabría que se puede
 * clasificar así.
 */

export interface TotalNaturaleza {
  naturaleza: string
  total: number
  pagado: number
  adeudado: number
  gastos: number
}

export interface TarjetasNaturalezaProps {
  totales: TotalNaturaleza[]
  /** La naturaleza filtrada hoy, o null si están todas. */
  activa: string | null
  /** Los parámetros actuales, para construir los href sin perder el resto. */
  params: ParamsGastos
}

export default function TarjetasNaturaleza({ totales, activa, params }: TarjetasNaturalezaProps) {
  const mayor = Math.max(...totales.map((t) => t.total), 1)

  return (
    <div className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(228px,1fr))]">
      {NATURALEZAS.map((nat) => {
        const t = totales.find((x) => x.naturaleza === nat.valor)
        const total = t?.total ?? 0
        const pagado = t?.pagado ?? 0
        const adeudado = t?.adeudado ?? 0
        const esActiva = activa === nat.valor

        // La proporción es contra la naturaleza MÁS GRANDE, no contra el total
        // de todas: así la mayor llena la barra y las diferencias entre las
        // chicas se distinguen. Contra el total, tres de cuatro serían hilos.
        const proporcion = (total / mayor) * 100
        const proporcionPagada = total > 0 ? (pagado / mayor) * 100 : 0

        return (
          <Link
            key={nat.valor}
            href={hrefGastos(params, { naturaleza: esActiva ? null : nat.valor })}
            aria-pressed={esActiva}
            className={[
              'group flex flex-col gap-2 rounded-md border bg-white p-4 transition-all',
              esActiva
                ? 'border-blue shadow-[0_0_0_1px_var(--blue)]'
                : 'border-line shadow-sm hover:border-regale hover:shadow-md',
            ].join(' ')}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={[
                  'text-[10px] font-bold uppercase tracking-[.08em]',
                  esActiva ? 'text-blue-d' : 'text-muted',
                ].join(' ')}
              >
                {nat.label}
              </span>
              {esActiva && (
                <span className="text-[9.5px] font-bold uppercase tracking-[.06em] text-blue-d">
                  filtrando
                </span>
              )}
            </div>

            <span className="cifra text-[21px] font-extrabold leading-none tracking-[-.4px] text-ink">
              {formatMoney(total)}
            </span>

            {/* La barra dice dos cosas de una: cuánto pesa esta naturaleza
                contra la mayor, y qué parte ya se pagó. */}
            <div className="relative h-[7px] overflow-hidden rounded-pill bg-line2">
              <div
                className="absolute inset-y-0 left-0 rounded-pill bg-regale"
                style={{ width: `${proporcion}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-pill bg-ok"
                style={{ width: `${proporcionPagada}%` }}
              />
            </div>

            <p className="text-[10.5px] leading-snug text-muted">
              {total === 0 ? (
                <span className="text-disabled">Sin gastos en el período</span>
              ) : adeudado > 0 ? (
                <>
                  <span className="font-semibold text-warntx">
                    {formatMoneyCorto(adeudado)} sin pagar
                  </span>{' '}
                  · {t?.gastos} {t?.gastos === 1 ? 'gasto' : 'gastos'}
                </>
              ) : (
                <>
                  <span className="font-semibold text-oktx">Todo pagado</span> · {t?.gastos}{' '}
                  {t?.gastos === 1 ? 'gasto' : 'gastos'}
                </>
              )}
            </p>

            <p className="text-[10px] text-disabled">{nat.ayuda}</p>
          </Link>
        )
      })}
    </div>
  )
}
