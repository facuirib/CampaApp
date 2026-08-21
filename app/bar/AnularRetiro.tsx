"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button, Field, Input, Money } from '@/components/ui'

export interface AnularRetiroProps {
  retiroId: string
  fecha: string
  predio: string
  destino: string
  monto: number
}

/**
 * Anular un retiro del bar.
 *
 * Isla de cliente en la lista, gemela de <AnularCierre>. Pide motivo escrito
 * —`anular_retiro_bar` lo exige— y dice a dónde vuelve la plata, que es lo que
 * distingue anular un retiro de anular una venta: acá el contraasiento
 * DEVUELVE efectivo al cajón del bar y lo saca del destino.
 */
export default function AnularRetiro({
  retiroId,
  fecha,
  predio,
  destino,
  monto,
}: AnularRetiroProps) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function anular() {
    setEnviando(true)
    setError(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setEnviando(false)
      setError('Sesión vencida. Volvé a entrar para anular el retiro.')
      return
    }

    const { error: errRpc } = await supabase.rpc('anular_retiro_bar', {
      p_retiro_id: retiroId,
      p_motivo: motivo.trim(),
      p_created_by: user.id,
    })

    setEnviando(false)
    if (errRpc) {
      setError(errRpc.message)
      return
    }

    setAbierto(false)
    setMotivo('')
    router.refresh()
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-[11px] font-bold text-blue-d hover:underline"
      >
        Anular
      </button>
    )
  }

  return (
    <div className="rounded-md bg-warnbg px-3 py-2.5 text-left">
      <p className="text-[11px] font-bold text-warntx">
        Anular el retiro del {fecha} en {predio}
      </p>
      <p className="mt-1 text-[11px] text-warntx">
        El contraasiento devuelve <Money value={monto} /> al cajón del bar y los saca de{' '}
        {destino.toLowerCase()}. El retiro original queda marcado, no se borra.
      </p>

      <div className="mt-2.5">
        <Field label="Motivo" required hint="Queda en el diario, al lado del contraasiento.">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: se cargó el monto equivocado"
          />
        </Field>
      </div>

      {error && (
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">
          {error}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button
          size="pill"
          variant="secondary"
          icon="alerta"
          loading={enviando}
          disabled={enviando || motivo.trim().length === 0}
          onClick={anular}
        >
          Anular el retiro
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
