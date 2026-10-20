"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'

interface FilaSponsor {
  sponsor_id: string | null
  sponsor: string | null
  pendiente_cobrar: number | null
  cuotas_vencidas: number | null
}

/**
 * Qué sponsor cobrar, dentro del modal de cobro.
 *
 * Es un ACCESO, no un formulario: lista los sponsors con plata pendiente
 * (`v_sponsor_lista`, la misma vista de /sponsors) y al elegir uno navega a
 * `/sponsors/[id]/cobrar` — la pantalla de siempre, con
 * `registrar_cobro_sponsor` y sus validaciones. Acá no se cobra nada: el
 * circuito del sponsor ya existe y no se duplica.
 */
export default function CobroSponsorPicker({ onElegir }: { onElegir: (sponsorId: string) => void }) {
  const [filas, setFilas] = useState<FilaSponsor[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    createClient()
      .from('v_sponsor_lista')
      .select('sponsor_id, sponsor, pendiente_cobrar, cuotas_vencidas')
      .gt('pendiente_cobrar', 0)
      .order('sponsor')
      .then(({ data, error: err }) => {
        if (cancelado) return
        if (err) setError(err.message)
        else setFilas(data ?? [])
      })
    return () => {
      cancelado = true
    }
  }, [])

  if (error) {
    return <p className="rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error}</p>
  }
  if (filas === null) {
    return <p className="text-[11px] text-muted">Buscando sponsors con cobros pendientes…</p>
  }
  if (filas.length === 0) {
    return (
      <p className="text-[12px] text-muted">
        Ningún sponsor tiene cobros pendientes. Los contratos y sus cronogramas viven en{' '}
        <span className="font-semibold text-ink">Sponsors</span>.
      </p>
    )
  }

  return (
    <div>
      <p className="mb-3 text-[12px] text-muted">
        Sponsors con plata pendiente de cobrar. Elegí uno: el cobro se registra en su pantalla de
        siempre, con las cuotas del contrato a la vista.
      </p>
      <ul className="divide-y divide-line2 rounded-md border border-line">
        {filas.map((f) => (
          <li key={f.sponsor_id}>
            <button
              type="button"
              onClick={() => f.sponsor_id && onElegir(f.sponsor_id)}
              className="group flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-row-hover"
            >
              <span className="text-[12px] font-semibold text-ink group-hover:text-blue-d">
                {f.sponsor ?? '—'}
                {(f.cuotas_vencidas ?? 0) > 0 && (
                  <span className="ml-2 rounded-pill bg-errbg px-1.5 py-px text-[9px] font-bold text-errtx">
                    {f.cuotas_vencidas} vencida{f.cuotas_vencidas === 1 ? '' : 's'}
                  </span>
                )}
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-ink">
                {formatMoney(f.pendiente_cobrar ?? 0)} →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
