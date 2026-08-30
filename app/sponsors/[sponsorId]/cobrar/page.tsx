"use client"

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate, formatMoney } from '@/lib/format'
import { Badge, Button, DataTable, Field, Input, Select, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type CuotaSponsor = Database['public']['Views']['v_cuotas_sponsor']['Row']
type Predio = Database['public']['Tables']['predio']['Row']

/**
 * Cobrar una cuota de patrocinio.
 *
 * ── Calcada de `/cobranza/[terceroId]/cobrar`, con dos cosas de menos ──────
 *
 * Es Client Component + `supabase.rpc()`, no Server Action, por la convención
 * del proyecto: **la puerta es la función, no el transporte**.
 * `registrar_cobro_sponsor` valida todo —que la cuota exista, que no esté
 * cobrada, que el medio sea uno de los tres, que el efectivo traiga predio— y
 * crea el asiento y el recibo en una transacción. Una Server Action en el medio
 * no cuidaría nada nuevo, y sería un molde distinto del cobro de equipo para
 * hacer lo mismo.
 *
 * Lo que **no** tiene, y por qué:
 *
 *   · **no hay monto.** El cobro de equipo lo pide porque un equipo paga lo que
 *     puede y hay que imputarlo. La cuota de sponsor se cobra entera o no se
 *     cobra: el monto lo pone el contrato y la función lo lee de la cuota. Un
 *     campo editable acá sería un campo que la función ignora — peor que no
 *     tenerlo, porque miente sobre lo que se puede decidir.
 *   · **no hay imputación.** Por lo mismo: una cuota, un cobro.
 *   · **no hay cheque.** El cobro de equipo lo ofrece;
 *     `registrar_cobro_sponsor` acepta `transferencia`, `central` y `efectivo`
 *     y nada más. Ofrecerlo sería ofrecer un botón que la base rechaza.
 *
 * `central` es la caja central —el sponsor pasa por la oficina a pagar—, la
 * misma que ya usan el retiro del bar y el cobro de cheques.
 */

const MEDIOS = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'central', label: 'Caja central' },
] as const

type Medio = (typeof MEDIOS)[number]['value']

interface FilaCuota {
  cuota_id: string
  numero: number | null
  fecha_cobro: string | null
  monto: number | null
  estado: { estado: 'ok' | 'porVencer' | 'mora'; label: string }
}

const COLUMNAS: ColumnDef<FilaCuota>[] = [
  { key: 'numero', label: 'Cuota', align: 'right', width: 70 },
  { key: 'fecha_cobro', label: 'Vence', format: 'date', width: 110 },
  { key: 'monto', label: 'Monto', format: 'money', width: 140 },
  { key: 'estado', label: 'Estado', format: 'badge' },
]

/** La misma fecha de Córdoba que usa el cobro de equipo. */
function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function CobrarSponsorPage({
  params,
}: {
  params: Promise<{ sponsorId: string }>
}) {
  const { sponsorId } = use(params)
  const router = useRouter()

  const [cuotas, setCuotas] = useState<CuotaSponsor[]>([])
  const [predios, setPredios] = useState<Predio[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const [cuotaId, setCuotaId] = useState<string>('')
  const [medio, setMedio] = useState<Medio>('transferencia')
  const [fecha, setFecha] = useState(hoyEnCordoba())
  const [predioId, setPredioId] = useState<string | null>(null)

  const [registrando, setRegistrando] = useState(false)
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vivo = true
    async function cargar() {
      setCargando(true)
      const supabase = createClient()
      const [{ data: cuotasData, error: e1 }, { data: prediosData, error: e2 }] = await Promise.all([
        supabase
          .from('v_cuotas_sponsor')
          .select('*')
          .eq('sponsor_id', sponsorId)
          .is('cobrado_at', null)
          .order('numero'),
        supabase.from('predio').select('id, nombre'),
      ])
      if (!vivo) return
      setErrorCarga(e1?.message ?? e2?.message ?? null)
      const pendientes = (cuotasData as CuotaSponsor[] | null) ?? []
      setCuotas(pendientes)
      setPredios((prediosData as Predio[] | null) ?? [])
      // La más vieja primero: es la que se cobra salvo que digan otra cosa.
      setCuotaId((actual) => (pendientes.some((c) => c.cuota_id === actual) ? actual : (pendientes[0]?.cuota_id ?? '')))
      setCargando(false)
    }
    cargar()
    return () => {
      vivo = false
    }
  }, [sponsorId, recarga])

  const elegida = cuotas.find((c) => c.cuota_id === cuotaId) ?? null
  const nombre = cuotas[0]?.sponsor ?? 'Sponsor'

  // El predio no es un detalle del formulario: `crear_asiento` RECHAZA una
  // línea de CAJA_EFECTIVO sin predio, porque sin él el arqueo de ese día no
  // cuadra. Se pide acá para que el error no llegue desde la base.
  const puedeConfirmar =
    !registrando && !!elegida && !!fecha && (medio !== 'efectivo' || !!predioId)

  async function confirmar() {
    if (!elegida) return
    setRegistrando(true)
    setErrorRegistro(null)
    setExito(null)

    const supabase = createClient()
    // El responsable sale de la sesión: el asiento y el recibo quedan con este
    // id, así que tiene que ser el de quien está cobrando.
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setRegistrando(false)
      setErrorRegistro('Sesión vencida. Volvé a entrar para registrar el cobro.')
      return
    }

    const { error } = await supabase.rpc('registrar_cobro_sponsor', {
      p_cuota_id: elegida.cuota_id!,
      p_medio: medio,
      p_fecha: fecha,
      p_predio_id: medio === 'efectivo' ? (predioId ?? undefined) : undefined,
      p_created_by: user.id,
    })

    setRegistrando(false)

    if (error) {
      // RLS habla en inglés y de row-level security. El resto de los mensajes
      // los escribe la función en castellano y se muestran tal cual.
      setErrorRegistro(
        error.message.includes('row-level security')
          ? 'No tenés permiso para registrar cobros.'
          : error.message,
      )
      return
    }

    setExito(
      `Cobro de ${formatMoney(elegida.monto ?? 0)} registrado. Se generó el recibo — podés verlo en Comprobantes.`,
    )
    setPredioId(null)
    setRecarga((n) => n + 1)
    router.refresh()
  }

  const filas: FilaCuota[] = cuotas.map((c) => ({
    cuota_id: c.cuota_id!,
    numero: c.numero,
    fecha_cobro: c.fecha_cobro,
    monto: c.monto,
    estado:
      c.fecha_cobro && c.fecha_cobro < hoyEnCordoba()
        ? { estado: 'mora', label: 'Vencida' }
        : { estado: 'porVencer', label: 'Por vencer' },
  }))

  return (
    <div className="pb-10">
      <Link
        href={`/sponsors/${sponsorId}`}
        className="text-[11px] font-semibold text-blue-d hover:underline"
      >
        ← Volver al sponsor
      </Link>

      <header className="mb-5 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Cobrar patrocinio</h1>
        <p className="mt-1 text-[12px] text-muted">
          {nombre} · la cuota se cobra entera: el monto lo pone el contrato.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {cargando ? (
        <p className="text-[11px] text-muted">Cargando cuotas…</p>
      ) : cuotas.length === 0 ? (
        <div className="rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted">
          Este sponsor no tiene cuotas pendientes de cobro.
        </div>
      ) : (
        <>
          <div className="mb-4">
            <DataTable columns={COLUMNAS} rows={filas} rowKey="cuota_id" maxHeight={280} />
          </div>

          <div className="mb-4 rounded-md border border-line bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Cuota" required>
                <Select value={cuotaId} onChange={(e) => setCuotaId(e.target.value)}>
                  {cuotas.map((c) => (
                    <option key={c.cuota_id} value={c.cuota_id!}>
                      Cuota {c.numero} · {formatMoney(c.monto ?? 0)}
                      {c.fecha_cobro ? ` · vence ${formatDate(c.fecha_cobro)}` : ''}
                    </option>
                  ))}
                </Select>
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
                  error={predioId ? null : 'Un cobro en efectivo necesita predio.'}
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

            {/* El monto no es editable, así que se muestra: es el número por el
                que se firma, y tiene que verse antes de confirmar. */}
            {elegida && (
              <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[12px] text-ink">
                <Badge estado="info">Cuota {elegida.numero}</Badge>
                <span>
                  Se va a cobrar <strong className="font-bold">{formatMoney(elegida.monto ?? 0)}</strong>
                  {' '}por {MEDIOS.find((m) => m.value === medio)?.label.toLowerCase()}, con fecha{' '}
                  {formatDate(fecha)}.
                </span>
              </p>
            )}
          </div>

          {errorRegistro && (
            <p className="mb-4 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
              {errorRegistro}
            </p>
          )}

          {exito && (
            <p className="mb-4 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">{exito}</p>
          )}

          <Button icon="check" loading={registrando} disabled={!puedeConfirmar} onClick={confirmar}>
            {elegida ? `Cobrar ${formatMoney(elegida.monto ?? 0)}` : 'Cobrar'}
          </Button>
        </>
      )}
    </div>
  )
}
