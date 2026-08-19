import Link from 'next/link'
import { formatMoney } from '@/lib/format'

/**
 * La grilla de un mes, con el resumen de cada día adentro.
 *
 * No lleva `"use client"` y no tiene estado: el día abierto, el mes y la vista
 * viven en la URL, así que cada celda es un `<Link>` y la pantalla se
 * renderiza entera en el servidor. Eso además hace que un día concreto sea una
 * dirección que se comparte —`?dia=2026-08-08`— y que el botón "atrás" haga lo
 * que uno espera.
 *
 * No suma nada: recibe los totales por día ya resueltos por `v_calendario_dia`
 * y los dibuja (regla 1).
 */

export interface DiaCalendario {
  dia: string
  items: number
  entra: number
  sale: number
  neto: number
  vencidos: number
}

export interface MatrizMesProps {
  /** Primer día del mes, en ISO: '2026-08-01'. */
  mes: string
  dias: DiaCalendario[]
  /** El día abierto, si hay alguno. */
  diaAbierto?: string | null
  /** Se le agrega `&dia=`. Ya trae la vista y el mes. */
  hrefBase: string
  /** Hoy, en ISO. Viene de la pantalla para no depender del reloj del cliente. */
  hoy: string
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Los días del mes, más los huecos del principio para alinear la primera semana. */
function celdasDelMes(mes: string): (string | null)[] {
  const [anio, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate()

  // getUTCDay() da 0 para domingo; la grilla arranca en lunes.
  const primerDia = new Date(Date.UTC(anio, m - 1, 1)).getUTCDay()
  const huecos = (primerDia + 6) % 7

  const celdas: (string | null)[] = Array(huecos).fill(null)
  for (let d = 1; d <= ultimo; d++) {
    celdas.push(`${anio}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return celdas
}

export default function MatrizMes({ mes, dias, diaAbierto, hrefBase, hoy }: MatrizMesProps) {
  const porDia = new Map(dias.map((d) => [d.dia, d]))
  const celdas = celdasDelMes(mes)

  return (
    <div className="overflow-hidden rounded-md border border-line bg-white">
      <div className="grid grid-cols-7 border-b border-line bg-panel">
        {DIAS_SEMANA.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[9px] font-bold uppercase tracking-[.06em] text-muted"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {celdas.map((iso, i) => {
          if (!iso) {
            // Hueco de alineación: no es un día, así que no lleva número ni borde
            // de celda vacía — si no, parecería un día sin vencimientos.
            return <div key={`hueco-${i}`} className="min-h-[86px] bg-panel/40" />
          }

          const d = porDia.get(iso)
          const numero = Number(iso.slice(8))
          const esHoy = iso === hoy
          const abierto = iso === diaAbierto

          if (!d) {
            return (
              <div
                key={iso}
                className={`min-h-[86px] border-b border-r border-line2 px-2 py-1.5 ${
                  esHoy ? 'bg-blue-l/40' : ''
                }`}
              >
                <span
                  className={`text-[11px] ${esHoy ? 'font-bold text-blue-d' : 'text-muted/60'}`}
                >
                  {numero}
                </span>
              </div>
            )
          }

          return (
            <Link
              key={iso}
              href={`${hrefBase}&dia=${iso}`}
              scroll={false}
              className={[
                'block min-h-[86px] border-b border-r border-line2 px-2 py-1.5 transition',
                abierto ? 'bg-blue-l ring-1 ring-inset ring-blue-d' : 'hover:bg-row-hover',
                // Un día con vencidos es una alerta, y se ve antes de leer:
                // la franja izquierda lo separa del resto sin gritar.
                d.vencidos > 0 && !abierto ? 'border-l-2 border-l-err bg-errbg/30' : '',
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className={`text-[11px] font-bold ${esHoy ? 'text-blue-d' : 'text-ink'}`}
                >
                  {numero}
                </span>
                <span className="text-[9px] text-muted">
                  {d.items} venc.
                </span>
              </div>

              <div className="mt-1 space-y-0.5">
                {/* Sólo se dibuja el lado que existe: un "−$0" en un día que
                    únicamente cobra es ruido que hay que leer para descartar. */}
                {d.entra !== 0 && (
                  <div className="cifra truncate text-[10.5px] font-bold text-oktx">
                    +{formatMoney(d.entra)}
                  </div>
                )}
                {d.sale !== 0 && (
                  <div className="cifra truncate text-[10.5px] font-bold text-errtx">
                    {formatMoney(d.sale)}
                  </div>
                )}
              </div>

              {d.vencidos > 0 && (
                <div className="mt-1 text-[9px] font-bold uppercase tracking-[.04em] text-errtx">
                  {d.vencidos} vencido{d.vencidos === 1 ? '' : 's'}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
