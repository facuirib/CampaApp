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

  const [diaCanchaId, setDiaCanchaId] = useState<string | null>(null)
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
      const preseleccionado = new URLSearchParams(window.location.search).get('dia')
      if (preseleccionado) setDiaCanchaId(preseleccionado)

      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
    // Cambiar de ámbito recarga: son universos de días distintos, porque un día
    // puede tener el arqueo del torneo hecho y el del bar pendiente.
  }, [ambito])

  const diaElegido = dias.find((d) => d.dia_cancha_id === diaCanchaId) ?? null

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
    setDiaCanchaId(null)
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
            setDiaCanchaId(null)
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
            setDiaCanchaId(null)
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
              <Field label="Día de cancha" required className="lg:col-span-2">
                <Select
                  placeholder="Elegir día…"
                  value={diaCanchaId ?? ''}
                  onChange={(e) => setDiaCanchaId(e.target.value || null)}
                >
                  {dias.map((d) => (
                    // La vista tipa todas sus columnas como nullable, que es
                    // lo que hace Supabase con cualquier vista. dia_cancha_id
                    // viene de dia_cancha.id, que es PK.
                    <option key={d.dia_cancha_id} value={d.dia_cancha_id!}>
                      {formatDate(d.fecha)} · {d.predio_nombre ?? d.predio}
                    </option>
                  ))}
                </Select>
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
