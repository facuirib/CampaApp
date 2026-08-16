"use client"

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { AsientoPreview, Button } from '@/components/ui'

interface Periodo {
  id: string
  anio: number
  mes: number
  /** Cuántos activos tienen cuota pendiente en este período. */
  pendientes: number
  monto: number
}

interface Propuesta {
  activo_id: string
  nombre: string
  monto: number
  cuota: number
  cuotas_total: number
}

function rotulo(p: { anio: number; mes: number }): string {
  return `${String(p.mes).padStart(2, '0')}/${p.anio}`
}

export default function AmortizarPage() {
  const router = useRouter()

  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const [elegido, setElegido] = useState<string | null>(null)
  const [propuestas, setPropuestas] = useState<Propuesta[]>([])

  const [asentando, setAsentando] = useState(false)
  const [errorAsentar, setErrorAsentar] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  /**
   * Los períodos abiertos con su propuesta.
   *
   * Sólo los que EXISTEN: `asentar_amortizacion` recibe un `periodo_id`, y los
   * períodos se crean solos al primer movimiento del mes. Ofrecer un mes sin
   * período sería ofrecer algo que no se puede hacer.
   */
  const cargar = useCallback(async () => {
    setCargando(true)
    setErrorCarga(null)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('periodo')
      .select('id, anio, mes')
      .eq('estado', 'abierto')
      .order('anio')
      .order('mes')

    if (error) {
      setCargando(false)
      setErrorCarga(error.message)
      return
    }

    const conPropuesta = await Promise.all(
      (data ?? []).map(async (p) => {
        const { data: prop } = await supabase.rpc('proponer_amortizaciones', {
          p_periodo_id: p.id,
        })
        const filas = prop ?? []
        return {
          id: p.id,
          anio: p.anio,
          mes: p.mes,
          pendientes: filas.length,
          monto: filas.reduce((t, f) => t + Number(f.monto), 0),
        }
      }),
    )

    setPeriodos(conPropuesta)
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function elegir(periodoId: string) {
    setElegido(periodoId)
    setExito(null)
    setErrorAsentar(null)

    const supabase = createClient()
    const { data } = await supabase.rpc('proponer_amortizaciones', { p_periodo_id: periodoId })
    setPropuestas(
      (data ?? []).map((d) => ({
        activo_id: d.activo_id,
        nombre: d.nombre,
        monto: Number(d.monto),
        cuota: d.cuota,
        cuotas_total: d.cuotas_total,
      })),
    )
  }

  async function asentar() {
    if (!elegido) return

    setAsentando(true)
    setErrorAsentar(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setAsentando(false)
      setErrorAsentar('Sesión vencida. Volvé a entrar para asentar la amortización.')
      return
    }

    const { data, error } = await supabase.rpc('asentar_amortizacion', {
      p_periodo_id: elegido,
      p_created_by: user.id,
    })

    setAsentando(false)

    if (error) {
      setErrorAsentar(error.message)
      return
    }

    const n = Number(data ?? 0)
    setExito(
      n === 0
        ? 'No había nada pendiente: este período ya estaba amortizado.'
        : `${n} ${n === 1 ? 'amortización asentada' : 'amortizaciones asentadas'}.`,
    )
    setPropuestas([])
    setElegido(null)
    await cargar()
    // Las pantallas de lectura son Server Components: sin esto seguirían
    // mostrando el amortizado viejo hasta una recarga completa.
    router.refresh()
  }

  const periodoElegido = periodos.find((p) => p.id === elegido)
  const total = propuestas.reduce((t, p) => t + p.monto, 0)
  const conPendientes = periodos.filter((p) => p.pendientes > 0)

  return (
    <div className="pb-10">
      <Link href="/activos" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a activos
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Asentar amortización</h1>
        <p className="mt-1 max-w-[74ch] text-[12px] text-muted">
          La cuota del mes de cada activo. Impacta el resultado del período pero{' '}
          <strong className="font-semibold">no la caja</strong>: la plata salió cuando se compró el
          bien. Se propone, se revisa, y recién ahí se asienta.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {exito && (
        <p className="mb-6 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">{exito}</p>
      )}

      {cargando ? (
        <p className="text-[12px] text-muted">Buscando períodos…</p>
      ) : periodos.length === 0 ? (
        <div className="rounded-md border border-line bg-white px-4 py-10 text-center">
          <p className="text-[12px] font-semibold text-ink">No hay períodos abiertos</p>
          <p className="mx-auto mt-2 max-w-[54ch] text-[11px] text-muted">
            Los períodos se crean solos con el primer movimiento de cada mes.
          </p>
        </div>
      ) : (
        <>
          {/* ── El orden importa ──────────────────────────────────────────
              Los períodos van en orden cronológico y TODOS a la vista, no sólo
              los que tienen pendientes. Nada impide asentar agosto y noviembre
              salteando septiembre —el `unique` es por (activo, período), no una
              secuencia— y el hueco quedaría invisible. Viéndolos en fila, se ve. */}
          <h2 className="mb-2 text-[13px] font-bold text-ink">Elegí el período</h2>
          <div className="mb-6 flex flex-wrap gap-2">
            {periodos.map((p) => {
              const activo = p.id === elegido
              const sinNada = p.pendientes === 0
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => elegir(p.id)}
                  disabled={sinNada}
                  className={[
                    'rounded-md border px-4 py-3 text-left transition',
                    activo
                      ? 'border-blue-d bg-blue-l'
                      : sinNada
                        ? 'cursor-not-allowed border-line bg-panel opacity-60'
                        : 'border-line bg-white hover:border-blue-d',
                  ].join(' ')}
                >
                  <span className="block text-[12px] font-bold text-ink">{rotulo(p)}</span>
                  <span className="mt-0.5 block text-[10px] text-muted">
                    {sinNada
                      ? 'Sin pendientes'
                      : `${p.pendientes} ${p.pendientes === 1 ? 'activo' : 'activos'} · ${formatMoney(p.monto)}`}
                  </span>
                </button>
              )
            })}
          </div>

          {conPendientes.length === 0 && (
            <p className="rounded-md border border-line bg-white px-4 py-10 text-center text-[12px] text-muted">
              Ningún período abierto tiene cuotas pendientes. Todo lo amortizable ya está asentado.
            </p>
          )}

          {periodoElegido && propuestas.length > 0 && (
            <>
              <h2 className="mb-2 text-[13px] font-bold text-ink">
                Propuesta de {rotulo(periodoElegido)}
              </h2>

              <div className="mb-4 overflow-hidden rounded-md border border-line bg-white">
                <table className="w-full text-[12px]">
                  <thead className="bg-panel text-[10px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold">Activo</th>
                      <th className="px-4 py-2 text-left font-semibold">Cuota</th>
                      <th className="px-4 py-2 text-right font-semibold">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propuestas.map((p) => (
                      <tr key={p.activo_id} className="border-t border-line">
                        <td className="px-4 py-2.5 font-semibold text-ink">{p.nombre}</td>
                        <td className="px-4 py-2.5 text-muted">
                          {p.cuota}/{p.cuotas_total}
                        </td>
                        <td className="cifra px-4 py-2.5 text-right font-bold text-ink">
                          {formatMoney(p.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Un asiento POR ACTIVO, no uno agregado ────────────────
                  `asentar_amortizacion` crea un asiento por cada activo, y por
                  eso se previsualizan por separado. Mostrar uno solo por el
                  total sería mostrar un asiento que no se va a escribir. */}
              <p className="mb-2 text-[11px] text-muted">
                Se {propuestas.length === 1 ? 'registra' : 'registran'}{' '}
                <strong className="font-semibold text-ink">
                  {propuestas.length} {propuestas.length === 1 ? 'asiento' : 'asientos'}
                </strong>
                , uno por activo, con fecha del último día del mes e imputados a estructura
                permanente —el bien sirve a todos los torneos que dura—.
              </p>

              <div className="mb-5 grid gap-3">
                {propuestas.map((p) => (
                  <AsientoPreview
                    key={p.activo_id}
                    lineas={[
                      { cuenta: 'GAS_AMORT', nombre: `Amortizaciones · ${p.nombre}`, debe: p.monto },
                      { cuenta: 'AMORT_ACUM', nombre: 'Amortización acumulada', haber: p.monto },
                    ]}
                    totalDebe={p.monto}
                    totalHaber={p.monto}
                    balanceado
                  />
                ))}
              </div>

              {errorAsentar && (
                <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
                  {errorAsentar}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={asentar} loading={asentando} disabled={asentando}>
                  Asentar {formatMoney(total)}
                </Button>
                <Button variant="secondary" onClick={() => setElegido(null)} disabled={asentando}>
                  Cancelar
                </Button>
                <span className="text-[11px] text-muted">
                  Correrlo dos veces no duplica: lo ya asentado no se vuelve a tocar.
                </span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
