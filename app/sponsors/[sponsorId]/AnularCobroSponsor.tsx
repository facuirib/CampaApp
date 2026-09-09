"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate, formatMoney } from '@/lib/format'
import { Button, Field, Input, Select } from '@/components/ui'

export interface CuotaCobrada {
  cuota_id: string
  numero: number | null
  monto: number
  fecha_cobro: string | null
}

/**
 * Anular el cobro de una cuota de sponsor.
 *
 * Mismo molde que anular un arqueo: desplegable + motivo, porque es raro y el
 * gesto debe ser deliberado. La función contraasienta el cobro y la cuota
 * vuelve a pendiente — el sponsor reaparece como deudor por esa plata.
 */
export default function AnularCobroSponsor({ cuotas }: { cuotas: CuotaCobrada[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [cuota, setCuota] = useState('')
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (cuotas.length === 0) return null

  async function anular() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('anular_cobro_sponsor', {
      p_cuota_id: cuota,
      p_motivo: motivo.trim(),
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setAbierto(false)
    setCuota('')
    setMotivo('')
    router.refresh()
  }

  if (!abierto) {
    return (
      <div className="mt-3">
        <Button size="pill" variant="tertiary" icon="borrar" onClick={() => setAbierto(true)}>
          Anular un cobro
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-md border border-err bg-errbg p-4">
      <p className="text-[12px] font-bold text-errtx">Anular un cobro</p>
      <p className="mt-1 max-w-prose text-[11px] leading-snug text-errtx">
        Se contraasienta el cobro y la cuota vuelve a pendiente: el sponsor reaparece como deudor
        por esa plata.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Cuota cobrada" required>
          <Select placeholder="Elegir…" value={cuota} onChange={(e) => setCuota(e.target.value)}>
            {cuotas.map((c) => (
              <option key={c.cuota_id} value={c.cuota_id}>
                Cuota {c.numero ?? '—'} · {formatMoney(c.monto)} · cobrada {formatDate(c.fecha_cobro)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Motivo" required hint="Queda en el contraasiento, en el diario.">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
      </div>
      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-[11px] text-errtx">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button icon="borrar" loading={ocupado} disabled={ocupado || !cuota || !motivo.trim()} onClick={anular}>
          Anular el cobro
        </Button>
        <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
