"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate } from '@/lib/format'
import { Button, Card, Field, Input, Money, Select } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'
import AnularRetiro from '../AnularRetiro'

type Predio = Database['public']['Tables']['predio']['Row']
type Retiro = Database['public']['Views']['v_retiro_bar']['Row']

/**
 * Los destinos que la función acepta HOY.
 *
 * `socios` figura deshabilitado y no como ausente: es un destino decidido que
 * todavía no se conectó con el módulo (`SOCIOS_A_PAGAR`), y anunciarlo en gris
 * ubica al que lo busca —«va a estar acá»— en vez de dejarlo preguntándose si
 * se puede. Mismo criterio que los ítems `pronto` del Sidebar.
 *
 * `retirar_efectivo_bar` lo rechaza con un mensaje propio, así que aunque
 * alguien fuerce el value la base no lo deja pasar.
 */
const DESTINOS = [
  { value: 'central', label: 'Caja central', pronto: false },
  { value: 'banco', label: 'Banco', pronto: false },
  { value: 'socios', label: 'Socios', pronto: true },
] as const

export default function RetiroBarPage() {
  const router = useRouter()

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [predios, setPredios] = useState<Predio[]>([])
  const [retiros, setRetiros] = useState<Retiro[]>([])
  const [saldos, setSaldos] = useState<Record<string, number>>({})

  const [predioId, setPredioId] = useState<string | null>(null)
  const [monto, setMonto] = useState(0)
  const [destino, setDestino] = useState('central')
  const [fecha, setFecha] = useState('')
  const [motivo, setMotivo] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  /**
   * El saldo por predio sale de `saldo_bar_predio`, la MISMA función que usa
   * `retirar_efectivo_bar` para validar. No se reconstruye sumando ventas menos
   * retiros del lado del cliente: eso sería un número contable calculado en el
   * front (regla 1), y encima podría no coincidir con el que la función va a
   * comparar.
   *
   * Y se pide A LA FECHA DEL RETIRO, no a hoy. Es el mismo corte que usa la
   * función: valida contra `saldo_bar_predio(predio, fecha_del_retiro)`. Pedirlo
   * a hoy hacía que la pantalla mostrara $0 mientras la función veía $270.000
   * —o al revés—, que es peor que no mostrar nada: el operador decide con un
   * número que no es el que se va a chequear.
   */
  const cargar = useCallback(async () => {
    setCargando(true)
    setErrorCarga(null)
    const supabase = createClient()

    const [{ data: predioData, error: errPredio }, { data: retiroData, error: errRetiro }] =
      await Promise.all([
        supabase.from('predio').select('*').order('nombre'),
        supabase.from('v_retiro_bar').select('*').order('fecha', { ascending: false }),
      ])

    if (errPredio ?? errRetiro) {
      setErrorCarga((errPredio ?? errRetiro)!.message)
      setCargando(false)
      return
    }

    setPredios(predioData ?? [])
    setRetiros(retiroData ?? [])

    const corte = fecha || new Date().toISOString().slice(0, 10)
    const entradas = await Promise.all(
      (predioData ?? []).map(async (p) => {
        const { data } = await supabase.rpc('saldo_bar_predio', {
          p_predio_id: p.id,
          p_hasta: corte,
        })
        return [p.id, Number(data ?? 0)] as const
      }),
    )
    setSaldos(Object.fromEntries(entradas))
    setCargando(false)
  }, [fecha])

  useEffect(() => {
    cargar()
  }, [cargar])

  const saldoDisponible = predioId ? (saldos[predioId] ?? 0) : null

  // Aviso ANTES de mandar. La función igual lo rechaza —el saldo es su
  // validación—, pero recibir el error después de apretar no ayuda a corregir.
  const excedeSaldo = saldoDisponible !== null && monto > saldoDisponible

  const destinoDisponible = DESTINOS.find((d) => d.value === destino)?.pronto === false

  const puedeRetirar =
    !enviando && predioId !== null && monto > 0 && !excedeSaldo && destinoDisponible

  async function retirar() {
    if (!predioId) return
    setEnviando(true)
    setError(null)
    setExito(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setEnviando(false)
      setError('Sesión vencida. Volvé a entrar para registrar el retiro.')
      return
    }

    const { error: errRpc } = await supabase.rpc('retirar_efectivo_bar', {
      p_predio_id: predioId,
      p_monto: monto,
      p_destino: destino,
      p_fecha: fecha || undefined,
      p_motivo: motivo.trim() || undefined,
      p_created_by: user.id,
    })

    setEnviando(false)
    if (errRpc) {
      setError(errRpc.message)
      return
    }

    setExito('Retiro registrado.')
    setMonto(0)
    setMotivo('')
    await cargar()
    router.refresh()
  }

  const vigentes = useMemo(() => retiros.filter((r) => r.estado === 'vigente'), [retiros])

  return (
    <div className="pb-10">
      <Link href="/bar" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver al bar
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Retirar efectivo del bar</h1>
        <p className="mt-1 text-[12px] text-muted">
          Sacar plata del cajón del bar. No es un gasto: la plata cambia de lugar, no de dueño.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && (
        <>
          {/* El saldo de cada cajón, antes de elegir nada: es el dato que
              determina si el retiro se puede hacer. */}
          <section className="mb-4 grid gap-3 sm:grid-cols-2">
            {predios.map((p) => (
              <Card key={p.id} title={`Cajón del bar · ${p.nombre}`} icon="bar">
                <div className="text-2xl font-extrabold text-ink">
                  <Money value={saldos[p.id] ?? 0} />
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Lo que entró por ventas menos lo ya retirado, al{' '}
                  {formatDate(fecha || new Date().toISOString().slice(0, 10))}.
                </p>
              </Card>
            ))}
          </section>

          <Card title="El retiro" icon="monedas" className="mb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Predio" required>
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

              <Field label="Monto" required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={monto || ''}
                  onChange={(e) => setMonto(parseFloat(e.target.value) || 0)}
                />
              </Field>

              <Field label="Destino" required>
                <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
                  {DESTINOS.map((d) => (
                    <option key={d.value} value={d.value} disabled={d.pronto}>
                      {d.label}
                      {d.pronto ? ' — próximamente' : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Fecha" hint="Vacío = hoy. Cambia el saldo disponible.">
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Motivo" hint="Opcional.">
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej: se lleva la recaudación del fin de semana"
                />
              </Field>
            </div>

            {saldoDisponible !== null && (
              <p className="mt-3 text-[11px] text-muted">
                Disponible en ese cajón al{' '}
                {formatDate(fecha || new Date().toISOString().slice(0, 10))}:{' '}
                <Money value={saldoDisponible} className="font-bold text-ink" />
              </p>
            )}

            {excedeSaldo && (
              <p className="mt-2 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
                No se puede retirar más de lo que hay. Si la plata está, falta cargar el cierre de
                ventas de ese día.
              </p>
            )}

            {!destinoDisponible && (
              <p className="mt-2 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
                El destino <strong>Socios</strong> todavía no está disponible: falta conectarlo con
                el módulo de socios.
              </p>
            )}
          </Card>

          {monto > 0 && predioId && !excedeSaldo && destinoDisponible && (
            <div className="mb-4 rounded-md border border-line bg-white px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[.06em] text-muted">
                Lo que se va a asentar
              </p>
              <ul className="mt-2 grid gap-1">
                <li className="flex justify-between gap-4 text-[11.5px]">
                  <span className="text-ink">
                    {DESTINOS.find((d) => d.value === destino)?.label}
                  </span>
                  <Money value={monto} className="font-bold text-ink" />
                </li>
                <li className="mt-1 flex justify-between gap-4 border-t border-line pt-1.5 text-[11.5px]">
                  <span className="text-muted">
                    Bar Efectivo · {predios.find((p) => p.id === predioId)?.nombre} (al haber)
                  </span>
                  <Money value={monto} className="font-bold text-ink" />
                </li>
              </ul>
              <p className="mt-2 text-[11px] text-muted">
                Transferencia interna: no toca el resultado.
              </p>
            </div>
          )}

          {error && (
            <p className="mb-4 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
              {error}
            </p>
          )}

          {exito && (
            <p className="mb-4 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">{exito}</p>
          )}

          <Button icon="check" loading={enviando} disabled={!puedeRetirar} onClick={retirar}>
            Registrar retiro
          </Button>

          <section className="mt-8">
            <h2 className="mb-3 text-[13px] font-extrabold tracking-[-.2px] text-ink">
              Retiros registrados
            </h2>

            {retiros.length === 0 ? (
              <div className="rounded-md border border-line bg-white px-4 py-10 text-center">
                <p className="text-[13px] font-bold text-ink">Todavía no se retiró plata del bar</p>
                <p className="mx-auto mt-1.5 max-w-md text-[11.5px] text-muted">
                  Cuando alguien se lleve la recaudación del cajón, se carga acá para que el saldo
                  del bar refleje lo que queda.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-line bg-white">
                <table className="w-full text-[11.5px]">
                  <thead className="border-b border-line bg-row-hover">
                    <tr className="text-left text-[10px] uppercase tracking-[.06em] text-muted">
                      <th className="px-3 py-2 font-bold">Fecha</th>
                      <th className="px-3 py-2 font-bold">Predio</th>
                      <th className="px-3 py-2 font-bold">Destino</th>
                      <th className="px-3 py-2 text-right font-bold">Monto</th>
                      <th className="px-3 py-2 font-bold">Motivo</th>
                      <th className="px-3 py-2 font-bold">Estado</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {retiros.map((r) => {
                      const anulado = r.estado === 'anulado'
                      return (
                        <tr key={r.retiro_bar_id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2">{formatDate(r.fecha)}</td>
                          <td className="px-3 py-2">{r.predio_nombre ?? r.predio}</td>
                          <td className="px-3 py-2">{r.destino_nombre}</td>
                          <td className="px-3 py-2 text-right">
                            {anulado ? (
                              <span className="text-muted line-through">
                                <Money value={r.monto ?? 0} />
                              </span>
                            ) : (
                              <Money value={r.monto ?? 0} className="font-bold" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted">{r.motivo ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span
                              className={
                                anulado
                                  ? 'rounded-pill bg-line2 px-2 py-px text-[10px] font-bold text-muted'
                                  : 'rounded-pill bg-okbg px-2 py-px text-[10px] font-bold text-oktx'
                              }
                            >
                              {anulado ? 'Anulado' : 'Vigente'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {anulado ? (
                              <span className="text-[11px] text-muted">{r.anulado_motivo}</span>
                            ) : (
                              <AnularRetiro
                                retiroId={r.retiro_bar_id!}
                                fecha={formatDate(r.fecha)}
                                predio={r.predio_nombre ?? r.predio ?? ''}
                                destino={r.destino_nombre ?? ''}
                                monto={r.monto ?? 0}
                              />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {vigentes.length > 0 && (
              <p className="mt-2 text-[11px] text-muted">
                {vigentes.length} retiro{vigentes.length === 1 ? '' : 's'} vigente
                {vigentes.length === 1 ? '' : 's'}.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
