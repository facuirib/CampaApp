"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney, formatUSD } from '@/lib/format'
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui'

/**
 * Comprar y vender dólares.
 *
 * ── El motor ya estaba, otra vez ──────────────────────────────────────────
 *
 * `comprar_usd` y `vender_usd` existen desde el módulo de USD y son de las
 * puertas que el CLAUDE.md marca como no esquivables: llevan el promedio
 * ponderado del costo y, en la venta, la diferencia de cambio realizada.
 * «Tocar CAJA_USD por afuera corre el promedio en silencio.»
 *
 * La pantalla mostraba tenencia, costo y resultado, y no tenía cómo registrar
 * una operación. Esto es sólo la puerta de entrada.
 *
 * ── Por qué la venta se ve distinta ───────────────────────────────────────
 *
 * Comprar es una permuta: salen pesos, entran dólares, no hay resultado.
 * Vender realiza la diferencia entre el tipo de cambio de hoy y el promedio al
 * que se compraron — y eso SÍ va al resultado. El formulario lo dice antes de
 * confirmar, con el número, porque es la parte que sorprende.
 */

const MEDIOS = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'central', label: 'Caja central' },
  { value: 'efectivo', label: 'Efectivo' },
] as const

type Medio = (typeof MEDIOS)[number]['value']
type Operacion = 'comprar' | 'vender'

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function OperarUsd({
  tenencia,
  costoPromedio,
}: {
  tenencia: number
  costoPromedio: number
}) {
  const router = useRouter()
  const [abierta, setAbierta] = useState<Operacion | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [tc, setTc] = useState('')
  const [medio, setMedio] = useState<Medio>('transferencia')
  const [fecha, setFecha] = useState(hoyEnCordoba())
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cant = Number(cantidad)
  const cambio = Number(tc)
  const cantOk = cantidad.trim() !== '' && Number.isFinite(cant) && cant > 0
  const tcOk = tc.trim() !== '' && Number.isFinite(cambio) && cambio > 0
  const enPesos = cantOk && tcOk ? cant * cambio : 0

  // Vender más de lo que hay no lo permite la función. Se dice acá para no
  // hacer el viaje.
  const excede = abierta === 'vender' && cantOk && cant > tenencia
  // Lo que la venta va a realizar como resultado: la diferencia entre el tipo
  // de cambio de hoy y el promedio al que se compraron esos dólares.
  const resultado = abierta === 'vender' && cantOk && tcOk ? (cambio - costoPromedio) * cant : 0

  const puedeConfirmar = !ocupado && cantOk && tcOk && !!fecha && !excede

  function abrir(cual: Operacion) {
    setAbierta(abierta === cual ? null : cual)
    setCantidad('')
    setTc('')
    setMotivo('')
    setError(null)
    setAviso(null)
  }

  async function confirmar() {
    if (!abierta) return
    setOcupado(true)
    setError(null)
    setAviso(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setOcupado(false)
      return setError('Sesión vencida. Volvé a entrar.')
    }

    const { error: e } = await supabase.rpc(
      abierta === 'comprar' ? 'comprar_usd' : 'vender_usd',
      {
        p_fecha: fecha,
        p_cantidad: cant,
        p_tc: cambio,
        p_medio: medio,
        p_motivo: motivo.trim() || undefined,
        p_created_by: user.id,
      },
    )

    setOcupado(false)
    if (e) {
      return setError(
        e.message.includes('row-level security')
          ? 'Operar con dólares es de administrador o finanzas.'
          : e.message,
      )
    }

    setAbierta(null)
    setAviso(
      abierta === 'comprar'
        ? `Compra de ${formatUSD(cant)} registrada por ${formatMoney(enPesos)}.`
        : `Venta de ${formatUSD(cant)} registrada por ${formatMoney(enPesos)}.`,
    )
    router.refresh()
  }

  return (
    <div className="mb-7 space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={abierta === 'comprar' ? 'primary' : 'secondary'}
          icon="arribaFlecha"
          onClick={() => abrir('comprar')}
        >
          Comprar dólares
        </Button>
        <Button
          variant={abierta === 'vender' ? 'primary' : 'secondary'}
          icon="abajoFlecha"
          onClick={() => abrir('vender')}
          disabled={tenencia <= 0}
          title={tenencia <= 0 ? 'No hay dólares para vender' : undefined}
        >
          Vender dólares
        </Button>
      </div>

      {abierta && (
        <Card>
          <h2 className="text-[13px] font-extrabold text-ink">
            {abierta === 'comprar' ? 'Comprar dólares' : 'Vender dólares'}
          </h2>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            {abierta === 'comprar'
              ? 'Salen pesos de la caja y entran dólares a la reserva. Es una permuta: no toca el resultado.'
              : `Salen dólares y entran pesos. La diferencia contra el costo promedio (${formatMoney(costoPromedio)} por dólar) se realiza como resultado.`}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Cantidad de dólares"
              required
              error={excede ? `Sólo hay ${formatUSD(tenencia)} en la reserva.` : null}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </Field>

            <Field label="Tipo de cambio" required hint="Pesos por dólar.">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={tc}
                onChange={(e) => setTc(e.target.value)}
              />
            </Field>

            <Field label="Medio" required>
              <Select value={medio} onChange={(e) => setMedio(e.target.value as Medio)}>
                {MEDIOS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Fecha" required>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>

            <Field label="Motivo" className="sm:col-span-2 lg:col-span-4" hint="Opcional.">
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Field>
          </div>

          {/* El número por el que se firma, antes de confirmar. */}
          {cantOk && tcOk && (
            <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[12px] text-ink">
              <Badge estado="info">{formatUSD(cant)}</Badge>
              <span>
                {abierta === 'comprar' ? 'Salen' : 'Entran'}{' '}
                <strong className="font-bold">{formatMoney(enPesos)}</strong> a {formatMoney(cambio)}{' '}
                por dólar.
              </span>
              {abierta === 'vender' && (
                <span className={resultado >= 0 ? 'text-oktx' : 'text-errtx'}>
                  Realiza{' '}
                  <strong className="font-bold">
                    {resultado >= 0 ? '+' : ''}
                    {formatMoney(resultado)}
                  </strong>{' '}
                  de diferencia de cambio.
                </span>
              )}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon="check" loading={ocupado} disabled={!puedeConfirmar} onClick={confirmar}>
              {abierta === 'comprar' ? 'Registrar la compra' : 'Registrar la venta'}
            </Button>
            <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierta(null)}>
              Cancelar
            </Button>
          </div>

          {error && (
            <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">
              {error}
            </p>
          )}
        </Card>
      )}

      {aviso && <p className="rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">{aviso}</p>}
    </div>
  )
}
