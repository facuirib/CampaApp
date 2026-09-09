"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Badge, Button, Field, Select } from '@/components/ui'
import { MESES_LARGO } from '@/lib/domain/pl'

export interface PeriodoCerrable {
  id: string
  anio: number
  mes: number
  estado: string
}

/**
 * El cierre mensual — el proceso contable que no tenía disparador.
 *
 * `cerrar_periodo` valida en orden: que no queden arqueos sin entregar a
 * central, que ningún asiento esté descuadrado, y que la amortización del mes
 * esté asentada. Los dos primeros son frenos duros; el tercero es un AVISO que
 * se puede pasar por arriba a conciencia (`p_amortizacion_vista`) — la función
 * lo diseñó así y la pantalla lo respeta: primero muestra el aviso tal cual,
 * y recién ahí ofrece «Cerrar igual».
 *
 * 🔴 Cerrar no tiene vuelta atrás: `trg_periodo_no_reabre` lo garantiza en la
 * base. Sobre un período cerrado no se registra más nada; las correcciones
 * van como ajuste al período abierto.
 */
export default function CerrarPeriodo({ periodos }: { periodos: PeriodoCerrable[] }) {
  const router = useRouter()
  const abiertos = periodos.filter((p) => p.estado === 'abierto')

  const [abierto, setAbierto] = useState(false)
  const [periodoId, setPeriodoId] = useState('')
  const [avisoAmort, setAvisoAmort] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cerrar(amortizacionVista: boolean) {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('cerrar_periodo', {
      p_periodo_id: periodoId,
      p_amortizacion_vista: amortizacionVista,
    })
    setOcupado(false)
    if (err) {
      // El aviso de amortización es un diálogo, no un fallo: la función frena
      // con la explicación y espera la decisión. Cualquier otro error —arqueo
      // sin entregar, descuadre— es un freno duro y se muestra como error.
      if (err.message.includes('amortización') || err.message.includes('amortizacion')) {
        setAvisoAmort(err.message)
      } else {
        setError(err.message)
      }
      return
    }
    setAbierto(false)
    setPeriodoId('')
    setAvisoAmort(null)
    router.refresh()
  }

  if (abiertos.length === 0) return null

  if (!abierto) {
    return (
      <div className="mt-3">
        <Button size="pill" variant="secondary" icon="check" onClick={() => setAbierto(true)}>
          Cerrar un período
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-md border border-line bg-white p-4">
      <p className="text-[12px] font-bold text-ink">Cerrar un período</p>
      <p className="mt-1 max-w-prose text-[11px] leading-snug text-muted">
        Un período cerrado <strong className="font-semibold text-ink">no se reabre</strong> — lo
        garantiza la base. No se registra más nada con fecha de ese mes: las correcciones entran
        como ajuste en el período abierto. El cierre valida antes que no queden arqueos sin
        entregar ni asientos descuadrados, y avisa si falta asentar la amortización.
      </p>

      <div className="mt-3 max-w-xs">
        <Field label="Período" required>
          <Select
            placeholder="Elegir…"
            value={periodoId}
            onChange={(e) => {
              setPeriodoId(e.target.value)
              setAvisoAmort(null)
              setError(null)
            }}
          >
            {abiertos.map((p) => (
              <option key={p.id} value={p.id}>
                {MESES_LARGO[p.mes - 1]} {p.anio}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {avisoAmort && (
        <div className="mt-3 rounded-md bg-warnbg px-4 py-3">
          <p className="whitespace-pre-wrap text-[11px] leading-snug text-warntx">{avisoAmort}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/activos/amortizar"
              className="inline-flex items-center rounded-pill border border-warntx/40 px-3 py-1 text-[11px] font-bold text-warntx hover:bg-white/50"
            >
              Ir a asentar la amortización
            </Link>
            <Button
              size="pill"
              variant="tertiary"
              loading={ocupado}
              disabled={ocupado}
              onClick={() => cerrar(true)}
            >
              Cerrar igual — ya lo decidí
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] leading-relaxed text-errtx">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          icon="check"
          loading={ocupado}
          disabled={ocupado || !periodoId || !!avisoAmort}
          onClick={() => cerrar(false)}
        >
          Cerrar el período
        </Button>
        <Button
          variant="tertiary"
          disabled={ocupado}
          onClick={() => {
            setAbierto(false)
            setAvisoAmort(null)
            setError(null)
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
