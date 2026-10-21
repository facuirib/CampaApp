"use client"

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { Button, Field, Input } from '@/components/ui'

/**
 * Cancelar una cuota impaga SIN ningún pago: sacarla del plan — admin y
 * finanzas (`cuota.condonar`), vía `cancelar_cuota`. La página sólo ofrece
 * este botón en cuotas con cero pagado; si un pago entrara justo en el
 * medio, la función rechaza igual («condoná el remanente») — el candado es
 * de la base, acá sólo se evita ofrecer lo que va a fallar.
 *
 * Distinto de condonar: condonar perdona el REMANENTE de una cuota que
 * corresponde al plan; cancelar dice que la cuota no debió estar — monto a
 * 0, saldada hoy, etiqueta «Cancelada». La fila no se borra (el historial
 * la referencia).
 */
export default function CancelarCuota({
  cuotaId,
  saldo,
}: {
  cuotaId: string
  saldo: number
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function abrir() {
    setMotivo('')
    setError(null)
    setAbierto(true)
  }

  async function confirmar() {
    if (!motivo.trim()) return setError('El motivo es obligatorio.')
    setGuardando(true)
    setError(null)
    const { error: err } = await createClient().rpc('cancelar_cuota', {
      p_cuota_id: cuotaId,
      p_motivo: motivo.trim(),
    })
    setGuardando(false)
    if (err) return setError(err.message)
    setAbierto(false)
    router.refresh()
  }

  const modal = abierto && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={() => !guardando && setAbierto(false)}
    >
      <div className="w-full max-w-md rounded-md bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[14px] font-extrabold text-ink">Cancelar cuota</h2>
        <p className="mb-4 mt-1 text-[11px] leading-snug text-muted">
          La cuota sale del plan: su monto queda en $0 y deja de deberse —{' '}
          <strong className="font-semibold text-ink">{formatMoney(saldo)}</strong> desaparecen de la
          deuda del equipo. Queda en el historial como «Cancelada», con este motivo.
        </p>

        <Field label="Motivo" required hint="Por qué esta cuota no corresponde al plan.">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Se renegoció el plan: esta cuota se quita"
          />
        </Field>

        {error && (
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button icon="check" loading={guardando} disabled={guardando || !motivo.trim()} onClick={confirmar}>
            Cancelar la cuota
          </Button>
          <Button variant="tertiary" disabled={guardando} onClick={() => setAbierto(false)}>
            Volver
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <Button size="pill" variant="tertiary" onClick={abrir}>
        Cancelar
      </Button>
      {modal && createPortal(modal, document.body)}
    </>
  )
}
