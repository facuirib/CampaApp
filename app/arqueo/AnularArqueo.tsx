"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate } from '@/lib/format'
import { Button, Field, Input, Select } from '@/components/ui'

export interface ArqueoAnulable {
  id: string
  fecha: string | null
  predio: string | null
  ambito: string | null
}

/**
 * Anular un arqueo — la puerta existía, la pantalla no.
 *
 * `anular_arqueo` revierte el circuito entero en orden: la entrega a central
 * si la hubo, el ajuste de diferencia si lo hubo, y el arqueo queda marcado
 * con `anulado_at`. Cada reversa es un contraasiento con el motivo escrito.
 *
 * Es un desplegable y no un botón por fila porque anular un arqueo es raro —
 * es deshacer un cierre de caja física— y el gesto puede ser deliberado:
 * elegir el arqueo, escribir por qué. La fricción acá es proporcional al
 * efecto, como la confirmación del borrado de torneo.
 */
export default function AnularArqueo({ arqueos }: { arqueos: ArqueoAnulable[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [arqueo, setArqueo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (arqueos.length === 0) return null

  async function anular() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('anular_arqueo', {
      p_arqueo_id: arqueo,
      p_motivo: motivo.trim(),
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setAbierto(false)
    setArqueo('')
    setMotivo('')
    router.refresh()
  }

  if (!abierto) {
    return (
      <div className="mt-3">
        <Button size="pill" variant="tertiary" icon="borrar" onClick={() => setAbierto(true)}>
          Anular un arqueo
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-md border border-err bg-errbg p-4">
      <p className="text-[12px] font-bold text-errtx">Anular un arqueo</p>
      <p className="mt-1 max-w-prose text-[11px] leading-snug text-errtx">
        Se revierte el circuito completo por contraasientos: la entrega a central si la hubo y el
        ajuste de diferencia si lo hubo. El día queda como <strong className="font-bold">sin
        arquear</strong> — para volver a arquearlo bien.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Arqueo" required>
          <Select placeholder="Elegir…" value={arqueo} onChange={(e) => setArqueo(e.target.value)}>
            {arqueos.map((a) => (
              <option key={a.id} value={a.id}>
                {formatDate(a.fecha)} · {a.predio ?? '—'}
                {a.ambito === 'bar' ? ' · bar' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Motivo" required hint="Es lo único que explica los contraasientos.">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Se contó con la caja del bar mezclada"
          />
        </Field>
      </div>

      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-[11px] leading-relaxed text-errtx">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          icon="borrar"
          loading={ocupado}
          disabled={ocupado || !arqueo || !motivo.trim()}
          onClick={anular}
        >
          Anular el arqueo
        </Button>
        <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
