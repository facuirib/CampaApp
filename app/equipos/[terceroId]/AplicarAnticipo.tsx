"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate, formatMoney } from '@/lib/format'
import { Button } from '@/components/ui'

export interface AnticipoDisponible {
  pago_id: string
  fecha: string | null
  monto: number
}

interface Propuesta {
  imputaciones: { cuota_id: string; monto: number; torneo: string; cuota: number; vence_at: string; saldo: number }[]
  sobrante: number
}

/**
 * Aplicar el saldo a favor de un equipo a sus cuotas.
 *
 * La regla 10 del proyecto, hecha pantalla: **la imputación nunca se decide
 * sola**. El flujo es exactamente el que la regla pide — se llama a
 * `sugerir_imputacion()`, se muestra la propuesta completa (qué cuota, de qué
 * torneo, cuánto a cada una, cuánto sobra) y recién con el OK del operador se
 * llama a `imputar_pago()`. Nada se aplica sin que un humano lo haya leído.
 *
 * La propuesta de la función prioriza el torneo en curso y después el
 * vencimiento más viejo — el criterio está en la base, no acá: esta pantalla
 * lo muestra, no lo inventa.
 */
export default function AplicarAnticipo({
  saldoDisponible,
  anticipos,
}: {
  saldoDisponible: number
  anticipos: AnticipoDisponible[]
}) {
  const router = useRouter()
  const [pagoId, setPagoId] = useState<string | null>(null)
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function proponer(id: string) {
    setOcupado(true)
    setError(null)
    const { data, error: err } = await createClient().rpc('sugerir_imputacion', {
      p_pago_id: id,
    })
    setOcupado(false)
    if (err) return setError(err.message)
    const p = data as unknown as Propuesta
    if (!p?.imputaciones?.length) {
      setError('No hay cuotas impagas a las que aplicar este anticipo.')
      return
    }
    setPagoId(id)
    setPropuesta(p)
  }

  async function confirmar() {
    if (!pagoId || !propuesta) return
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('imputar_pago', {
      p_pago_id: pagoId,
      // Solo cuota y monto: el resto de la propuesta era para LEERLA.
      p_imputaciones: propuesta.imputaciones.map((i) => ({
        cuota_id: i.cuota_id,
        monto: i.monto,
      })),
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setPagoId(null)
    setPropuesta(null)
    router.refresh()
  }

  if (anticipos.length === 0 || saldoDisponible <= 0) return null

  return (
    <div className="mb-4 rounded-md border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12px] font-bold text-ink">
            Saldo a favor: <span className="cifra">{formatMoney(saldoDisponible)}</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            Plata que el equipo ya entregó y todavía no está aplicada a ninguna cuota.
          </p>
        </div>
        {!propuesta && (
          <div className="flex flex-wrap gap-2">
            {anticipos.map((a) => (
              <Button
                key={a.pago_id}
                size="pill"
                variant="secondary"
                loading={ocupado}
                disabled={ocupado}
                onClick={() => proponer(a.pago_id)}
              >
                Aplicar el del {formatDate(a.fecha)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {propuesta && (
        <div className="mt-3 rounded-md bg-panel p-3">
          <p className="mb-2 text-[11px] font-bold text-ink">
            La propuesta — torneo en curso primero, después el vencimiento más viejo:
          </p>
          <table className="w-full text-[11.5px]">
            <thead className="text-[9px] uppercase tracking-[.06em] text-muted">
              <tr>
                <th className="py-1 text-left font-bold">Cuota</th>
                <th className="py-1 text-left font-bold">Vence</th>
                <th className="py-1 text-right font-bold">Saldo de la cuota</th>
                <th className="py-1 text-right font-bold">Se aplica</th>
              </tr>
            </thead>
            <tbody>
              {propuesta.imputaciones.map((i) => (
                <tr key={i.cuota_id} className="border-t border-line2">
                  <td className="py-1.5 text-ink">
                    {i.torneo} · cuota {i.cuota}
                  </td>
                  <td className="py-1.5 text-muted">{formatDate(i.vence_at)}</td>
                  <td className="cifra py-1.5 text-right text-muted">{formatMoney(i.saldo)}</td>
                  <td className="cifra py-1.5 text-right font-bold text-ink">
                    {formatMoney(i.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {propuesta.sobrante > 0 && (
            <p className="mt-2 text-[10.5px] text-muted">
              Quedan {formatMoney(propuesta.sobrante)} sin aplicar: siguen como saldo a favor.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button icon="check" loading={ocupado} disabled={ocupado} onClick={confirmar}>
              Aplicar así
            </Button>
            <Button
              variant="tertiary"
              disabled={ocupado}
              onClick={() => {
                setPropuesta(null)
                setPagoId(null)
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">
          {error}
        </p>
      )}
    </div>
  )
}
