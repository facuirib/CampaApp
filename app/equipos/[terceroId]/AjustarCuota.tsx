"use client"

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { parsearMonto } from '@/lib/format'
import { Button, Field, Input } from '@/components/ui'

/**
 * Editar monto y/o vencimiento de una cuota impaga — admin, finanzas y
 * operador (`cuota.editar`): reestructurar cómo paga un equipo es gestión
 * diaria. El motivo es obligatorio: `ajustar_cuota` lo exige, y
 * acá se pide ANTES de llamar a la base para que el error no llegue recién
 * al confirmar.
 *
 * Si el monto nuevo coincidiera con lo ya pagado, `ajustar_cuota` rechaza y
 * pide usar `CondonarCuota` — es la condonación llamada por su nombre, no
 * un ajuste que de casualidad salda la cuota.
 */
export default function AjustarCuota({
  cuotaId,
  montoActual,
  venceActual,
  esDePartido,
}: {
  cuotaId: string
  montoActual: number
  venceActual: string
  /** Vence con su jornada (sync_cuota_vence_at / mover_jornada la mueven). */
  esDePartido: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [monto, setMonto] = useState(montoActual)
  const [vence, setVence] = useState(venceActual)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function abrir() {
    setMonto(montoActual)
    setVence(venceActual)
    setMotivo('')
    setError(null)
    setAbierto(true)
  }

  async function confirmar() {
    if (!motivo.trim()) return setError('El motivo es obligatorio.')
    const cambioMonto = monto !== montoActual
    const cambioVence = !esDePartido && vence !== venceActual
    if (!cambioMonto && !cambioVence) {
      return setError('Cambiá el monto, el vencimiento, o los dos.')
    }

    setGuardando(true)
    setError(null)
    const { error: err } = await createClient().rpc('ajustar_cuota', {
      p_cuota_id: cuotaId,
      p_motivo: motivo.trim(),
      p_monto: cambioMonto ? monto : undefined,
      p_vence_at: cambioVence ? vence : undefined,
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
        <h3 className="mb-3 text-[13px] font-extrabold text-ink">Ajustar cuota</h3>
        <div className="grid gap-3">
          <Field label="Monto">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(parsearMonto(e.target.value) ?? 0)}
            />
          </Field>
          <Field
            label="Vencimiento"
            hint={esDePartido ? 'Vence con su jornada — se mueve desde el calendario.' : undefined}
          >
            <Input
              type="date"
              value={vence}
              onChange={(e) => setVence(e.target.value)}
              disabled={esDePartido}
            />
          </Field>
          <Field label="Motivo" required>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por qué se ajusta esta cuota"
            />
          </Field>
        </div>
        {error && (
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button icon="check" loading={guardando} disabled={guardando} onClick={confirmar}>
            Guardar
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
      <Button size="pill" variant="secondary" onClick={abrir}>
        Ajustar
      </Button>
      {modal && createPortal(modal, document.body)}
    </>
  )
}
