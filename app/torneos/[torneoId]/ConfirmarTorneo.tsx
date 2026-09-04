"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { Button } from '@/components/ui'

/**
 * El botón que materializa las cuotas del torneo.
 *
 * ── Por qué muestra el previo antes ───────────────────────────────────────
 *
 * Confirmar genera las cuotas de todas las fichas y es irreversible sin
 * anularlas una por una. Ver antes cuántas y por cuánto es la diferencia entre
 * apretar sabiendo y apretar a ver qué pasa — y el número es grande: en el
 * torneo real son 273 cuotas por $206.755.000.
 *
 * El previo sale de `v_previo_confirmar`, no de una cuenta de esta pantalla, y
 * se verificó contra el resultado real: coinciden al peso.
 *
 * ── Y por qué el error se muestra tal cual ────────────────────────────────
 *
 * `generar_cuotas_ficha` tiene mensajes muy precisos —«la línea X espera 15
 * fechas y la serie tiene 14 no suspendidas: se facturaría de menos»— que dicen
 * exactamente qué revisar. Traducirlos a un «no se pudo confirmar» genérico
 * sería tirar la mejor parte.
 */
export default function ConfirmarTorneo({
  torneoId,
  cuotas,
  monto,
  fichas,
}: {
  torneoId: string
  cuotas: number
  monto: number
  fichas: number
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmar() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('confirmar_torneo_clonado', {
      p_torneo_id: torneoId,
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setAbierto(false)
    router.refresh()
  }

  if (!abierto) {
    return (
      <Button icon="check" onClick={() => setAbierto(true)}>
        Confirmar torneo
      </Button>
    )
  }

  return (
    <div className="rounded-md border border-line bg-white p-4">
      <p className="text-[12px] font-bold text-ink">
        Se van a generar {cuotas} cuotas por {formatMoney(monto)}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        Una por cada vencimiento de las {fichas} fichas, según su tarifario y el calendario de su
        serie. <strong className="font-semibold text-ink">No se deshace solo</strong>: para
        revertirlo hay que anular las cuotas una por una.
      </p>

      {error && (
        <p className="mt-3 rounded-md bg-errbg px-3 py-2 text-[11px] leading-relaxed text-errtx">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button icon="check" loading={ocupado} disabled={ocupado} onClick={confirmar}>
          Sí, generar las cuotas
        </Button>
        <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
