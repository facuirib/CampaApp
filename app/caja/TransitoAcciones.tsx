"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate, formatMoney } from '@/lib/format'
import { Button, Field, Select } from '@/components/ui'

export interface TransitoPendiente {
  id: string
  etiqueta: string
}

export interface PredioConCaja {
  id: string
  nombre: string
}

/**
 * Cerrar el circuito del efectivo en tránsito, en sus dos direcciones:
 *
 *   liquidar — el cobro recibido en la calle llegó físicamente a un predio:
 *              CAJA_EFECTIVO ← EFECTIVO_EN_TRANSITO
 *   reponer  — el gasto que se pagó con esa plata (o del bolsillo de alguien)
 *              se repone desde la caja de un predio, que valida su saldo:
 *              EFECTIVO_EN_TRANSITO ← CAJA_EFECTIVO
 *
 * Los pendientes vienen de v_transito_pago y v_transito_gasto (regla 1): el
 * estado no vive en una tabla, vive en el diario, y las vistas lo derivan.
 */
export default function TransitoAcciones({
  pagosPendientes,
  gastosPendientes,
  predios,
}: {
  pagosPendientes: TransitoPendiente[]
  gastosPendientes: TransitoPendiente[]
  predios: PredioConCaja[]
}) {
  const router = useRouter()
  const [pago, setPago] = useState('')
  const [gasto, setGasto] = useState('')
  const [predioLiq, setPredioLiq] = useState('')
  const [predioRep, setPredioRep] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function correr(fn: 'liquidar_efectivo_transito' | 'reponer_efectivo_transito') {
    setOcupado(true)
    setError(null)
    const { error: err } =
      fn === 'liquidar_efectivo_transito'
        ? await createClient().rpc(fn, { p_pago_id: pago, p_predio_id: predioLiq })
        : await createClient().rpc(fn, { p_gasto_id: gasto, p_predio_id: predioRep })
    setOcupado(false)
    if (err) return setError(err.message)
    setPago('')
    setGasto('')
    router.refresh()
  }

  return (
    <div className="mt-3 space-y-3">
      {error && (
        <p className="whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
          {error}
        </p>
      )}

      {pagosPendientes.length > 0 && (
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-[12px] font-bold text-ink">Liquidar un cobro en un predio</p>
          <p className="mt-1 max-w-prose text-[11px] leading-snug text-muted">
            La plata llegó físicamente: entra a la caja de efectivo del predio y sale del
            tránsito.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-72">
              <Field label="Cobro en tránsito" required>
                <Select placeholder="Elegir…" value={pago} onChange={(e) => setPago(e.target.value)}>
                  {pagosPendientes.map((p) => (
                    <option key={p.id} value={p.id}>{p.etiqueta}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-52">
              <Field label="Predio" required>
                <Select placeholder="Elegir…" value={predioLiq} onChange={(e) => setPredioLiq(e.target.value)}>
                  {predios.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="pb-1">
              <Button icon="check" loading={ocupado} disabled={ocupado || !pago || !predioLiq}
                onClick={() => correr('liquidar_efectivo_transito')}>
                Liquidar
              </Button>
            </div>
          </div>
        </div>
      )}

      {gastosPendientes.length > 0 && (
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-[12px] font-bold text-ink">Reponer un gasto pagado con tránsito</p>
          <p className="mt-1 max-w-prose text-[11px] leading-snug text-muted">
            El gasto se pagó con la plata en tránsito (o del bolsillo de alguien): se repone desde
            la caja del predio, que valida tener el saldo.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-72">
              <Field label="Gasto sin reponer" required>
                <Select placeholder="Elegir…" value={gasto} onChange={(e) => setGasto(e.target.value)}>
                  {gastosPendientes.map((g) => (
                    <option key={g.id} value={g.id}>{g.etiqueta}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-52">
              <Field label="Predio" required>
                <Select placeholder="Elegir…" value={predioRep} onChange={(e) => setPredioRep(e.target.value)}>
                  {predios.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="pb-1">
              <Button icon="check" loading={ocupado} disabled={ocupado || !gasto || !predioRep}
                onClick={() => correr('reponer_efectivo_transito')}>
                Reponer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
