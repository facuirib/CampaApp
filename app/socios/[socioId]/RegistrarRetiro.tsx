"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { Button, Card, Field, Input, Select } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type Predio = Pick<Database['public']['Tables']['predio']['Row'], 'id' | 'nombre'>

/**
 * Registrar un retiro de un socio.
 *
 * ── El motor ya estaba ────────────────────────────────────────────────────
 *
 * `crear_retiro_socio` existe desde el módulo de socios: valida el saldo de
 * caja, arma el asiento `SOCIOS_A_PAGAR` / caja y tiene su guarda de
 * admin/finanzas. Lo único que faltaba era por dónde llamarla — hasta hoy los
 * retiros se cargaban a mano contra la base, y el botón de esta pantalla estaba
 * deshabilitado con un cartel de «en construcción».
 *
 * Por eso el formulario pide exactamente lo que la función necesita y nada más:
 * monto, medio, fecha y —sólo con efectivo— predio. Un campo de más sería un
 * campo que la función ignora.
 *
 * ── Por qué NO valida saldo suficiente ────────────────────────────────────
 *
 * Retirar más de lo devengado es un caso previsto y no un error (decisión 71):
 * el saldo queda en contra y la pantalla lo muestra en alerta. Lo que sí valida
 * la función es que haya plata EN LA CAJA, que es otra cosa — y ese error llega
 * desde la base con su mensaje.
 */

const MEDIOS = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'central', label: 'Caja central' },
] as const

type Medio = (typeof MEDIOS)[number]['value']

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function RegistrarRetiro({
  socioId,
  socio,
  saldo,
  predios,
}: {
  socioId: string
  socio: string
  saldo: number
  predios: Predio[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState<Medio>('transferencia')
  const [fecha, setFecha] = useState(hoyEnCordoba())
  const [predioId, setPredioId] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const montoNum = Number(monto)
  const montoOk = monto.trim() !== '' && Number.isFinite(montoNum) && montoNum > 0

  // El predio no es un detalle del formulario: `crear_asiento` RECHAZA una
  // línea de CAJA_EFECTIVO sin predio, porque sin él no cuadra el arqueo.
  const puedeConfirmar = !ocupado && montoOk && !!fecha && (medio !== 'efectivo' || !!predioId)

  async function confirmar() {
    setOcupado(true)
    setError(null)
    setAviso(null)

    const supabase = createClient()
    const { error: e } = await supabase.rpc('crear_retiro_socio', {
      p_socio_id: socioId,
      p_monto: montoNum,
      p_medio: medio,
      p_fecha: fecha,
      p_predio_id: medio === 'efectivo' ? (predioId ?? undefined) : undefined,
    })

    setOcupado(false)
    if (e) {
      return setError(
        e.message.includes('row-level security')
          ? 'Registrar un retiro es de administrador o finanzas.'
          : e.message,
      )
    }

    setAbierto(false)
    setMonto('')
    setPredioId(null)
    setAviso(`Retiro de ${formatMoney(montoNum)} registrado.`)
    router.refresh()
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={abierto ? 'primary' : 'secondary'}
          icon="monedas"
          onClick={() => {
            setAbierto(!abierto)
            setError(null)
            setAviso(null)
          }}
        >
          Registrar retiro
        </Button>
        {saldo < 0 && (
          <p className="text-[10.5px] text-warntx">
            Este socio ya retiró {formatMoney(-saldo)} más de lo devengado.
          </p>
        )}
      </div>

      {abierto && (
        <Card>
          <h2 className="text-[13px] font-extrabold text-ink">Retiro de {socio}</h2>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Cancela parte de lo que el club le debe: sale plata de la caja y baja el saldo a favor
            del socio. No es un gasto — es el pasivo que se paga.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Monto" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
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

            {medio === 'efectivo' && (
              <Field
                label="Predio"
                required
                error={predioId ? null : 'Un retiro en efectivo necesita predio.'}
              >
                <Select
                  placeholder="Elegir predio…"
                  value={predioId ?? ''}
                  onChange={(e) => setPredioId(e.target.value || null)}
                >
                  {predios.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon="check" loading={ocupado} disabled={!puedeConfirmar} onClick={confirmar}>
              {montoOk ? `Registrar retiro de ${formatMoney(montoNum)}` : 'Registrar retiro'}
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
