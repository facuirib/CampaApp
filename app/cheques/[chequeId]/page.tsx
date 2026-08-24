import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { formatDate, formatMoney } from '@/lib/format'
import { Badge, type CeldaBadge } from '@/components/ui'
import AccionesCheque from './AccionesCheque'
import type { Database } from '@/lib/db/database.types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Cheque = Database['public']['Views']['v_cheque']['Row']

const ROTULO_SITUACION: Record<string, CeldaBadge> = {
  vencido: { estado: 'vencido', label: 'Vencido' },
  por_vencer: { estado: 'porVencer', label: 'Por vencer' },
  acreditado: { estado: 'ok', label: 'Acreditado' },
  debitado: { estado: 'ok', label: 'Debitado' },
  rechazado: { estado: 'mora', label: 'Rechazado' },
  anulado: { estado: 'neutro', label: 'Anulado' },
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-[12px] font-semibold text-ink">{children}</p>
    </div>
  )
}

export default async function ChequeDetallePage({
  params,
}: {
  params: Promise<{ chequeId: string }>
}) {
  const { chequeId } = await params
  if (!UUID.test(chequeId)) notFound()

  const supabase = await createClient()
  const rol = await rolActual()
  const { data: ch, error } = await supabase
    .from('v_cheque')
    .select('*')
    .eq('cheque_id', chequeId)
    .maybeSingle<Cheque>()

  if (!error && !ch) notFound()

  const esRecibido = ch?.sentido === 'recibido'
  const sit = ROTULO_SITUACION[ch?.situacion ?? ''] ?? { estado: 'neutro', label: ch?.situacion ?? '—' }

  // El origen se enlaza, no se toca: /cobranza y /gastos son de su carril.
  const hrefOrigen = ch?.origen_tipo === 'cobro' ? '/cobranza' : '/gastos'
  const rotuloOrigen = ch?.origen_tipo === 'cobro' ? 'Ver la cobranza' : 'Ver el gasto'

  return (
    <div className="pb-10">
      <Link href="/cheques" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a cheques
      </Link>

      {error && (
        <p className="mt-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {ch && (
        <>
          <header className="mb-6 mt-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">
                Cheque {ch.numero ?? '—'}
              </h1>
              <Badge estado={esRecibido ? 'info' : 'neutro'}>
                {esRecibido ? 'Recibido' : 'Emitido'}
              </Badge>
              <Badge estado={sit.estado}>{sit.label}</Badge>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              {ch.banco ?? 'Sin banco'} ·{' '}
              <span className="cifra font-bold text-ink">{formatMoney(ch.monto ?? 0)}</span>
              {esRecibido
                ? ' · entra cuando se acredita'
                : ' · sale cuando el banco lo debita'}
            </p>
          </header>

          <div className="mb-6 grid gap-4 rounded-md border border-line bg-white px-5 py-4 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            <Dato label="Emisión">{ch.fecha_emision ? formatDate(ch.fecha_emision) : '—'}</Dato>
            <Dato label={esRecibido ? 'Fecha de cobro' : 'Débito esperado'}>
              {ch.fecha_cobro ? formatDate(ch.fecha_cobro) : '—'}
            </Dato>
            {/* El rótulo cambia con el sentido: en emitidos la contraparte NO es
                el proveedor sino la categoría del gasto, porque `gasto` no
                registra a quién se le paga. Llamarla "Contraparte" sugeriría una
                persona que no está. */}
            <Dato label={esRecibido ? 'Equipo' : 'Categoría'}>{ch.contraparte ?? '—'}</Dato>
            <Dato label="Situación">{sit.label}</Dato>
            {ch.fecha_estado && (
              <Dato label="Resuelto el">{formatDate(ch.fecha_estado)}</Dato>
            )}
            {ch.observaciones && <Dato label="Observaciones">{ch.observaciones}</Dato>}
          </div>

          {/* ── El origen ────────────────────────────────────────────────── */}
          <h2 className="mb-2 text-[13px] font-bold text-ink">De dónde salió</h2>
          <p className="mb-6 rounded-md border border-line bg-white px-4 py-3 text-[11px] text-muted">
            {ch.origen_tipo === 'cobro' ? (
              <>
                Nació al <strong className="font-semibold text-ink">registrar un cobro</strong> con
                medio cheque. El asiento del cobro lo dejó en{' '}
                <span className="cifra">Valores a depositar</span>: es un activo hasta que se
                acredita.
              </>
            ) : ch.origen_tipo === 'gasto' ? (
              <>
                Nació al <strong className="font-semibold text-ink">pagar un gasto</strong> con
                cheque. El asiento cambió una deuda por otra —
                <span className="cifra">Proveedores</span> por{' '}
                <span className="cifra">Cheques a pagar</span>— y la plata sale recién cuando el
                banco lo debita.
              </>
            ) : (
              <>Este cheque no tiene origen registrado: se cargó por fuera del circuito.</>
            )}
            {ch.origen_tipo && (
              <>
                {' '}
                <Link href={hrefOrigen} className="font-semibold text-blue-d hover:underline">
                  {rotuloOrigen}
                </Link>
                .
              </>
            )}
          </p>

          {/* ── Los asientos ─────────────────────────────────────────────── */}
          <h2 className="mb-2 text-[13px] font-bold text-ink">Asientos</h2>
          <div className="mb-6 overflow-hidden rounded-md border border-line bg-white">
            <table className="w-full text-[12px]">
              <tbody>
                <tr className="border-b border-line">
                  <td className="px-4 py-3 text-muted">Alta</td>
                  <td className="px-4 py-3 text-right">
                    {ch.asiento_alta_id ? (
                      <Link
                        href={`/movimientos/${ch.asiento_alta_id}`}
                        className="font-semibold text-blue-d hover:underline"
                      >
                        Ver el asiento
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-muted">
                    Cierre
                    <span className="ml-1 text-[10px]">
                      ({esRecibido ? 'acreditación o rechazo' : 'débito'})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {ch.asiento_cierre_id ? (
                      <Link
                        href={`/movimientos/${ch.asiento_cierre_id}`}
                        className="font-semibold text-blue-d hover:underline"
                      >
                        Ver el asiento
                      </Link>
                    ) : (
                      <span className="text-muted">todavía no se resolvió</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Las acciones ─────────────────────────────────────────────────
              Se ofrecen SÓLO las válidas para este cheque. `cambiar_estado_cheque`
              corta con «el cheque ya está en estado X» y rechaza el emitido, pero
              ofrecer algo que va a fallar es hacer perder el viaje: el que abre
              esta pantalla quiere saber qué puede hacer, no qué está prohibido.

              El caso resuelto no monta el componente cliente: no hay ninguna
              transición posible, así que tampoco hace falta JavaScript. */}
          <h2 className="mb-2 text-[13px] font-bold text-ink">Acciones</h2>

          {ch.estado === 'pendiente' ? (
            /* Los dos permisos van SEPARADOS y resueltos acá, en el servidor.
               Es la única isla del sistema con dos botones vecinos de permisos
               distintos: el operador acredita y debita —curso normal del
               cheque— pero no rechaza, porque rechazar revierte el cobro y
               reabre la deuda del equipo. Del otro lado no hay una policy que
               los separe: es la misma función y la misma tabla, y lo que los
               separa es una guarda adentro de `cambiar_estado_cheque`. */
            <AccionesCheque
              chequeId={chequeId}
              sentido={esRecibido ? 'recibido' : 'emitido'}
              monto={ch.monto ?? 0}
              numero={ch.numero}
              contraparte={ch.contraparte}
              pagoId={ch.pago_id}
              asientoAltaId={ch.asiento_alta_id}
              puedeMover={puede(rol, 'cheque.mover')}
              puedeRechazar={puede(rol, 'cheque.rechazar')}
            />
          ) : (
            <div className="rounded-md border border-line bg-panel px-4 py-5 text-center">
              <p className="text-[11px] text-muted">
                Este cheque ya está{' '}
                <strong className="font-semibold text-ink">{ch.estado}</strong>: un
                cheque sólo cambia de estado desde <em>pendiente</em>, así que no admite más
                movimientos. Quedó registrado con su asiento de cierre.
              </p>
            </div>
          )}

        </>
      )}
    </div>
  )
}
