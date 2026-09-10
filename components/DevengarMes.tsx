"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button, Field, Select } from '@/components/ui'
import { MESES_LARGO } from '@/lib/domain/pl'

export interface PeriodoAbierto {
  id: string
  anio: number
  mes: number
}

/**
 * El disparador de un proceso mensual idempotente.
 *
 * `devengar_sueldos_socios` y `devengar_sponsors` están diseñados para
 * correrse una vez por mes — y correrlos DOS veces no duplica: cada uno
 * verifica qué ya se devengó y asienta solo lo que falta. Eso es lo que
 * permite que este botón sea tranquilo: apretarlo de más no rompe nada, y el
 * resultado dice cuántos asientos generó (0 = ya estaba todo devengado).
 *
 * Un componente para los dos procesos porque son el mismo gesto — elegir el
 * mes, correr, leer el resultado — y dos copias se desincronizarían como
 * cualquier par de copias.
 */
export default function DevengarMes({
  fn,
  titulo,
  descripcion,
  periodos,
}: {
  fn: 'devengar_sponsors' | 'devengar_sueldos_socios'
  titulo: string
  descripcion: string
  periodos: PeriodoAbierto[]
}) {
  const router = useRouter()
  const [periodoId, setPeriodoId] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (periodos.length === 0) return null

  async function devengar() {
    setOcupado(true)
    setError(null)
    setResultado(null)
    const { data, error: err } = await createClient().rpc(fn, { p_periodo_id: periodoId })
    setOcupado(false)
    if (err) return setError(err.message)
    setResultado(typeof data === 'number' ? data : 0)
    router.refresh()
  }

  return (
    <section className="mt-8 border-t border-line pt-6">
      <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">{titulo}</h2>
      <p className="mb-3 max-w-[82ch] text-[11px] leading-snug text-muted">
        {descripcion} Es <strong className="font-semibold text-ink">idempotente</strong>: correrlo
        dos veces no duplica — asienta solo lo que falta del mes.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field label="Mes" required>
            <Select
              placeholder="Elegir…"
              value={periodoId}
              onChange={(e) => {
                setPeriodoId(e.target.value)
                setResultado(null)
              }}
            >
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {MESES_LARGO[p.mes - 1]} {p.anio}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="pb-1">
          <Button icon="check" loading={ocupado} disabled={ocupado || !periodoId} onClick={devengar}>
            Devengar el mes
          </Button>
        </div>
      </div>

      {resultado !== null && (
        <p className="mt-3 rounded-md bg-okbg px-4 py-2.5 text-[11px] text-oktx">
          {resultado === 0
            ? 'Nada nuevo que devengar: el mes ya estaba completo.'
            : `${resultado} asiento${resultado === 1 ? '' : 's'} de devengo generado${resultado === 1 ? '' : 's'}.`}
        </p>
      )}
      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
          {error}
        </p>
      )}
    </section>
  )
}
