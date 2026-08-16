"use client"

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { AsientoPreview, Button, Card, Field, Input, Select } from '@/components/ui'
import { ERROR_PREVIEW_INESPERADO, leerPreviewAsiento, type PreviewAsiento } from '@/lib/db/preview'
import type { Database } from '@/lib/db/database.types'

type GastoDetalle = Database['public']['Views']['v_gasto_detalle']['Row']
type Predio = Pick<Database['public']['Tables']['predio']['Row'], 'id' | 'nombre'>

type Medio = 'efectivo' | 'transferencia' | 'cheque'

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Traduce los errores conocidos de pagar_gasto a mensajes en español. Mismo patrón que /gastos/nuevo. */
function mensajeErrorPago(error: { message: string }): string {
  const m = error.message.toLowerCase()
  if (m.includes('permission denied'))
    return 'No tenés permiso para registrar pagos. Verificá tu sesión.'
  if (m.includes('violates not-null') || m.includes('null value'))
    return 'Falta completar un dato obligatorio del pago.'
  if (m.includes('violates foreign key'))
    return 'Alguna referencia del pago (categoría, torneo o predio) no es válida.'
  if (m.includes('violates check constraint'))
    return 'Los datos del pago no cumplen una validación del sistema. Revisá los montos y campos.'
  if (m.includes('duplicate key')) return 'Este pago parece ya estar registrado.'
  // Fallback: no matchea ningún patrón técnico, así que es probablemente un
  // raise exception de negocio de la función — ya viene en español y es más
  // claro que cualquier traducción. Se muestra tal cual, sin envolver.
  return error.message
}

export default function PagarGastoPage({ params }: { params: Promise<{ gastoId: string }> }) {
  const { gastoId } = use(params)

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [gasto, setGasto] = useState<GastoDetalle | null>(null)
  const [predios, setPredios] = useState<Predio[]>([])

  const [medio, setMedio] = useState<Medio | ''>('')
  const [pagadoAt, setPagadoAt] = useState(hoyEnCordoba())
  const [predioId, setPredioId] = useState<string | null>(null)

  const [previewCargando, setPreviewCargando] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewResultado, setPreviewResultado] = useState<PreviewAsiento | null>(null)

  const [registrando, setRegistrando] = useState(false)
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)
  const [resultadoExito, setResultadoExito] = useState<string | null>(null)

  const [mostrarAnular, setMostrarAnular] = useState(false)
  const [motivoAnular, setMotivoAnular] = useState('')
  const [anulando, setAnulando] = useState(false)
  const [errorAnular, setErrorAnular] = useState<string | null>(null)
  const [anuladoExito, setAnuladoExito] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setErrorCarga(null)

      const [{ data: gastoData, error: errorGasto }, { data: prediosData, error: errorPredios }] =
        await Promise.all([
          supabase.from('v_gasto_detalle').select('*').eq('gasto_id', gastoId).maybeSingle(),
          supabase.from('predio').select('id, nombre').order('nombre'),
        ])

      if (cancelado) return

      const error = errorGasto ?? errorPredios
      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setGasto(gastoData)
      setPredios(prediosData ?? [])
      // Si el gasto ya tiene predio (heredado del devengo), se prellena.
      if (gastoData?.predio_id) setPredioId(gastoData.predio_id)
      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
  }, [gastoId])

  useEffect(() => {
    if (!medio) {
      setPreviewResultado(null)
      setPreviewError(null)
      return
    }

    let cancelado = false
    const supabase = createClient()

    async function cargarPreview() {
      setPreviewCargando(true)
      setPreviewError(null)

      const { data, error } = await supabase.rpc('preview_pago_gasto', {
        p_gasto_id: gastoId,
        p_medio: medio,
      })

      if (cancelado) return

      if (error) {
        setPreviewError(error.message)
        setPreviewResultado(null)
      } else {
        const asiento = leerPreviewAsiento(data)
        setPreviewError(asiento ? null : ERROR_PREVIEW_INESPERADO)
        setPreviewResultado(asiento)
      }
      setPreviewCargando(false)
    }

    cargarPreview()

    return () => {
      cancelado = true
    }
  }, [gastoId, medio])

  const puedeConfirmar =
    !registrando &&
    !!medio &&
    !!pagadoAt &&
    (medio !== 'efectivo' || !!predioId) &&
    previewResultado?.balanceado === true

  async function confirmar() {
    if (!medio) return

    setRegistrando(true)
    setErrorRegistro(null)
    setResultadoExito(null)

    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setRegistrando(false)
      setErrorRegistro('Sesión vencida. Volvé a entrar para registrar el pago.')
      return
    }

    const { error } = await supabase.rpc('pagar_gasto', {
      p_gasto_id: gastoId,
      p_medio: medio,
      p_pagado_at: pagadoAt,
      p_predio_id: medio === 'efectivo' ? (predioId ?? undefined) : undefined,
      p_created_by: user.id,
    })

    setRegistrando(false)

    if (error) {
      setErrorRegistro(mensajeErrorPago(error))
      return
    }

    setResultadoExito('Pago registrado correctamente.')
  }

  async function confirmarAnulacion() {
    if (!motivoAnular.trim()) return

    setAnulando(true)
    setErrorAnular(null)

    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setAnulando(false)
      setErrorAnular('Sesión vencida. Volvé a entrar para anular el gasto.')
      return
    }

    const { error } = await supabase.rpc('anular_gasto', {
      p_gasto_id: gastoId,
      p_motivo: motivoAnular,
      p_created_by: user.id,
    })

    setAnulando(false)

    if (error) {
      setErrorAnular(error.message)
      return
    }

    setMostrarAnular(false)
    setAnuladoExito('Gasto anulado.')
  }

  // Se usa desde 'devengado' (junto al form de pago) y 'pagado' (en vez del
  // mensaje de solo lectura): un gasto anulado no se puede volver a anular,
  // así que estos son los dos únicos estados donde tiene sentido ofrecerlo.
  function bloqueAnular() {
    if (anuladoExito) {
      return (
        <p className="mt-4 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">
          {anuladoExito}{' '}
          <Link href="/gastos" className="font-bold underline">
            Volver a gastos
          </Link>
        </p>
      )
    }

    if (!mostrarAnular) {
      return (
        <div className="mt-4">
          <Button variant="tertiary" onClick={() => setMostrarAnular(true)}>
            Anular gasto
          </Button>
        </div>
      )
    }

    return (
      <Card title="Anular gasto" icon="alerta" className="mt-4">
        <Field label="Motivo" required>
          <Input
            type="text"
            value={motivoAnular}
            onChange={(e) => setMotivoAnular(e.target.value)}
            placeholder="Por qué se anula…"
          />
        </Field>

        {errorAnular && (
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
            {errorAnular}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            loading={anulando}
            disabled={!motivoAnular.trim() || anulando}
            onClick={confirmarAnulacion}
          >
            Confirmar anulación
          </Button>
          <Button variant="tertiary" disabled={anulando} onClick={() => setMostrarAnular(false)}>
            Cancelar
          </Button>
        </div>
      </Card>
    )
  }

  // El 404 es del recurso, no un estado más de la pantalla: se resuelve acá,
  // durante el render, para que lo capture el not-found más cercano (el
  // global, porque gastos/[gastoId] no tiene uno propio todavía).
  if (!cargando && !errorCarga && !gasto) {
    notFound()
  }

  return (
    <div className="pb-10">
      <Link href="/gastos" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a gastos
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Pagar gasto</h1>
        <p className="mt-1 text-[12px] text-muted">
          Segundo momento del gasto: genera el asiento de pago, aparte del devengo.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && gasto && (
        <>
          <Card title="Gasto" icon="comprobante" className="mb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Concepto
                </div>
                <div className="text-[11.5px] text-ink">{gasto.concepto ?? '—'}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Categoría
                </div>
                <div className="text-[11.5px] text-ink">{gasto.categoria ?? '—'}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Total
                </div>
                <div className="text-[11.5px] font-bold text-ink">
                  {formatMoney(gasto.total ?? 0)}
                </div>
              </div>
            </div>
          </Card>

          {gasto.estado === 'pagado' && (
            <>
              <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
                Este gasto ya está pagado.{' '}
                <Link href="/gastos" className="font-bold text-blue-d underline">
                  Volver a gastos
                </Link>
              </div>
              {bloqueAnular()}
            </>
          )}

          {gasto.estado === 'anulado' && (
            <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
              Este gasto está anulado.{' '}
              <Link href="/gastos" className="font-bold text-blue-d underline">
                Volver a gastos
              </Link>
            </div>
          )}

          {gasto.estado === 'devengado' && (
            <>
              <Card title="Datos del pago" icon="caja" className="mb-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Medio de pago" required>
                    <Select
                      placeholder="Elegir medio…"
                      value={medio}
                      onChange={(e) => setMedio(e.target.value as Medio)}
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="cheque">Cheque</option>
                    </Select>
                  </Field>

                  <Field label="Fecha de pago" required>
                    <Input
                      type="date"
                      value={pagadoAt}
                      onChange={(e) => setPagadoAt(e.target.value)}
                    />
                  </Field>

                  {medio === 'efectivo' && (
                    <Field
                      label="Predio"
                      required
                      error={predioId ? null : 'Un pago en efectivo necesita predio.'}
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
              </Card>

              {medio && (
                <div className="mb-4">
                  <AsientoPreview
                    colapsable
                    descripcion="Pago de gasto"
                    fecha={pagadoAt}
                    cargando={previewCargando}
                    error={previewError}
                    lineas={previewResultado?.lineas ?? []}
                    totalDebe={previewResultado?.total_debe ?? 0}
                    totalHaber={previewResultado?.total_haber ?? 0}
                    balanceado={previewResultado?.balanceado ?? false}
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
                  <Link href="/gastos" className="font-bold underline">
                    Volver a gastos
                  </Link>
                </p>
              )}

              <Button
                icon="check"
                loading={registrando}
                disabled={!puedeConfirmar}
                onClick={confirmar}
              >
                Registrar pago
              </Button>

              {bloqueAnular()}
            </>
          )}
        </>
      )}
    </div>
  )
}
