"use client"

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { AsientoPreview, Button, Card, Field, Input, Select } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type GastoDetalle = Database['public']['Views']['v_gasto_detalle']['Row']
type Predio = Pick<Database['public']['Tables']['predio']['Row'], 'id' | 'nombre'>

type Medio = 'efectivo' | 'transferencia' | 'cheque'

interface LineaPreviewPago {
  cuenta: string
  cuenta_nombre?: string | null
  debe?: number | null
  haber?: number | null
}

interface PreviewPagoResult {
  lineas: LineaPreviewPago[]
  total_debe: number
  total_haber: number
  balanceado: boolean
}

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
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
  const [previewResultado, setPreviewResultado] = useState<PreviewPagoResult | null>(null)

  const [registrando, setRegistrando] = useState(false)
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)
  const [resultadoExito, setResultadoExito] = useState<string | null>(null)

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

      // preview_pago_gasto no está en los tipos generados (migración sin aplicar).
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: PreviewPagoResult | null; error: { message: string } | null }>
      )('preview_pago_gasto', {
        p_gasto_id: gastoId,
        p_medio: medio,
      })

      if (cancelado) return

      if (error) {
        setPreviewError(error.message)
        setPreviewResultado(null)
      } else {
        setPreviewResultado(data)
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

    // pagar_gasto tampoco está en los tipos generados.
    const { error } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    )('pagar_gasto', {
      p_gasto_id: gastoId,
      p_medio: medio,
      p_pagado_at: pagadoAt,
      p_predio_id: medio === 'efectivo' ? (predioId ?? undefined) : undefined,
      // p_created_by: transitorio hasta que exista auth (bloque 10, Roles y
      // RLS). Se omite y queda a cargo de auth.uid() en el backend — mismo
      // patrón que /gastos/nuevo y p_responsable_id en registrar_cobro (B2).
      // Sin sesión, pagar_gasto va a fallar con "Falta responsable del pago":
      // es esperable hasta entonces.
    })

    setRegistrando(false)

    if (error) {
      setErrorRegistro(error.message)
      return
    }

    setResultadoExito('Pago registrado correctamente.')
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

      {!cargando && !errorCarga && !gasto && (
        <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
          Gasto no encontrado.{' '}
          <Link href="/gastos" className="font-bold text-blue-d underline">
            Volver a gastos
          </Link>
        </div>
      )}

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
            <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
              Este gasto ya está pagado.{' '}
              <Link href="/gastos" className="font-bold text-blue-d underline">
                Volver a gastos
              </Link>
            </div>
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
                    lineas={(previewResultado?.lineas ?? []).map((l) => ({
                      cuenta: l.cuenta,
                      nombre: l.cuenta_nombre,
                      debe: l.debe,
                      haber: l.haber,
                    }))}
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
            </>
          )}
        </>
      )}
    </div>
  )
}