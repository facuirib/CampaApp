"use client"

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { formatMoney, parsearMonto } from '@/lib/format'
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
import { mediosPago } from '@/lib/domain/medio-pago'
import { estadoCuota } from '@/lib/domain/cobranza'

type CuotaDeuda = Database['public']['Views']['v_deuda_detalle']['Row']
type Predio = Database['public']['Tables']['predio']['Row']

type Medio = 'efectivo' | 'transferencia' | 'cheque' | 'efectivo_transito'

interface Imputacion {
  cuota_id: string
  monto: number
}

const TOLERANCIA = 0.005

// El vocabulario de estados de cuota vive en lib/domain/cobranza.

interface FilaImputacion {
  cuota_id: string
  cuota_numero: number | null
  vence_at: string | null
  saldo: number | null
  estado: CeldaBadge
  a_imputar: React.ReactNode
}

const COLUMNAS: ColumnDef<FilaImputacion>[] = [
  { key: 'cuota_numero', label: 'Cuota', align: 'right', width: 70 },
  { key: 'vence_at', label: 'Vence', format: 'date', width: 110 },
  { key: 'saldo', label: 'Saldo', format: 'money', width: 130 },
  { key: 'estado', label: 'Estado', format: 'badge' },
  // Editable: la propuesta de la base precarga, el operador ajusta (regla 10).
  { key: 'a_imputar', label: 'A imputar', align: 'right', width: 130, interactiva: true },
]

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * La propuesta viene de `proponer_imputacion` — LA BASE, no esta pantalla.
 *
 * Acá vivía `calcularImputacionAutomatica`: antigüedad a secas, aritmética de
 * centavos a mano, y un criterio DISTINTO del de `sugerir_imputacion`. El
 * mismo dominio con dos criterios era exactamente lo que la regla 10 prohíbe.
 * Ahora la base propone (mismo criterio que sugerir_imputacion, acotado al
 * torneo elegido), la tabla la muestra cuota por cuota, el operador puede
 * ajustar cada renglón, y recién su confirmación registra.
 */
interface Propuesta {
  imputaciones: (Imputacion & { saldo: number })[]
  total: number
  deuda_alcance: number
  sobrante: number
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
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const [proponiendo, setProponiendo] = useState(false)
  // Ajustes del operador sobre la propuesta, por cuota. Se limpian cuando
  // cambia lo que la origina (monto o torneo).
  const [ajustes, setAjustes] = useState<Record<string, number>>({})
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

  // La propuesta se pide a la base cada vez que cambia su origen. Con un
  // debounce corto: el monto se tipea de a un dígito.
  useEffect(() => {
    setAjustes({})
    if (!torneoSeleccionado || monto <= 0) {
      setPropuesta(null)
      return
    }
    let cancelado = false
    setProponiendo(true)
    const timer = setTimeout(async () => {
      const { data, error } = await createClient().rpc('proponer_imputacion', {
        p_tercero_id: terceroId,
        p_monto: monto,
        p_torneo_id: torneoSeleccionado,
      })
      if (cancelado) return
      setProponiendo(false)
      if (error) {
        setErrorCarga(error.message)
        setPropuesta(null)
        return
      }
      setPropuesta(data as unknown as Propuesta)
    }, 300)
    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [terceroId, torneoSeleccionado, monto, recarga])

  const cuotasTorneo = useMemo(
    () => torneosConDeuda.find((t) => t.torneoId === torneoSeleccionado)?.cuotas ?? [],
    [torneosConDeuda, torneoSeleccionado],
  )

  const imputaciones = useMemo<Imputacion[]>(() => {
    if (!propuesta) return []
    const base = new Map(propuesta.imputaciones.map((i) => [i.cuota_id, i.monto]))
    // El operador puede ajustar cualquier cuota del torneo, esté o no en la
    // propuesta: mover plata de una vieja a una nueva es exactamente el ajuste
    // que la regla 10 le reserva.
    const resultado: Imputacion[] = []
    for (const c of cuotasTorneo) {
      if (!c.cuota_id) continue
      const monto = ajustes[c.cuota_id] ?? base.get(c.cuota_id) ?? 0
      if (monto > 0) resultado.push({ cuota_id: c.cuota_id, monto })
    }
    return resultado
  }, [propuesta, ajustes, cuotasTorneo])

  // Validación de coherencia, NO un total de pantalla: lo que se muestra sale
  // de la propuesta de la base; esto sólo decide si el botón se habilita, y
  // la base lo re-valida entera en registrar_cobro / imputar_pago.
  const sumaImputaciones = useMemo(
    () => Math.round(imputaciones.reduce((acc, i) => acc + i.monto, 0) * 100) / 100,
    [imputaciones],
  )

  // La deuda del torneo la dice la base (regla 1), junto con la propuesta.
  const totalDeudaTorneo = propuesta?.deuda_alcance ?? 0

  const excedeDeuda = propuesta !== null && monto > totalDeudaTorneo + TOLERANCIA
  const imputacionCompleta = Math.abs(sumaImputaciones - monto) <= TOLERANCIA

  const nombreEquipo = cuotas[0]?.equipo ?? 'Equipo'

  const puedeConfirmar =
    !registrando &&
    !proponiendo &&
    propuesta !== null &&
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

    // El tránsito es OTRA puerta: la plata no entra a ninguna caja de predio
    // sino a EFECTIVO_EN_TRANSITO — el responsable la tiene encima y la
    // liquida en un predio después, desde /caja. La selección de cuotas y las
    // imputaciones son exactamente las mismas.
    const { error } =
      medio === 'efectivo_transito'
        ? await supabase.rpc('recibir_efectivo_en_transito', {
            p_tercero_id: terceroId,
            p_monto: monto,
            p_fecha: fecha,
            p_imputaciones: imputaciones.filter((i) => i.monto > 0) as unknown as Json,
            p_responsable_id: user.id,
          })
        : await supabase.rpc('registrar_cobro', {
            p_tercero_id: terceroId,
            p_monto: monto,
            p_medio: medio,
            p_fecha: fecha,
            p_imputaciones: imputaciones.filter((i) => i.monto > 0) as unknown as Json,
            p_predio_id: medio === 'efectivo' ? (predioId ?? undefined) : undefined,
            p_responsable_id: user.id,
            // Sólo cuando corresponde: mandarlos con otro medio haría que la fila
            // de `cheque` naciera para un cobro que no es un cheque.
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

  // Solo presentación: la propuesta ya vino de la base, acá se la busca para
  // mostrarla — con un input por fila para que el operador la ajuste.
  const filasImputacion: FilaImputacion[] = cuotasTorneo.map((c) => {
    const propuesto = imputaciones.find((i) => i.cuota_id === c.cuota_id)?.monto ?? 0
    return {
      cuota_id: c.cuota_id!,
      cuota_numero: c.cuota_numero,
      vence_at: c.vence_at,
      saldo: c.saldo,
      estado: estadoCuota(c.estado),
      a_imputar:
        propuesta === null ? (
          '—'
        ) : (
          <Input
            type="number"
            min="0"
            step="0.01"
            aria-label={`A imputar en la cuota ${c.cuota_numero ?? ''}`}
            className="w-28 text-right"
            value={propuesto || ''}
            onChange={(e) => {
              setAjustes((prev) => ({
                ...prev,
                [c.cuota_id!]: parsearMonto(e.target.value) ?? 0,
              }))
            }}
          />
        ),
    }
  })

  return (
    <div className="pb-10">
      <Link
        href={`/equipos/${terceroId}`}
        className="text-[11px] font-semibold text-blue-d hover:underline"
      >
        ← Volver a la cuenta corriente
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">
          Registrar cobro — {nombreEquipo}
        </h1>
        <p className="mt-1 text-[12px] text-muted">
          El sistema propone la imputación (torneo en curso primero, después antigüedad) y se
          puede ajustar cuota por cuota antes de confirmar.
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
                      onChange={(e) => setMonto(parsearMonto(e.target.value) ?? 0)}
                    />
                  </Field>

                  <Field label="Medio">
                    <Select value={medio} onChange={(e) => setMedio(e.target.value as Medio)}>
{mediosPago(['efectivo', 'transferencia', 'cheque', 'efectivo_transito']).map((m) => (
                        <option key={m.clave} value={m.clave}>
                          {m.label}
                        </option>
                      ))}
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

              {/* El preview es de registrar_cobro; el tránsito es otra puerta
                  y su asiento es fijo — se dice derecho, sin previsualizar. */}
              {monto > 0 && imputacionCompleta && medio !== 'efectivo_transito' && (
                <div className="mb-4">
                  <PreviewCobro
                    terceroId={terceroId}
                    monto={monto}
                    medio={medio}
                    imputaciones={imputaciones}
                  />
                </div>
              )}

              {medio === 'efectivo_transito' && (
                <p className="mb-4 rounded-md bg-warnbg px-4 py-3 text-[11px] leading-snug text-warntx">
                  <strong className="font-bold">La plata no entra a ninguna caja todavía:</strong>{' '}
                  queda como efectivo en tránsito, a nombre de quien la recibió. Cuando llegue
                  físicamente a un predio, se liquida desde{' '}
                  <strong className="font-bold">Caja → Efectivo en tránsito</strong> — recién ahí
                  aparece en la caja del predio.
                </p>
              )}

              {errorRegistro && (
                <p className="mb-4 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
                  {errorRegistro}
                </p>
              )}

              {resultadoExito && (
                <p className="mb-4 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">
                  {resultadoExito}{' '}
                  <Link href={`/equipos/${terceroId}`} className="font-bold underline">
                    Volver a la cuenta corriente
                  </Link>
                </p>
              )}

              <Button
                icon="check"
                size="touch"
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
