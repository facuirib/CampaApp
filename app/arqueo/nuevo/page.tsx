"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { formatDate } from '@/lib/format'
import { Button, Card, Field, Input, Money, Select } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type DiaSinArquear = Database['public']['Views']['v_saldo_efectivo_dia_cancha']['Row']

/**
 * Qué cajón se está contando.
 *
 * Son dos cajones FÍSICOS distintos en el mismo predio: el del torneo y el del
 * bar. Por eso el mismo día admite un arqueo de cada uno, y por eso el saldo
 * esperado sale de vistas distintas —`v_saldo_efectivo_dia_cancha` contra
 * `v_saldo_bar_dia_cancha`—, que tienen las mismas columnas justamente para
 * que esta pantalla sea una sola.
 *
 * El default es 'torneo': la pantalla arranca exactamente donde arrancaba antes
 * de que el bar existiera, y `crear_arqueo` también tiene ese default. Quien
 * venía arqueando el torneo no se entera del cambio.
 */
type Ambito = 'torneo' | 'bar'

export default function NuevoArqueoPage() {
  const [ambito, setAmbito] = useState<Ambito>('torneo')
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [dias, setDias] = useState<DiaSinArquear[]>([])

  // El día se elige por PREDIO + FECHA, no de un combo que los junta. Con dos
  // predios y una temporada entera, ese combo llega a decenas de opciones
  // «06/09/2026 · Tirolesa» que hay que leer una por una: el operador sabe de
  // qué predio viene y qué día contó, y ninguna de las dos cosas se busca bien
  // en una lista. El dia_cancha se resuelve solo cuando las dos coinciden.
  const [predioId, setPredioId] = useState<string | null>(null)
  const [fecha, setFecha] = useState('')
  const [saldoContado, setSaldoContado] = useState(0)

  const [registrando, setRegistrando] = useState(false)
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)
  const [resultadoExito, setResultadoExito] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setErrorCarga(null)

      // La rama es explícita y no una tabla de lookup: `.from()` necesita un
      // literal para inferir el tipo de la fila. Con una variable, supabase-js
      // colapsa el retorno a la unión de TODAS las tablas y no compila.
      const { data, error } =
        ambito === 'torneo'
          ? await supabase
              .from('v_saldo_efectivo_dia_cancha')
              .select('*')
              .is('arqueo_id', null)
              .order('fecha', { ascending: false })
          : await supabase
              .from('v_saldo_bar_dia_cancha')
              .select('*')
              .is('arqueo_id', null)
              .order('fecha', { ascending: false })

      if (cancelado) return

      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setDias(data ?? [])

      // ?dia=<uuid>, desde la lista de arqueo. Se lee del location en vez de
      // con useSearchParams para no forzar un boundary de Suspense en una
      // página que no necesita nada del lado del servidor.
      // ?dia=<uuid> viene de la lista de arqueo. Ahora que el día se resuelve
      // por predio + fecha, la preselección setea las dos: el resultado es el
      // mismo día, y de paso el operador VE de cuál se trata.
      const preseleccionado = new URLSearchParams(window.location.search).get('dia')
      if (preseleccionado) {
        const d = (data ?? []).find((x) => x.dia_cancha_id === preseleccionado)
        if (d) {
          setPredioId(d.predio_id)
          setFecha(d.fecha ?? '')
        }
      }

      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
    // Cambiar de ámbito recarga: son universos de días distintos, porque un día
    // puede tener el arqueo del torneo hecho y el del bar pendiente.
  }, [ambito])

  // Los predios que de verdad tienen días sin arquear. Ofrecer uno sin días
  // sería ofrecer un camino sin salida.
  const prediosDisponibles = [
    ...new Map(
      dias.map((d) => [d.predio_id, { id: d.predio_id, nombre: d.predio_nombre ?? d.predio }]),
    ).values(),
  ]

  const diasDelPredio = predioId ? dias.filter((d) => d.predio_id === predioId) : []

  // El día sale del cruce. Si no hay ninguno, `diaCanchaId` queda null y el
  // botón no se habilita — pero la pantalla dice POR QUÉ, con las fechas que sí
  // tienen día en ese predio.
  const diaResuelto =
    predioId && fecha ? (diasDelPredio.find((d) => d.fecha === fecha) ?? null) : null

  const diaElegido = diaResuelto
  const diaCanchaId = diaElegido?.dia_cancha_id ?? null

  // Cálculo de UI para feedback inmediato — el registro real, y su
  // `diferencia` (columna generada), los hace crear_arqueo en base.
  const diferencia =
    diaCanchaId && diaElegido?.saldo_sistema != null
      ? saldoContado - diaElegido.saldo_sistema
      : null

  const puedeConfirmar = !registrando && !!diaCanchaId && saldoContado >= 0

  async function confirmar() {
    if (!diaCanchaId) return

    setRegistrando(true)
    setErrorRegistro(null)
    setResultadoExito(null)

    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setRegistrando(false)
      setErrorRegistro('Sesión vencida. Volvé a entrar para registrar el arqueo.')
      return
    }

    const { error } = await supabase.rpc('crear_arqueo', {
      p_dia_cancha_id: diaCanchaId,
      p_saldo_contado: saldoContado,
      p_responsable_id: user.id,
      p_ambito: ambito,
    })

    setRegistrando(false)

    if (error) {
      setErrorRegistro(error.message)
      return
    }

    setResultadoExito('Arqueo registrado.')
    setFecha('')
    setSaldoContado(0)
  }

  return (
    <div className="pb-10">
      <Link href="/arqueo" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a arqueo
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Registrar arqueo</h1>
        <p className="mt-1 text-[12px] text-muted">
          Contá el efectivo del cajón y comparalo con el sistema. No mueve plata.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {/* Qué cajón. Va ANTES de todo lo demás porque cambia el universo de
          días, el saldo esperado y la cuenta que se ajusta después. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[.06em] text-muted">Cajón</span>
        <Button
          size="pill"
          variant={ambito === 'torneo' ? 'secondary' : 'tertiary'}
          onClick={() => {
            setAmbito('torneo')
            setPredioId(null)
            setFecha('')
            setSaldoContado(0)
          }}
        >
          Torneo
        </Button>
        <Button
          size="pill"
          variant={ambito === 'bar' ? 'secondary' : 'tertiary'}
          icon="bar"
          onClick={() => {
            setAmbito('bar')
            setPredioId(null)
            setFecha('')
            setSaldoContado(0)
          }}
        >
          Bar
        </Button>
      </div>

      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && dias.length === 0 && (
        <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
          {ambito === 'torneo'
            ? 'No hay cajas del torneo pendientes de arquear.'
            : 'No hay cajones del bar pendientes de arquear.'}
        </div>
      )}

      {!cargando && !errorCarga && dias.length > 0 && (
        <>
          <Card
            title={ambito === 'torneo' ? 'Arqueo del cajón del torneo' : 'Arqueo del cajón del bar'}
            icon={ambito === 'torneo' ? 'caja' : 'bar'}
            className="mb-4"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Predio" required>
                <Select
                  placeholder="Elegir predio…"
                  value={predioId ?? ''}
                  onChange={(e) => setPredioId(e.target.value || null)}
                >
                  {prediosDisponibles.map((p) => (
                    <option key={p.id} value={p.id!}>
                      {p.nombre}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Fecha"
                required
                hint={
                  predioId
                    ? `${diasDelPredio.length} día(s) sin arquear en este predio.`
                    : 'Elegí primero el predio.'
                }
              >
                <Input
                  type="date"
                  value={fecha}
                  disabled={!predioId}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </Field>

              <Field label="Saldo contado" required hint="Los billetes que hay en el cajón.">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={saldoContado || ''}
                  onChange={(e) => setSaldoContado(parseFloat(e.target.value) || 0)}
                />
              </Field>
            </div>

            {/* El cruce no dio. Se dice POR QUÉ y con qué fechas sí hay día:
                un formulario que sólo deshabilita el botón deja al operador
                probando fechas a ciegas. */}
            {predioId && fecha && !diaResuelto && (
              <p className="mt-3 rounded-md bg-warnbg px-3 py-2 text-[11px] leading-relaxed text-warntx">
                <strong className="font-bold">
                  No hay ningún día sin arquear el {formatDate(fecha)} en ese predio.
                </strong>{' '}
                {diasDelPredio.length > 0 ? (
                  <>
                    Los que sí están pendientes:{' '}
                    {diasDelPredio.slice(0, 6).map((d, i) => (
                      <button
                        key={d.dia_cancha_id}
                        type="button"
                        onClick={() => setFecha(d.fecha ?? '')}
                        className="font-semibold underline"
                      >
                        {i > 0 && ' · '}
                        {formatDate(d.fecha)}
                      </button>
                    ))}
                    {diasDelPredio.length > 6 && ` y ${diasDelPredio.length - 6} más.`}
                  </>
                ) : (
                  'Este predio no tiene días pendientes de arqueo.'
                )}
              </p>
            )}

            {diaElegido && (
              <>
                <p className="mt-3 text-[11px] text-muted">
                  El sistema espera:{' '}
                  <Money value={diaElegido.saldo_sistema ?? 0} className="font-bold text-ink" />
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {ambito === 'torneo'
                    ? 'Sale del diario: los cobros en efectivo de ese predio menos lo pagado y entregado.'
                    : 'Sale del diario: lo que entró por ventas del bar menos lo ya retirado.'}
                </p>
              </>
            )}
          </Card>

          {diaCanchaId && saldoContado > 0 && diferencia !== null && (
            <p className="mb-4 text-[11px]">
              {diferencia === 0 ? (
                <span className="text-muted">Cuadra exacto.</span>
              ) : diferencia > 0 ? (
                <span className="font-bold text-oktx">
                  Sobrante: <Money value={diferencia} />
                </span>
              ) : (
                <span className="font-bold text-errtx">
                  Faltante: <Money value={Math.abs(diferencia)} />
                </span>
              )}
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
              {diferencia !== null && diferencia !== 0
                ? 'La diferencia queda pendiente de asentar: se hace desde la lista.'
                : ''}{' '}
              <Link href="/arqueo" className="font-bold underline">
                Volver a arqueo
              </Link>
            </p>
          )}

          <Button icon="check" loading={registrando} disabled={!puedeConfirmar} onClick={confirmar}>
            Registrar arqueo
          </Button>
        </>
      )}
    </div>
  )
}
