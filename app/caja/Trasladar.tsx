"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { Button, Card, Field, Input, Select } from '@/components/ui'

export interface CajaOpcion {
  caja_id: string
  nombre: string
  saldo: number
  predio_id: string | null
  predio: string | null
}

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Mover plata entre cajas.
 *
 * La función arma UN asiento de dos líneas —destino al debe, origen al haber—
 * así que es imposible de descuadrar. Acá sólo se la llama, y se evita ofrecer
 * lo que va a fallar:
 *
 *   · el destino no ofrece la caja de origen (misma caja)
 *   · ni otra caja de efectivo de OTRO predio, que la función rechaza porque
 *     la plata no viaja de un predio al otro sin pasar por central
 *   · y el monto se compara contra el saldo del origen
 *
 * Las tres las valida la base igual. Acá están para que el error no llegue
 * desde Postgres después de completar el formulario.
 */
export default function Trasladar({ cajas }: { cajas: CajaOpcion[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [origenId, setOrigenId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoyEnCordoba())
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const origen = cajas.find((c) => c.caja_id === origenId) ?? null
  const montoNum = Number(monto)
  const montoOk = monto.trim() !== '' && Number.isFinite(montoNum) && montoNum > 0
  const excede = !!origen && montoOk && montoNum > origen.saldo

  // El destino: ni la misma, ni efectivo de otro predio.
  const destinos = cajas.filter((c) => {
    if (!origen || c.caja_id === origen.caja_id) return false
    if (origen.predio_id && c.predio_id && c.predio_id !== origen.predio_id) return false
    return true
  })

  const puedeConfirmar =
    !ocupado && !!origenId && !!destinoId && montoOk && !excede && !!fecha

  async function confirmar() {
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

    const { error: e } = await supabase.rpc('trasladar_entre_cajas', {
      p_origen_id: origenId,
      p_destino_id: destinoId,
      p_monto: montoNum,
      p_fecha: fecha,
      p_motivo: motivo.trim() || undefined,
      p_created_by: user.id,
    })

    setOcupado(false)
    if (e) return setError(e.message)

    const destino = cajas.find((c) => c.caja_id === destinoId)
    setAbierto(false)
    setMonto('')
    setMotivo('')
    setAviso(
      `Traslado de ${formatMoney(montoNum)} de ${origen?.nombre} a ${destino?.nombre} registrado.`,
    )
    router.refresh()
  }

  return (
    <div className="mb-6 space-y-3">
      <Button
        variant={abierto ? 'primary' : 'secondary'}
        icon="arribaFlecha"
        onClick={() => {
          setAbierto(!abierto)
          setError(null)
          setAviso(null)
        }}
      >
        Trasladar entre cajas
      </Button>

      {abierto && (
        <Card>
          <h2 className="text-[13px] font-extrabold text-ink">Trasladar entre cajas</h2>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Un solo movimiento: sale de una caja y entra a la otra por el mismo monto. No cambia el
            total del club, sólo dónde está la plata.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Desde" required>
              <Select
                placeholder="Elegir caja…"
                value={origenId}
                onChange={(e) => {
                  setOrigenId(e.target.value)
                  setDestinoId('')
                }}
              >
                {cajas.map((c) => (
                  <option key={c.caja_id} value={c.caja_id}>
                    {c.nombre} · {formatMoney(c.saldo)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Hacia"
              required
              hint={
                origen?.predio_id
                  ? 'El efectivo de un predio no va directo a otro: pasa por central.'
                  : undefined
              }
            >
              <Select
                placeholder={origen ? 'Elegir caja…' : 'Elegí primero el origen'}
                value={destinoId}
                disabled={!origen}
                onChange={(e) => setDestinoId(e.target.value)}
              >
                {destinos.map((c) => (
                  <option key={c.caja_id} value={c.caja_id}>
                    {c.nombre} · {formatMoney(c.saldo)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Monto"
              required
              error={excede ? `${origen?.nombre} tiene ${formatMoney(origen?.saldo ?? 0)}.` : null}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </Field>

            <Field label="Fecha" required>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>

            <Field label="Motivo" className="sm:col-span-2 lg:col-span-4" hint="Opcional.">
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Para pagar proveedores"
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon="check" loading={ocupado} disabled={!puedeConfirmar} onClick={confirmar}>
              {montoOk ? `Trasladar ${formatMoney(montoNum)}` : 'Trasladar'}
            </Button>
            <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
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
