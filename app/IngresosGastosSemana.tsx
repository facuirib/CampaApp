'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/format'
import { Icon } from '@/components/ui'

export interface FilaIngresoGasto {
  label: string
  ingreso: number
  gasto: number
}

interface IngresosGastosSemanaProps {
  /** Todas las semanas con movimiento, de la más vieja a la más nueva. */
  filas: FilaIngresoGasto[]
}

/** Cuántas semanas quedan visibles antes de tocar «Ver las N semanas». */
const VISIBLES = 4

/**
 * Una barra apilada verde/rojo por semana —ingreso y gasto, proporción de lo
 * que esa semana movió—, con las últimas `VISIBLES` siempre a la vista y el
 * resto detrás de un desplegable.
 *
 * Es Client Component solo por el `useState` del desplegable: los datos ya
 * llegan resueltos desde `page.tsx`, acá no se pide ni se calcula nada nuevo.
 */
export default function IngresosGastosSemana({ filas }: IngresosGastosSemanaProps) {
  const [abierto, setAbierto] = useState(false)

  const recientes = filas.slice(-VISIBLES)
  const anteriores = filas.slice(0, Math.max(filas.length - VISIBLES, 0))
  const hayAnteriores = anteriores.length > 0

  const Fila = ({ f }: { f: FilaIngresoGasto }) => {
    const total = f.ingreso + f.gasto
    const pctIngreso = total > 0 ? (f.ingreso / total) * 100 : 0
    const pctGasto = total > 0 ? (f.gasto / total) * 100 : 0
    return (
      <div className="mb-3 last:mb-0">
        <div className="mb-1 flex items-baseline justify-between text-[10.5px]">
          <span className="font-bold text-ink">{f.label}</span>
          <span className="cifra">
            <span className="font-semibold text-oktx">{formatMoney(f.ingreso)}</span>
            <span className="text-muted"> · </span>
            <span className="font-semibold text-errtx">{formatMoney(f.gasto)}</span>
          </span>
        </div>
        <div className="flex h-5 overflow-hidden rounded-md bg-line2">
          {pctIngreso > 0 && (
            <div
              title={`Ingresos: ${formatMoney(f.ingreso)}`}
              style={{ width: `${pctIngreso}%`, background: 'var(--ok)' }}
              className="flex items-center justify-center"
            >
              {pctIngreso > 14 && (
                <span className="text-[9px] font-bold text-white">{Math.round(pctIngreso)}%</span>
              )}
            </div>
          )}
          {pctGasto > 0 && (
            <div
              title={`Gastos: ${formatMoney(f.gasto)}`}
              style={{ width: `${pctGasto}%`, background: 'var(--err)' }}
              className="flex items-center justify-center"
            >
              {pctGasto > 14 && (
                <span className="text-[9px] font-bold text-white">{Math.round(pctGasto)}%</span>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-line bg-white p-4">
      {recientes.map((f) => (
        <Fila key={f.label} f={f} />
      ))}

      {/* El desplegable cuelga DEBAJO de las semanas siempre visibles: al
          abrirlo, las anteriores aparecen a continuación y el panel crece
          hacia abajo. No se reordena por fecha con las recientes —quedan
          agrupadas aparte—, porque lo que se abre es "el resto", no una
          fusión de las dos listas. */}
      {hayAnteriores && (
        <>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-sm py-1.5 text-[10.5px] font-semibold text-blue-d hover:bg-row-hover"
          >
            {abierto ? `Ver últimas ${VISIBLES}` : `Ver las ${filas.length} semanas`}
            <Icon
              name="chevronAbajo"
              size={13}
              className={`shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}
            />
          </button>

          {abierto && (
            <div className="mt-2 border-t border-line pt-3">
              {anteriores.map((f) => (
                <Fila key={f.label} f={f} />
              ))}
            </div>
          )}
        </>
      )}

      <p className="mt-2 text-[10.5px] leading-snug text-muted">
        El largo de cada franja es su parte de lo que se movió esa semana —ingreso más gasto—, no
        una comparación contra el resto del año.
      </p>
    </div>
  )
}
