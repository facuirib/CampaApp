"use client"

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import PreviewCobro from '@/components/PreviewCobro'
import {
  Button,
  DataTable,
  Field,
  Input,
  Select,
  type CeldaBadge,
  type ColumnDef,
} from '@/components/ui'
import type { Database, Json } from '@/lib/db/database.types'

type CuotaDeuda = Database['public']['Views']['v_deuda_detalle']['Row']
type Predio = Database['public']['Tables']['predio']['Row']

type Medio = 'efectivo' | 'transferencia' | 'cheque'

interface Imputacion {
  cuota_id: string
  monto: number
}

const TOLERANCIA = 0.005

/** Mismo mapa que la cuenta corriente: estas filas también son cuotas. */
const ESTADOS: Record<string, CeldaBadge> = {
  al_dia: { estado: 'alDia', label: 'Al día' },
  pagada: { estado: 'ok', label: 'Pagada' },
  por_vencer: { estado: 'porVencer', label: 'Por vencer' },
  vencida: { estado: 'mora', label: 'Vencida' },
  parcial_vencida: { estado: 'mora', label: 'Parcial vencida' },
}

function estadoCuota(codigo: string | null): CeldaBadge {
  return ESTADOS[codigo ?? ''] ?? { estado: 'neutro', label: codigo ?? '—' }
}

interface FilaImputacion {
  cuota_id: string
  cuota_numero: number | null
  vence_at: string | null
  saldo: number | null
  estado: CeldaBadge
  a_imputar: number | null
}

const COLUMNAS: ColumnDef<FilaImputacion>[] = [
  { key: 'cuota_numero', label: 'Cuota', align: 'right', width: 70 },
  { key: 'vence_at', label: 'Vence', format: 'date', width: 110 },
  { key: 'saldo', label: 'Saldo', format: 'money', width: 130 },
  { key: 'estado', label: 'Estado', format: 'badge' },
  { key: 'a_imputar', label: 'A imputar', format: 'money', width: 130 },
]

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Imputa el monto a las cuotas más antiguas primero, hasta agotarlo o cubrirlas todas. */
function calcularImputacionAutomatica(cuotas: CuotaDeuda[], monto: number): Imputacion[] {
  if (monto <= 0) return []

  const ordenadas = [...cuotas].sort((a, b) => (a.vence_at ?? '').localeCompare(b.vence_at ?? ''))

  let restanteCentavos = Math.round(monto * 100)
  const imputaciones: Imputacion[] = []

  for (const cuota of ordenadas) {
    if (restanteCentavos <= 0) break
    if (!cuota.cuota_id) continue

    const saldoCentavos = Math.round((cuota.saldo ?? 0) * 100)
    if (saldoCentavos <= 0) continue

    const aplicarCentavos = Math.min(saldoCentavos, restanteCentavos)
    imputaciones.push({ cuota_id: cuota.cuota_id, monto: aplicarCentavos / 100 })
    restanteCentavos -= aplicarCentavos
  }

  return imputaciones
}

export default function CobrarPage({ params }: { params: Promise<{ terceroId: string }> }) {
  const { terceroId } = use(params)

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [cuotas, setCuotas] = useState<CuotaDeuda[]>([])
  const [predios, setPredios] = useState<Predio[]>([])
  const [recarga, setRecarga] = useState(0)

  const [torneoSeleccionado, setTorneoSeleccionado] = useState<string | null>(null)
  const [monto, setMonto] = useState(0)
  const [medio, setMedio] = useState<Medio>('efectivo')
  const [fecha, setFecha] = useState(hoyEnCordoba())
  const [predioId, setPredioId] = useState<string | null>(null)

  // ── Los datos del cheque ────────────────────────────────────────────────
  //
  // `registrar_cobro` los EXIGE desde siempre —levanta «Un cobro con cheque
  // necesita número, banco y fecha de cobro»— y este formulario nunca los
  // ofreció ni los mandaba. O sea que la opción «Cheque» del select estaba
  // muerta: elegirla y confirmar fallaba siempre, con un error de la base.
  //
  // La función tiene razón en exigirlos: un cheque sin número, banco y fecha no
  // se puede seguir —cuando venza no se sabe cuál acreditar, y si rebota no hay
  // con qué identificarlo ante el banco— y el único momento en que alguien
  // tiene el papel en la mano es al cobrarlo.
  const [chequeNumero, setChequeNumero] = useState('')
  const [chequeBanco, setChequeBanco] = useState('')
  const [chequeFechaCobro, setChequeFechaCobro] = useState('')

  const [registrando, setRegistrando] = useState(false)
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)
  const [resultadoExito, setResultadoExito] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setErrorCarga(null)

      const [{ data: cuotasData, error: errorCuotas }, { data: prediosData, error: errorPredios }] =
        await Promise.all([
          supabase
            .from('v_deuda_detalle')
            .select('*')
            .eq('tercero_id', terceroId)
            .gt('saldo', 0)
            .eq('jornada_suspendida', false)
            .order('vence_at'),
          supabase.from('predio').select('id, nombre'),
        ])

      if (cancelado) return

      const error = errorCuotas ?? errorPredios
      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setCuotas(cuotasData ?? [])
      setPredios((prediosData as Predio[] | null) ?? [])
      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
  }, [terceroId, recarga])

  const torneosConDeuda = useMemo(() => {
    const mapa = new Map<string, { torneoId: string; torneo: string; cuotas: CuotaDeuda[] }>()
    for (const cuota of cuotas) {
      if (!cuota.torneo_id) continue
      const existente = mapa.get(cuota.torneo_id)
      if (existente) {
        existente.cuotas.push(cuota)
      } else {
        mapa.set(cuota.torneo_id, {
          torneoId: cuota.torneo_id,
          torneo: cuota.torneo ?? 'Torneo',
          cuotas: [cuota],
        })
      }
    }
    return Array.from(mapa.values())
  }, [cuotas])

  useEffect(() => {
    if (torneoSeleccionado) return
    if (torneosConDeuda.length === 1) {
      setTorneoSeleccionado(torneosConDeuda[0].torneoId)
    }
  }, [torneosConDeuda, torneoSeleccionado])

  const cuotasTorneo = useMemo(
    () => torneosConDeuda.find((t) => t.torneoId === torneoSeleccionado)?.cuotas ?? [],
    [torneosConDeuda, torneoSeleccionado],
  )

  const imputaciones = useMemo(
    () => calcularImputacionAutomatica(cuotasTorneo, monto),
    [cuotasTorneo, monto],
  )

  const sumaImputaciones = useMemo(
    () => Math.round(imputaciones.reduce((acc, i) => acc + i.monto, 0) * 100) / 100,
    [imputaciones],
  )

  const totalDeudaTorneo = useMemo(
    () => cuotasTorneo.reduce((acc, c) => acc + (c.saldo ?? 0), 0),
    [cuotasTorneo],
  )

  const excedeDeuda = monto > totalDeudaTorneo + TOLERANCIA
  const imputacionCompleta = Math.abs(sumaImputaciones - monto) <= TOLERANCIA

  const nombreEquipo = cuotas[0]?.equipo ?? 'Equipo'

  const puedeConfirmar =
    !registrando &&
    !!torneoSeleccionado &&
    monto > 0 &&
    imputaciones.length > 0 &&
    imputacionCompleta &&
    (medio !== 'efectivo' || !!predioId) &&
    // Los tres, o la base lo rechaza. Se pide acá para que el error no llegue
    // desde Postgres después de armar toda la imputación.
    (medio !== 'cheque' ||
      (!!chequeNumero.trim() && !!chequeBanco.trim() && !!chequeFechaCobro))

  async function confirmar() {
    if (!torneoSeleccionado) return

    setRegistrando(true)
    setErrorRegistro(null)
    setResultadoExito(null)

    const supabase = createClient()
    // El responsable sale de la sesión: el pago y su asiento quedan con este
    // id, así que tiene que ser el de quien está cobrando.
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setRegistrando(false)
      setErrorRegistro('Sesión vencida. Volvé a entrar para registrar el cobro.')
      return
    }

    const { error } = await supabase.rpc('registrar_cobro', {
      p_tercero_id: terceroId,
      p_monto: monto,
      p_medio: medio,
      p_fecha: fecha,
      p_imputaciones: imputaciones.filter((i) => i.monto > 0) as unknown as Json,
      p_predio_id: medio === 'efectivo' ? (predioId ?? undefined) : undefined,
      p_responsable_id: user.id,
      // Sólo cuando corresponde: mandarlos con otro medio haría que la fila de
      // `cheque` naciera para un cobro que no es un cheque.
      p_cheque_numero: medio === 'cheque' ? chequeNumero.trim() : undefined,
      p_cheque_banco: medio === 'cheque' ? chequeBanco.trim() : undefined,
      p_cheque_fecha_cobro: medio === 'cheque' ? chequeFechaCobro : undefined,
    })

    setRegistrando(false)

    if (error) {
      setErrorRegistro(error.message)
      return
    }

    setResultadoExito(
      medio === 'cheque'
        ? `Pago de ${formatMoney(monto)} registrado. El cheque ${chequeNumero.trim()} queda pendiente hasta que se acredite.`
        : `Pago de ${formatMoney(monto)} registrado correctamente.`,
    )
    setMonto(0)
    setPredioId(null)
    setChequeNumero('')
    setChequeBanco('')
    setChequeFechaCobro('')
    setRecarga((n) => n + 1)
  }

  // Solo presentación: la imputación ya está calculada arriba, acá se la busca
  // para mostrarla. Ningún número sale de este map.
  const filasImputacion: FilaImputacion[] = cuotasTorneo.map((c) => ({
    cuota_id: c.cuota_id!,
    cuota_numero: c.cuota_numero,
    vence_at: c.vence_at,
    saldo: c.saldo,
    estado: estadoCuota(c.estado),
    a_imputar: imputaciones.find((i) => i.cuota_id === c.cuota_id)?.monto ?? null,
  }))

  return (
    <div className="pb-10">
      <Link
        href={`/cobranza/${terceroId}`}
        className="text-[11px] font-semibold text-blue-d hover:underline"
      >
        ← Volver a la cuenta corriente
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">
          Registrar cobro — {nombreEquipo}
        </h1>
        <p className="mt-1 text-[12px] text-muted">
          El monto se imputa a las cuotas más viejas primero.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && cuotas.length === 0 && !resultadoExito && (
        <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
          Este equipo no tiene cuotas impagas.
        </div>
      )}

      {!cargando && !errorCarga && cuotas.length > 0 && (
        <>
          {torneosConDeuda.length > 1 && (
            <div className="mb-6">
              <div className="mb-2 text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                Torneo
              </div>
              <div className="flex flex-wrap gap-2">
                {torneosConDeuda.map((t) => (
                  <Button
                    key={t.torneoId}
                    size="pill"
                    variant={torneoSeleccionado === t.torneoId ? 'primary' : 'secondary'}
                    onClick={() => setTorneoSeleccionado(t.torneoId)}
                  >
                    {t.torneo}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {torneoSeleccionado && (
            <>
              <div className="mb-4 rounded-md border border-line bg-white p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Monto" required>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={monto || ''}
                      onChange={(e) => setMonto(parseFloat(e.target.value) || 0)}
                    />
                  </Field>

                  <Field label="Medio">
                    <Select value={medio} onChange={(e) => setMedio(e.target.value as Medio)}>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="cheque">Cheque</option>
                    </Select>
                  </Field>

                  <Field label="Fecha">
                    <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                  </Field>

                  {/* Los tres campos del cheque, sólo cuando el medio es
                      cheque — igual que el predio con el efectivo. Van juntos
                      porque la base los exige juntos: con dos de tres el cobro
                      se rechaza igual. */}
                  {medio === 'cheque' && (
                    <>
                      <Field label="Número de cheque" required>
                        <Input
                          value={chequeNumero}
                          onChange={(e) => setChequeNumero(e.target.value)}
                          placeholder="00012345"
                        />
                      </Field>
                      <Field label="Banco" required>
                        <Input
                          value={chequeBanco}
                          onChange={(e) => setChequeBanco(e.target.value)}
                          placeholder="Galicia"
                        />
                      </Field>
                      <Field
                        label="Fecha de cobro"
                        required
                        hint="Cuándo se puede depositar. Es la que manda al cashflow."
                      >
                        <Input
                          type="date"
                          value={chequeFechaCobro}
                          onChange={(e) => setChequeFechaCobro(e.target.value)}
                        />
                      </Field>
                    </>
                  )}

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
              </div>

              {excedeDeuda && (
                <p className="mb-4 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
                  El monto ingresado ({formatMoney(monto)}) supera la deuda del torneo (
                  {formatMoney(totalDeudaTorneo)}). El sistema va a rechazar el cobro.
                </p>
              )}

              <div className="mb-4">
                <DataTable
                  columns={COLUMNAS}
                  rows={filasImputacion}
                  rowKey="cuota_id"
                  maxHeight={360}
                  emptyMessage="Este torneo no tiene cuotas impagas."
                />
              </div>

              {monto > 0 && imputacionCompleta && (
                <div className="mb-4">
                  <PreviewCobro
                    terceroId={terceroId}
                    monto={monto}
                    medio={medio}
                    imputaciones={imputaciones}
                  />
                </div>
              )}

              {errorRegistro && (
                <p className="mb-4 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
                  {errorRegistro}
                </p>
              )}

              {resultadoExito && (
                <p className="mb-4 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">
                  {resultadoExito}{' '}
                  <Link href={`/cobranza/${terceroId}`} className="font-bold underline">
                    Volver a la cuenta corriente
                  </Link>
                </p>
              )}

              <Button
                icon="check"
                loading={registrando}
                disabled={!puedeConfirmar}
                onClick={confirmar}
              >
                Confirmar cobro
              </Button>
            </>
          )}
        </>
      )}
    </div>
  )
}
