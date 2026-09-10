"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate, formatMoney } from '@/lib/format'
import { Badge, Button, Field, Input } from '@/components/ui'

export interface PagoDeEquipo {
  id: string
  fecha: string | null
  monto: number
  medio: string | null
  asiento_id: string | null
  anulado: boolean
}

const MEDIO: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
}

/**
 * Los pagos registrados del equipo — y la anulación de un cobro.
 *
 * Hasta esta sección, el pago no se listaba en NINGUNA pantalla: se
 * registraba, movía cuotas y diario, y desaparecía de la vista. Un cobro mal
 * cargado no se podía ni encontrar ni deshacer desde la app, con anular_pago
 * esperando en la base.
 *
 * ── Qué hace anular, dicho antes de tocar ─────────────────────────────────
 *
 * Anular un cobro borra sus imputaciones y contraasienta el asiento: las
 * cuotas que ese pago cubría VUELVEN A DEBERSE. Es la clase de acto que se
 * descubre por el reclamo al equipo que ya había pagado — por eso es de
 * administración y finanzas, y por eso el motivo obligatorio queda en el
 * diario.
 *
 * Un pago con factura fiscal emitida no se puede anular así: la función frena
 * y pide la nota de crédito (que todavía no existe). El error se muestra tal
 * cual — es la explicación, no un fallo.
 */
export default function PagosEquipo({
  pagos,
  puedeAnular,
}: {
  pagos: PagoDeEquipo[]
  puedeAnular: boolean
}) {
  const router = useRouter()
  const [anulando, setAnulando] = useState<PagoDeEquipo | null>(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function anular() {
    if (!anulando) return
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('anular_pago', {
      p_pago_id: anulando.id,
      p_motivo: motivo.trim(),
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setAnulando(null)
    setMotivo('')
    router.refresh()
  }

  if (pagos.length === 0) return null

  return (
    <section className="mt-8 border-t border-line pt-6">
      <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
        Pagos registrados
      </h2>
      <p className="mb-3 text-[11px] leading-snug text-muted">
        Cada cobro que este equipo hizo, con su asiento. Los anulados se muestran tachados — el
        diario es historia, y la anulación también es un hecho.
      </p>

      <div className="overflow-x-auto rounded-md border border-line bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-panel text-[9px] uppercase tracking-[.06em] text-muted">
            <tr>
              <th className="px-4 py-2 text-left font-bold">Fecha</th>
              <th className="px-3 py-2 text-left font-bold">Medio</th>
              <th className="px-3 py-2 text-right font-bold">Monto</th>
              <th className="px-4 py-2 text-left font-bold">Asiento</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => (
              <tr key={p.id} className={`border-t border-line2 ${p.anulado ? 'opacity-60' : ''}`}>
                <td className="px-4 py-2.5 text-ink">{formatDate(p.fecha)}</td>
                <td className="px-3 py-2.5 text-muted">{MEDIO[p.medio ?? ''] ?? p.medio ?? '—'}</td>
                <td className={`cifra px-3 py-2.5 text-right font-bold ${p.anulado ? 'line-through text-muted' : 'text-ink'}`}>
                  {formatMoney(p.monto)}
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    {p.asiento_id && (
                      <Link
                        href={`/movimientos/${p.asiento_id}`}
                        className="text-[11px] font-semibold text-blue-d hover:underline"
                      >
                        Ver asiento
                      </Link>
                    )}
                    {p.anulado && <Badge estado="neutro">Anulado</Badge>}
                  </span>
                </td>
                <td className="px-4 py-1.5 text-right">
                  {puedeAnular && !p.anulado && (
                    <Button
                      size="pill"
                      variant="tertiary"
                      disabled={ocupado}
                      onClick={() => {
                        setAnulando(p)
                        setMotivo('')
                        setError(null)
                      }}
                    >
                      Anular
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {anulando && (
        <div className="mt-3 rounded-md border border-err bg-errbg p-4">
          <p className="text-[12px] font-bold text-errtx">
            Anular el cobro de {formatMoney(anulando.monto)} del {formatDate(anulando.fecha)}
          </p>
          <p className="mt-1 max-w-prose text-[11px] leading-snug text-errtx">
            Se borran sus imputaciones y se contraasienta el asiento:{' '}
            <strong className="font-bold">las cuotas que cubría vuelven a deberse</strong> — el
            equipo va a aparecer de nuevo en cobranza por esa plata. Esto no tiene vuelta atrás.
          </p>
          <div className="mt-3 max-w-xl">
            <Field label="Motivo" required hint="Queda escrito en el contraasiento, en el diario.">
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Se cargó al equipo equivocado"
              />
            </Field>
          </div>
          {error && (
            <p className="mt-3 whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-[11px] leading-relaxed text-errtx">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button icon="borrar" loading={ocupado} disabled={ocupado || !motivo.trim()} onClick={anular}>
              Anular el cobro
            </Button>
            <Button variant="tertiary" disabled={ocupado} onClick={() => setAnulando(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
