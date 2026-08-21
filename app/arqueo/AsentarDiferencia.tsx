"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button, Money } from '@/components/ui'

export interface AsentarDiferenciaProps {
  arqueoId: string
  ambito: string
  diferencia: number
  cuenta: string
}

/**
 * Asentar la diferencia de un arqueo.
 *
 * Es un PASO SEPARADO del arqueo, y a propósito. `crear_arqueo` no genera
 * asiento: contar la plata es un control, no un movimiento. Recién cuando
 * alguien decide que la diferencia es real —y no un conteo mal hecho— se
 * escribe el ajuste, que sí mueve el libro.
 *
 * Hasta el 21/08 ese paso NO EXISTÍA: `asiento_ajuste_id` quedaba NULL para
 * siempre y el faltante se quedaba como residuo en la caja. Este botón es la
 * primera vez que la columna se llena.
 *
 * No pide motivo, a diferencia de las anulaciones: el motivo es el arqueo
 * mismo, que ya guarda contado, sistema y responsable. Lo que sí pide es un
 * segundo click sobre un panel que dice exactamente qué cuentas se mueven,
 * porque un ajuste toca el resultado.
 */
export default function AsentarDiferencia({
  arqueoId,
  ambito,
  diferencia,
  cuenta,
}: AsentarDiferenciaProps) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const faltante = diferencia < 0
  const monto = Math.abs(diferencia)

  async function asentar() {
    setEnviando(true)
    setError(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setEnviando(false)
      setError('Sesión vencida. Volvé a entrar para asentar el ajuste.')
      return
    }

    const { error: errRpc } = await supabase.rpc('asentar_diferencia_arqueo', {
      p_arqueo_id: arqueoId,
      p_created_by: user.id,
    })

    setEnviando(false)
    if (errRpc) {
      setError(errRpc.message)
      return
    }

    setAbierto(false)
    router.refresh()
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-[11px] font-bold text-blue-d hover:underline"
      >
        Asentar ajuste
      </button>
    )
  }

  return (
    <div className="rounded-md bg-warnbg px-3 py-2.5 text-left">
      <p className="text-[11px] font-bold text-warntx">
        {faltante ? 'Asentar el faltante' : 'Asentar el sobrante'} · cajón{' '}
        {ambito === 'bar' ? 'del bar' : 'del torneo'}
      </p>

      <ul className="mt-2 grid gap-1">
        {faltante ? (
          <>
            <li className="flex justify-between gap-4 text-[11px] text-warntx">
              <span>Diferencias de arqueo (pérdida)</span>
              <Money value={monto} />
            </li>
            <li className="flex justify-between gap-4 text-[11px] text-warntx">
              <span>{cuenta} (baja)</span>
              <Money value={monto} />
            </li>
          </>
        ) : (
          <>
            <li className="flex justify-between gap-4 text-[11px] text-warntx">
              <span>{cuenta} (sube)</span>
              <Money value={monto} />
            </li>
            <li className="flex justify-between gap-4 text-[11px] text-warntx">
              <span>Diferencias de arqueo (ganancia)</span>
              <Money value={monto} />
            </li>
          </>
        )}
      </ul>

      <p className="mt-2 text-[11px] text-warntx">
        Después de asentar, el saldo de la caja pasa a ser lo contado. Toca el resultado.
      </p>

      {error && (
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">
          {error}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="pill" variant="secondary" icon="check" loading={enviando} onClick={asentar}>
          Asentar el ajuste
        </Button>
        <Button
          size="pill"
          variant="tertiary"
          disabled={enviando}
          onClick={() => {
            setAbierto(false)
            setError(null)
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
