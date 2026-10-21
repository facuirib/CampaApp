"use client"

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { Button, Field, Input } from '@/components/ui'

/**
 * Condonar el saldo de una cuota impaga — admin y finanzas
 * (`cuota.condonar`), vía `condonar_cuota`. Sin motor propio (ver la
 * migración, «una lógica, tres puertas»): el monto que manda es `pagado`,
 * lo que ya está imputado a esta cuota — la base valida que coincida exacto.
 *
 * Botón separado de `AjustarCuota` a propósito: condonar no tiene campos
 * que elegir —no hay nada que editar salvo el motivo—, así que mezclarlo
 * con el formulario de ajuste le haría preguntar monto y vencimiento para
 * una acción que no los usa.
 */
export default function CondonarCuota({
  cuotaId,
  pagado,
  saldo,
}: {
  cuotaId: string
  /** Lo ya imputado a esta cuota (pago_imputacion + anticipo_uso). */
  pagado: number
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
    // `p_monto` es la CONFIRMACIÓN: lo ya pagado según la pantalla. Si un
    // pago entró en el medio, la función rechaza — se estaría condonando
    // otra cosa que la que se miró.
    const { error: err } = await createClient().rpc('condonar_cuota', {
      p_cuota_id: cuotaId,
      p_motivo: motivo.trim(),
      p_monto: pagado,
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
        <h3 className="mb-3 text-[13px] font-extrabold text-ink">Condonar cuota</h3>
        <p className="mb-3 text-[11px] leading-snug text-muted">
          El saldo pendiente ({formatMoney(saldo)}) se perdona. La cuota queda saldada por{' '}
          {formatMoney(pagado)} — lo que ya se cobró de ella, nada más.
        </p>
        <Field label="Motivo" required>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué se condona esta cuota"
          />
        </Field>
        {error && (
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button icon="check" loading={guardando} disabled={guardando} onClick={confirmar}>
            Condonar
          </Button>
          <Button variant="tertiary" disabled={guardando} onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <Button size="pill" variant="tertiary" onClick={abrir}>
        Condonar
      </Button>
      {modal && createPortal(modal, document.body)}
    </>
  )
}
