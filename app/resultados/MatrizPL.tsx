"use client"

import { Fragment, useState } from 'react'
import { formatMoney } from '@/lib/format'
import { MESES } from '@/lib/domain/pl'
import { Icon } from '@/components/ui'

/**
 * La matriz del P&L: conceptos en filas, los doce meses en columnas.
 *
 * Es lo ÚNICO cliente de la pantalla, y sólo por una razón: abrir y cerrar el
 * desglose de una categoría. Todos los números llegan calculados desde las
 * vistas —incluidas las filas de total y la de resultado, que salen de
 * `v_pl_mensual_total`—: acá no se suma nada.
 *
 * Es una tabla propia y no un `DataTable` porque las dos cosas que la definen
 * —doce columnas generadas y filas que se despliegan a sus ítems— son
 * justamente lo que el DataTable no hace. Forzarlo habría sido pelearse con
 * un componente que resuelve otro problema.
 */

export interface FilaCuenta {
  codigo: string
  nombre: string
  /** Doce montos, de enero a diciembre. */
  meses: number[]
  total: number
  /** Los ítems del desglose. Vacío = la fila no se abre. */
  items: { item: string; meses: number[]; total: number }[]
}

export interface FilaTotal {
  label: string
  meses: number[]
  total: number
}

export interface MatrizPLProps {
  ingresos: FilaCuenta[]
  egresos: FilaCuenta[]
  financieros: FilaCuenta[]
  totalIngresos: FilaTotal
  totalEgresos: FilaTotal
  resultado: FilaTotal
  /** Para que la fila de financieros diga de dónde sale. */
  hayFinancieros: boolean
}

/**
 * Una celda de plata. El cero va en gris para que no compita con las cifras.
 *
 * `tono` sólo se usa en las filas de TOTAL, y a propósito: pintar las 12 celdas
 * de cada concepto dejaría la mitad de la tabla en rojo, y el rojo dejaría de
 * significar. El bloque ya dice «Ingresos» o «Egresos»; lo que hay que ver de
 * un vistazo son las dos magnitudes que se comparan.
 */
function Celda({
  valor,
  fuerte = false,
  tono,
}: {
  valor: number
  fuerte?: boolean
  tono?: 'ingreso' | 'egreso'
}) {
  const color =
    valor === 0
      ? 'text-disabled'
      : tono === 'ingreso'
        ? 'text-oktx'
        : tono === 'egreso'
          ? 'text-errtx'
          : 'text-ink'
  return (
    <td
      className={[
        'whitespace-nowrap px-3 py-2 text-right tabular-nums',
        color,
        fuerte && valor !== 0 ? 'font-bold' : '',
      ].join(' ')}
    >
      {formatMoney(valor)}
    </td>
  )
}

function Encabezado() {
  return (
    <thead>
      <tr className="border-b border-line bg-line2">
        <th className="sticky left-0 z-10 min-w-[210px] bg-line2 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[.08em] text-muted">
          Concepto
        </th>
        {MESES.map((m) => (
          <th
            key={m}
            className="min-w-[104px] px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[.08em] text-muted"
          >
            {m}
          </th>
        ))}
        <th className="min-w-[124px] border-l border-line px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[.08em] text-muted">
          Año
        </th>
      </tr>
    </thead>
  )
}

function Bloque({
  tono,
  titulo,
  filas,
  total,
  expandible,
}: {
  /** Sólo tiñe la fila de total del bloque, no sus conceptos. */
  tono?: 'ingreso' | 'egreso'
  titulo: string
  filas: FilaCuenta[]
  total?: FilaTotal
  expandible: boolean
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())

  function alternar(codigo: string) {
    setAbiertas((previas) => {
      const proximas = new Set(previas)
      if (proximas.has(codigo)) proximas.delete(codigo)
      else proximas.add(codigo)
      return proximas
    })
  }

  return (
    <>
      <tr className="border-b border-line bg-white">
        <th
          colSpan={14}
          className="sticky left-0 bg-white px-3 py-2 text-left text-[10.5px] font-extrabold uppercase tracking-[.1em] text-blue-d"
        >
          {titulo}
        </th>
      </tr>

      {filas.map((fila) => {
        // Sólo se abre si tiene desglose: una categoría sin ítems con un ▶ que
        // no hace nada es peor que no tenerlo.
        const abre = expandible && fila.items.length > 0
        const abierta = abiertas.has(fila.codigo)

        return (
          <Fragment key={fila.codigo}>
            <tr className="border-b border-line2 hover:bg-row-hover">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-ink hover:bg-row-hover">
                {abre ? (
                  <button
                    type="button"
                    onClick={() => alternar(fila.codigo)}
                    aria-expanded={abierta}
                    className="flex items-center gap-1.5 text-left text-[12px] font-semibold text-ink hover:text-blue-d"
                  >
                    <Icon
                      name="chevronDerecha"
                      size={13}
                      className={[
                        'shrink-0 text-muted transition-transform',
                        abierta ? 'rotate-90' : '',
                      ].join(' ')}
                    />
                    {fila.nombre}
                  </button>
                ) : (
                  // El sangrado iguala a las que sí tienen flecha, para que los
                  // nombres queden alineados entre sí y no escalonados.
                  <span className="block pl-[19px] text-[12px] font-semibold text-ink">
                    {fila.nombre}
                  </span>
                )}
              </th>
              {fila.meses.map((m, i) => (
                <Celda key={i} valor={m} />
              ))}
              <td className="whitespace-nowrap border-l border-line px-3 py-2 text-right font-bold tabular-nums text-ink">
                {formatMoney(fila.total)}
              </td>
            </tr>

            {abre &&
              abierta &&
              fila.items.map((item) => (
                <tr key={`${fila.codigo}-${item.item}`} className="border-b border-line2 bg-zebra">
                  <th className="sticky left-0 z-10 bg-zebra px-3 py-1.5 pl-[38px] text-left text-[11.5px] font-normal text-muted">
                    {item.item}
                  </th>
                  {item.meses.map((m, i) => (
                    <td
                      key={i}
                      className={[
                        'whitespace-nowrap px-3 py-1.5 text-right text-[11.5px] tabular-nums',
                        m === 0 ? 'text-disabled' : 'text-muted',
                      ].join(' ')}
                    >
                      {formatMoney(m)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap border-l border-line px-3 py-1.5 text-right text-[11.5px] font-semibold tabular-nums text-muted">
                    {formatMoney(item.total)}
                  </td>
                </tr>
              ))}
          </Fragment>
        )
      })}

      {total && (
        <tr className="border-b-2 border-line bg-line2/60">
          <th className="sticky left-0 z-10 bg-[#eef1f6] px-3 py-2 text-left text-[12px] font-extrabold text-ink">
            {total.label}
          </th>
          {total.meses.map((m, i) => (
            <Celda key={i} valor={m} fuerte tono={tono} />
          ))}
          <td
            className={[
              'whitespace-nowrap border-l border-line px-3 py-2 text-right font-extrabold tabular-nums',
              total.total === 0
                ? 'text-disabled'
                : tono === 'ingreso'
                  ? 'text-oktx'
                  : tono === 'egreso'
                    ? 'text-errtx'
                    : 'text-ink',
            ].join(' ')}
          >
            {formatMoney(total.total)}
          </td>
        </tr>
      )}
    </>
  )
}

export default function MatrizPL({
  ingresos,
  egresos,
  financieros,
  totalIngresos,
  totalEgresos,
  resultado,
  hayFinancieros,
}: MatrizPLProps) {
  return (
    // El scroll horizontal vive acá y no en el body: son catorce columnas y en
    // una laptop no entran. La primera columna queda fija —`sticky left-0`—
    // porque un número sin su concepto al lado no dice nada.
    <div className="overflow-x-auto rounded-md border border-line bg-white shadow-sm">
      <table className="w-full border-collapse text-[12px]">
        <Encabezado />
        <tbody>
          <Bloque
            tono="ingreso"
            titulo="Ingresos"
            filas={ingresos}
            total={totalIngresos}
            expandible={false}
          />
          <Bloque tono="egreso" titulo="Egresos" filas={egresos} total={totalEgresos} expandible />

          {hayFinancieros && (
            <Bloque titulo="Resultado financiero" filas={financieros} expandible={false} />
          )}

          {/* La fila que contesta la pregunta de la pantalla. Va con el fondo
              del sistema y el color en el número: verde arriba de cero, rojo
              abajo. El color acompaña al signo, que ya está en la cifra — no
              lo reemplaza. */}
          <tr className="bg-night">
            <th className="sticky left-0 z-10 bg-night px-3 py-2.5 text-left text-[12px] font-extrabold uppercase tracking-[.06em] text-white">
              Resultado
            </th>
            {resultado.meses.map((m, i) => (
              <td
                key={i}
                className={[
                  'whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums',
                  m === 0 ? 'text-white/35' : m > 0 ? 'text-ok' : 'text-err',
                ].join(' ')}
              >
                {formatMoney(m)}
              </td>
            ))}
            <td
              className={[
                'whitespace-nowrap border-l border-white/20 px-3 py-2.5 text-right font-extrabold tabular-nums',
                resultado.total === 0
                  ? 'text-white/35'
                  : resultado.total > 0
                    ? 'text-ok'
                    : 'text-err',
              ].join(' ')}
            >
              {formatMoney(resultado.total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
