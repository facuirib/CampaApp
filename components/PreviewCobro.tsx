"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/db/client'
import { AsientoPreview } from '@/components/ui'
import { ERROR_PREVIEW_INESPERADO, leerPreviewAsiento, type PreviewAsiento } from '@/lib/db/preview'

/**
 * El asiento que va a generar un cobro, antes de registrarlo.
 *
 * Este componente hace UNA cosa: conseguir el asiento. Lo pide a
 * `preview_cobro`, que espeja a `registrar_cobro` —la función que después
 * escribe de verdad—, así que lo que se muestra acá es lo que va a quedar en
 * el diario. El dibujo lo hace `AsientoPreview`, el mismo que usan el resto de
 * las pantallas, para que un asiento se vea igual en toda la app.
 *
 * Sigue siendo cliente porque el asiento se recalcula mientras el operador
 * cambia el monto, el medio y la imputación.
 */

interface PreviewCobroProps {
  terceroId: string
  monto: number
  medio: 'efectivo' | 'transferencia' | 'cheque'
  imputaciones: { cuota_id: string; monto: number }[]
}

export default function PreviewCobro({ terceroId, monto, medio, imputaciones }: PreviewCobroProps) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<PreviewAsiento | null>(null)

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

      const { data, error } = await supabase.rpc('preview_cobro', {
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
        const asiento = leerPreviewAsiento(data)
        setError(asiento ? null : ERROR_PREVIEW_INESPERADO)
        setResultado(asiento)
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
    <AsientoPreview
      colapsable
      cargando={cargando}
      error={error}
      // Mientras carga o falla no hay asiento todavía: el marco se dibuja igual
      // y el cuerpo muestra el estado, que es lo que hacía la versión anterior.
      lineas={resultado?.lineas ?? []}
      totalDebe={resultado?.total_debe ?? 0}
      totalHaber={resultado?.total_haber ?? 0}
      balanceado={resultado?.balanceado ?? false}
    />
  )
}
