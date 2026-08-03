"use client"

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { formatMoney, formatDate } from '@/lib/format'
import PreviewAsiento from '@/components/PreviewAsiento'
import type { Database, Json } from '@/lib/db/database.types'

type CuotaDeuda = Database['public']['Views']['v_deuda_detalle']['Row']
type Predio = Database['public']['Tables']['predio']['Row']

type Medio = 'efectivo' | 'transferencia' | 'cheque'

interface Imputacion {
  cuota_id: string
  monto: number
}

const TOLERANCIA = 0.005

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

  const ordenadas = [...cuotas].sort((a, b) =>
    (a.vence_at ?? '').localeCompare(b.vence_at ?? '')
  )

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

export default function CobrarPage({
  params,
}: {
  params: Promise<{ terceroId: string }>
}) {
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
    [torneosConDeuda, torneoSeleccionado]
  )

  const imputaciones = useMemo(
    () => calcularImputacionAutomatica(cuotasTorneo, monto),
    [cuotasTorneo, monto]
  )

  const sumaImputaciones = useMemo(
    () => Math.round(imputaciones.reduce((acc, i) => acc + i.monto, 0) * 100) / 100,
    [imputaciones]
  )

  const totalDeudaTorneo = useMemo(
    () => cuotasTorneo.reduce((acc, c) => acc + (c.saldo ?? 0), 0),
    [cuotasTorneo]
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
    (medio !== 'efectivo' || !!predioId)

  async function confirmar() {
    if (!torneoSeleccionado) return

    setRegistrando(true)
    setErrorRegistro(null)
    setResultadoExito(null)

    const supabase = createClient()
    const { error } = await supabase.rpc('registrar_cobro', {
      p_tercero_id: terceroId,
      p_monto: monto,
      p_medio: medio,
      p_fecha: fecha,
      p_imputaciones: imputaciones.filter((i) => i.monto > 0) as unknown as Json,
      p_predio_id: medio === 'efectivo' ? (predioId ?? undefined) : undefined,
    })

    setRegistrando(false)

    if (error) {
      setErrorRegistro(error.message)
      return
    }

    setResultadoExito(`Pago de ${formatMoney(monto)} registrado correctamente.`)
    setMonto(0)
    setPredioId(null)
    setRecarga((n) => n + 1)
  }

  return (
    <main className="p-8 font-sans max-w-3xl">
      <Link href={`/cobranza/${terceroId}`} className="text-sm text-blue-600 hover:underline">
        ← Volver a la cuenta corriente
      </Link>

      <h1 className="text-2xl font-bold mt-2 mb-6">Registrar pago — {nombreEquipo}</h1>

      {errorCarga && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">{errorCarga}</pre>
      )}

      {cargando && <p className="text-sm text-gray-500">Cargando…</p>}

      {!cargando && !errorCarga && cuotas.length === 0 && !resultadoExito && (
        <p className="text-sm text-gray-500">Este equipo no tiene cuotas impagas</p>
      )}

      {!cargando && !errorCarga && cuotas.length > 0 && (
        <>
          {torneosConDeuda.length > 1 && (
            <div className="mb-6">
              <div className="text-sm text-gray-500 mb-2">Torneo</div>
              <div className="flex flex-wrap gap-2">
                {torneosConDeuda.map((t) => (
                  <button
                    key={t.torneoId}
                    type="button"
                    onClick={() => setTorneoSeleccionado(t.torneoId)}
                    className={`px-3 py-1.5 rounded border text-sm ${
                      torneoSeleccionado === t.torneoId
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {t.torneo}
                  </button>
                ))}
              </div>
            </div>
          )}

          {torneoSeleccionado && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                <div>
                  <label className="block text-gray-500 mb-1" htmlFor="monto">
                    Monto
                  </label>
                  <input
                    id="monto"
                    type="number"
                    min="0"
                    step="0.01"
                    value={monto || ''}
                    onChange={(e) => setMonto(parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5"
                  />
                </div>

                <div>
                  <label className="block text-gray-500 mb-1" htmlFor="medio">
                    Medio
                  </label>
                  <select
                    id="medio"
                    value={medio}
                    onChange={(e) => setMedio(e.target.value as Medio)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-500 mb-1" htmlFor="fecha">
                    Fecha
                  </label>
                  <input
                    id="fecha"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5"
                  />
                </div>

                {medio === 'efectivo' && (
                  <div>
                    <label className="block text-gray-500 mb-1" htmlFor="predio">
                      Predio
                    </label>
                    <select
                      id="predio"
                      value={predioId ?? ''}
                      onChange={(e) => setPredioId(e.target.value || null)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5"
                    >
                      <option value="">Elegir predio…</option>
                      {predios.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {excedeDeuda && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
                  El monto ingresado ({formatMoney(monto)}) supera la deuda del torneo (
                  {formatMoney(totalDeudaTorneo)}). El sistema va a rechazar el cobro.
                </p>
              )}

              <table className="w-full text-sm border-collapse mb-6">
                <thead>
                  <tr className="text-left border-b border-gray-300">
                    <th className="py-2 pr-4">Cuota</th>
                    <th className="py-2 pr-4">Vencimiento</th>
                    <th className="py-2 pr-4">Saldo</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">A imputar</th>
                  </tr>
                </thead>
                <tbody>
                  {cuotasTorneo.map((cuota) => {
                    const vencida = (cuota.dias_atraso ?? 0) > 0
                    const aImputar =
                      imputaciones.find((i) => i.cuota_id === cuota.cuota_id)?.monto ?? 0

                    return (
                      <tr
                        key={cuota.cuota_id}
                        className={`border-b border-gray-100 ${vencida ? 'bg-red-50' : ''}`}
                      >
                        <td className="py-2 pr-4">{cuota.cuota_numero}</td>
                        <td className="py-2 pr-4">{formatDate(cuota.vence_at)}</td>
                        <td className="py-2 pr-4">{formatMoney(cuota.saldo ?? 0)}</td>
                        <td className="py-2 pr-4">{cuota.estado}</td>
                        <td className="py-2 pr-4">{aImputar > 0 ? formatMoney(aImputar) : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {monto > 0 && imputacionCompleta && (
                <div className="mb-6">
                  <PreviewAsiento
                    terceroId={terceroId}
                    monto={monto}
                    medio={medio}
                    imputaciones={imputaciones}
                  />
                </div>
              )}

              {errorRegistro && (
                <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4 whitespace-pre-wrap">
                  {errorRegistro}
                </pre>
              )}

              {resultadoExito && (
                <p className="text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-4 text-sm">
                  {resultadoExito}{' '}
                  <Link href={`/cobranza/${terceroId}`} className="underline">
                    Volver a la cuenta corriente
                  </Link>
                </p>
              )}

              <button
                type="button"
                disabled={!puedeConfirmar}
                onClick={confirmar}
                className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
              >
                {registrando ? 'Registrando…' : 'Confirmar pago'}
              </button>
            </>
          )}
        </>
      )}
    </main>
  )
}