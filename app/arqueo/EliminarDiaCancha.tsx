"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate } from '@/lib/format'
import { Button, Field, Select } from '@/components/ui'

export interface DiaEliminable {
  id: string
  fecha: string | null
  predio: string | null
}

/**
 * Eliminar un día de cancha creado por error.
 *
 * Las excepciones del calendario —un domingo con un solo predio abierto— se
 * resuelven no creando el día, o quitándolo por acá (el comentario de la
 * propia función). Sólo se ofrecen días SIN arquear; y si el día ya tiene
 * ventas cargadas, los FK de la base bloquean el borrado con su error — un
 * día con movimiento es historia, no un error de carga.
 */
export default function EliminarDiaCancha({ dias }: { dias: DiaEliminable[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [dia, setDia] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (dias.length === 0) return null

  async function eliminar() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('eliminar_dia_cancha', {
      p_dia_cancha_id: dia,
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setAbierto(false)
    setDia('')
    router.refresh()
  }

  if (!abierto) {
    return (
      <div className="mt-3">
        <Button size="pill" variant="tertiary" icon="borrar" onClick={() => setAbierto(true)}>
          Eliminar un día creado por error
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-md border border-line bg-white p-4">
      <p className="text-[12px] font-bold text-ink">Eliminar un día de cancha</p>
      <p className="mt-1 max-w-prose text-[11px] leading-snug text-muted">
        Para el día que se creó por error — la fecha equivocada, el predio que no abrió. Sólo se
        ofrecen días sin arquear, y si el día ya tiene ventas la base bloquea el borrado: un día
        con movimiento es historia.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Field label="Día" required>
            <Select placeholder="Elegir…" value={dia} onChange={(e) => setDia(e.target.value)}>
              {dias.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatDate(d.fecha)} · {d.predio ?? '—'}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex gap-2 pb-1">
          <Button icon="borrar" loading={ocupado} disabled={ocupado || !dia} onClick={eliminar}>
            Eliminar
          </Button>
          <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
        </div>
      </div>
      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">
          {error}
        </p>
      )}
    </div>
  )
}
