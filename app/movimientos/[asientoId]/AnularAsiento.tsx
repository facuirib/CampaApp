"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button, Field, Input } from '@/components/ui'

/**
 * Anular un asiento SUELTO, por contraasiento (regla 4).
 *
 * La puerta de la regla 4 existía desde el primer día y no tenía pantalla: un
 * ajuste mal cargado se quedaba en el diario para siempre, o se pedía SQL a
 * mano. Esto es la llamada suelta — la pantalla sólo la ofrece para orígenes
 * SIN circuito propio; el resto se anula desde su circuito (la página decide
 * cuál es cuál y acá no llega).
 *
 * El motivo es obligatorio y queda escrito en la descripción del
 * contraasiento: la anulación es un hecho contable más, y dentro de un año
 * alguien va a leer «Anulación: … · {motivo}» en el diario y tiene que
 * entender por qué pasó.
 *
 * No hay segundo paso de confirmación aparte: escribir el motivo ES la
 * confirmación consciente. Un «¿estás seguro?» encima de un campo obligatorio
 * ya escrito no agrega fricción útil.
 */
export default function AnularAsiento({ asientoId }: { asientoId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function anular() {
    setOcupado(true)
    setError(null)
    const { data, error: err } = await createClient().rpc('anular_asiento', {
      p_asiento_id: asientoId,
      p_motivo: motivo.trim(),
    })
    setOcupado(false)
    if (err) return setError(err.message)
    // El contraasiento es el resultado: se navega a él, que es donde se ve
    // qué revirtió qué. El original queda atrás con su badge de anulado.
    router.push(`/movimientos/${data}`)
    router.refresh()
  }

  if (!abierto) {
    return (
      <div className="mt-6 border-t border-line pt-4">
        <Button size="pill" variant="tertiary" icon="borrar" onClick={() => setAbierto(true)}>
          Anular este asiento
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-6 rounded-md border border-err bg-errbg p-4">
      <p className="text-[12px] font-bold text-errtx">Anular por contraasiento</p>
      <p className="mt-1 max-w-prose text-[11px] leading-snug text-errtx">
        El asiento no se borra: se crea uno nuevo con las líneas invertidas y este queda marcado
        como anulado. Los dos van a verse en el diario — el diario es historia, y la anulación
        también es un hecho. <strong className="font-bold">El contraasiento no se puede anular</strong>,
        así que esto no tiene vuelta atrás.
      </p>

      <div className="mt-3 max-w-xl">
        <Field
          label="Motivo"
          required
          hint="Queda escrito en el contraasiento, en el diario, para siempre."
        >
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Cargado dos veces por error"
          />
        </Field>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-white px-3 py-2 text-[11px] leading-relaxed text-errtx">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          icon="borrar"
          loading={ocupado}
          disabled={ocupado || !motivo.trim()}
          onClick={anular}
        >
          Anular el asiento
        </Button>
        <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
