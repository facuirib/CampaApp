"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'

interface PreviewAsientoProps {
  terceroId: string
  monto: number
  medio: 'efectivo' | 'transferencia' | 'cheque'
  imputaciones: { cuota_id: string; monto: number }[]
}

interface LineaAsiento {
  cuenta: string
  debe?: number
  haber?: number
  tercero_id?: string
}

interface PreviewCobroResult {
  lineas: LineaAsiento[]
  total_debe: number
  total_haber: number
  balanceado: boolean
}

export default function PreviewAsiento({
  terceroId,
  monto,
  medio,
  imputaciones,
}: PreviewAsientoProps) {
  const [expandido, setExpandido] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<PreviewCobroResult | null>(null)

  const hayImputaciones = imputaciones.length > 0
  const imputacionesKey = JSON.stringify(imputaciones)

  useEffect(() => {
    if (monto <= 0 || !hayImputaciones) {
      setResultado(null)
      setError(null)
      return
    }

    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setError(null)

      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: PreviewCobroResult | null; error: { message: string } | null }>
      )('preview_cobro', {
        p_tercero_id: terceroId,
        p_monto: monto,
        p_medio: medio,
        p_imputaciones: imputaciones,
      })

      if (cancelado) return

      if (error) {
        setError(error.message)
        setResultado(null)
      } else {
        setResultado(data)
      }
      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terceroId, monto, medio, imputacionesKey])

  if (monto <= 0 || !hayImputaciones) return null

  return (
    <div className="border border-gray-200 rounded text-sm">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
      >
        <span>{expandido ? '▼' : '▶'}</span>
        <span>Ver asiento contable</span>
      </button>

      {expandido && (
        <div className="border-t border-gray-200 px-3 py-3">
          {cargando && <p className="text-gray-500">Calculando asiento…</p>}

          {error && (
            <pre className="text-red-600 text-sm bg-red-50 p-2 rounded whitespace-pre-wrap">
              {error}
            </pre>
          )}

          {!cargando && !error && resultado && (
            <>
              <table className="w-full border-collapse mb-2">
                <thead>
                  <tr className="text-left border-b border-gray-300">
                    <th className="py-1 pr-4">Cuenta</th>
                    <th className="py-1 pr-4">Debe</th>
                    <th className="py-1 pr-4">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.lineas.map((linea, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1 pr-4">{linea.cuenta}</td>
                      <td className="py-1 pr-4">
                        {linea.debe != null ? formatMoney(linea.debe) : ''}
                      </td>
                      <td className="py-1 pr-4">
                        {linea.haber != null ? formatMoney(linea.haber) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t border-gray-300">
                    <td className="py-1 pr-4">Total</td>
                    <td className="py-1 pr-4">{formatMoney(resultado.total_debe)}</td>
                    <td className="py-1 pr-4">{formatMoney(resultado.total_haber)}</td>
                  </tr>
                </tfoot>
              </table>

              {resultado.balanceado ? (
                <span className="inline-block text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5 text-xs">
                  ✓ Balanceado
                </span>
              ) : (
                <span className="inline-block text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5 text-xs">
                  ✗ No balancea
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}