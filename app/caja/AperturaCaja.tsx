"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { Button, Field, Icon, Input, InputMonto, Select } from '@/components/ui'

export interface CajaAbrible {
  id: string
  nombre: string
  tipo: string
  /** Ya tiene asiento de apertura VIGENTE (no anulado). */
  abierta: boolean
}

/**
 * Apertura de caja: el saldo inicial a la fecha de corte, para arrancar la
 * app con el torneo empezado. Un asiento por caja (caja al debe,
 * SALDOS_INICIALES al haber — patrimonio: el P&L no se entera), vía
 * `abrir_saldo_caja`, que rechaza la segunda apertura de la misma caja
 * (regla 4: anular + abrir de nuevo). Solo admin·finanzas (`caja.abrir`).
 *
 * La lista marca ✓ las que ya tienen apertura vigente — el candado real
 * está en la base; acá solo no se ofrece lo que va a rechazar.
 */
export default function AperturaCaja({ cajas }: { cajas: CajaAbrible[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [cajaId, setCajaId] = useState('')
  const [monto, setMonto] = useState(0)
  const [fecha, setFecha] = useState('')
  const [tc, setTc] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  const pendientes = cajas.filter((c) => !c.abierta)
  const esUsd = cajas.find((c) => c.id === cajaId)?.tipo === 'usd'

  async function confirmar() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('abrir_saldo_caja', {
      p_caja_id: cajaId,
      p_monto: monto,
      p_fecha: fecha,
      ...(esUsd ? { p_tc: tc } : {}),
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setExito(
      esUsd
        ? `Apertura cargada: USD ${monto} a ${tc} (${formatMoney(monto * tc)}).`
        : `Apertura cargada: ${formatMoney(monto)}.`,
    )
    setCajaId('')
    setMonto(0)
    setTc(0)
    router.refresh()
  }

  if (!abierto) {
    return (
      <div className="mb-6">
        {exito && <p className="mb-3 rounded-md bg-okbg px-4 py-2.5 text-[11px] text-oktx">{exito}</p>}
        <Button variant="secondary" icon="plus" onClick={() => { setExito(null); setAbierto(true) }}>
          Apertura de caja
        </Button>
        <span className="ml-3 text-[10.5px] text-muted">
          El saldo inicial a la fecha de corte — sin pasar por ingresos.
        </span>
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-md border border-line bg-white p-4">
      <h2 className="mb-1 text-[13px] font-extrabold text-ink">Apertura de caja</h2>
      <p className="mb-3 max-w-prose text-[11px] leading-snug text-muted">
        Carga el saldo que la caja YA tenía a la fecha de corte. Asienta contra{' '}
        <strong className="font-semibold text-ink">Saldos iniciales</strong> (patrimonio): no es un
        ingreso y el P&L no lo cuenta. Una apertura por caja; para corregir, se anula el asiento y
        se abre de nuevo.
      </p>

      <ul className="mb-4 grid gap-1 sm:grid-cols-2">
        {cajas.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-[11.5px]">
            {c.abierta ? (
              <Icon name="check" size={13} className="shrink-0 text-oktx" />
            ) : (
              <span className="inline-block size-[13px] shrink-0 rounded-full border border-line" />
            )}
            <span className={c.abierta ? 'text-muted' : 'font-semibold text-ink'}>
              {c.nombre}
              {c.abierta && ' · apertura cargada'}
            </span>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Caja" required>
          <Select placeholder="Elegir…" value={cajaId} onChange={(e) => setCajaId(e.target.value)}>
            {pendientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </Select>
        </Field>
        <Field label={esUsd ? 'Cantidad (USD)' : 'Saldo inicial'} required>
          <InputMonto value={monto} onChange={setMonto} />
        </Field>
        {esUsd && (
          <Field label="Cotización" required hint="Pesos por dólar: fija el promedio inicial.">
            <InputMonto value={tc} onChange={setTc} />
          </Field>
        )}
        <Field label="Fecha de corte" required>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
      </div>

      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error}</p>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          icon="check"
          loading={ocupado}
          disabled={ocupado || !cajaId || monto <= 0 || !fecha || (esUsd && tc <= 0)}
          onClick={confirmar}
        >
          Cargar apertura
        </Button>
        <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
