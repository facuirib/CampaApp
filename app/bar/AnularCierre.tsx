"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button, Field, Input, Money } from '@/components/ui'

export interface AnularCierreProps {
  ventaBarId: string
  fecha: string
  predio: string
  total: number
}

/**
 * Anular un cierre de bar.
 *
 * Isla de cliente adentro de la lista, que es Server Component. Es lo mínimo
 * que tiene que cruzar la frontera: un botón por fila y el panel que abre.
 *
 * La confirmación pide un acto aparte del click —escribir el motivo— y no un
 * `confirm()` del navegador, por dos razones. Una, `anular_venta_bar` EXIGE
 * motivo: es el único texto que después explica el contraasiento en el diario,
 * así que igual hay que pedirlo. Dos, mostrar de antemano qué asiento se va a
 * generar es lo que convierte "anular" de un botón en una decisión.
 *
 * No hay "editar un cierre": se anula y se vuelve a cargar. Por eso el panel
 * dice a dónde ir después.
 */
export default function AnularCierre({ ventaBarId, fecha, predio, total }: AnularCierreProps) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const puedeAnular = !enviando && motivo.trim().length > 0

  async function anular() {
    setEnviando(true)
    setError(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setEnviando(false)
      setError('Sesión vencida. Volvé a entrar para anular el cierre.')
      return
    }

    const { error: errRpc } = await supabase.rpc('anular_venta_bar', {
      p_venta_id: ventaBarId,
      p_motivo: motivo.trim(),
      // Sin p_fecha: la función usa current_date. El contraasiento se registra
      // el día que se anula, no el día del cierre — que es lo correcto y lo
      // mismo que hace el resto del sistema.
      p_created_by: user.id,
    })

    setEnviando(false)

    if (errRpc) {
      setError(errRpc.message)
      return
    }

    setAbierto(false)
    setMotivo('')
    // La lista es Server Component: refresh la vuelve a pedir con el cierre ya
    // marcado como anulado.
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
        Anular el cierre del {fecha} en {predio}
      </p>
      <p className="mt-1 text-[11px] text-warntx">
        Se genera un contraasiento por <Money value={total} /> que revierte el ingreso. El cierre
        original queda marcado, no se borra. Después podés volver a cargar el día.
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
          disabled={!puedeAnular}
          onClick={anular}
        >
          Anular el cierre
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
