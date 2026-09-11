"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate, formatMoney, parsearMonto } from '@/lib/format'
import { Button, Field, Input, Select } from '@/components/ui'

/**
 * El fondo de inversión: rescate y colocación.
 *
 * Era la ÚNICA operación del mapa de permisos sin ninguna pantalla que la
 * invocara (`fondo.movimiento` → `registrar_movimiento_fondo`, hallazgo del
 * diagnóstico 11/09): el motor existía, la puerta estaba catalogada, y no
 * había botón.
 *
 * Vive en /caja porque es un movimiento de fondos —no toca el resultado— y
 * la caja es donde impacta: un rescate entra plata, una colocación la saca.
 * El indicador que importa (rescatado vs. colocado por mes, la dependencia
 * del fondo) viene de `v_dependencia_fondo`, ya sumado.
 */

interface Caja {
  id: string
  nombre: string
}

interface MovimientoPrevio {
  id: string
  fecha: string
  tipo: string
  monto: number
  motivo: string | null
}

const TIPOS = [
  { clave: 'rescate', label: 'Rescate (el fondo devuelve, entra a la caja)' },
  { clave: 'colocacion', label: 'Colocación (sale de la caja al fondo)' },
] as const

export default function MovimientoFondo({
  cajas,
  previos,
}: {
  /** Las cajas NO físicas (sin predio): el fondo se mueve contra ellas. */
  cajas: Caja[]
  previos: MovimientoPrevio[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<'rescate' | 'colocacion'>('rescate')
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '')
  const [monto, setMonto] = useState(0)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  const puede = !ocupado && monto > 0 && !!cajaId && motivo.trim() !== ''

  async function registrar() {
    if (!puede) return
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('registrar_movimiento_fondo', {
      p_tipo: tipo,
      p_caja_id: cajaId,
      p_monto: monto,
      p_motivo: motivo.trim(),
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setExito(
      `${tipo === 'rescate' ? 'Rescate' : 'Colocación'} de ${formatMoney(monto)} registrado.`,
    )
    setMonto(0)
    setMotivo('')
    setAbierto(false)
    router.refresh()
  }

  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-extrabold tracking-[-.2px] text-ink">
          Fondo de inversión
        </h2>
        {!abierto && (
          <Button size="pill" variant="secondary" icon="plus" onClick={() => { setExito(null); setAbierto(true) }}>
            Movimiento del fondo
          </Button>
        )}
      </div>

      {exito && <p className="mb-3 rounded-md bg-okbg px-4 py-2.5 text-[11px] text-oktx">{exito}</p>}

      {abierto && (
        <div className="mb-4 rounded-md border border-line bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tipo" className="lg:col-span-2">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
                {TIPOS.map((t) => (
                  <option key={t.clave} value={t.clave}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Caja">
              <Select value={cajaId} onChange={(e) => setCajaId(e.target.value)}>
                {cajas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Monto" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={monto || ''}
                onChange={(e) => setMonto(parsearMonto(e.target.value) ?? 0)}
              />
            </Field>
            <Field label="Motivo" required className="sm:col-span-2 lg:col-span-4">
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Cubrir los sueldos de octubre"
              />
            </Field>
          </div>

          {error && (
            <p className="mt-3 rounded-md bg-errbg px-4 py-2.5 text-[11px] text-errtx">{error}</p>
          )}

          <div className="mt-4 flex gap-2">
            <Button icon="check" loading={ocupado} disabled={!puede} onClick={registrar}>
              Registrar
            </Button>
            <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {previos.length > 0 && (
        <ul className="space-y-1">
          {previos.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-3 rounded-md bg-panel px-3 py-2 text-[11px]">
              <span className="text-muted">
                <span className="font-semibold text-ink">{formatDate(m.fecha)}</span> ·{' '}
                {m.tipo === 'rescate' ? 'Rescate' : 'Colocación'}
                {m.motivo ? ` · ${m.motivo}` : ''}
              </span>
              <span className="font-bold text-ink">{formatMoney(m.monto)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
