"use client"

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate } from '@/lib/format'
import { AsientoPreview, Button, Card, Field, Input, Money, Select } from '@/components/ui'
import { ERROR_PREVIEW_INESPERADO, leerPreviewAsiento, type PreviewAsiento } from '@/lib/db/preview'
import type { Database, Json } from '@/lib/db/database.types'

type ArqueoDetalle = Database['public']['Views']['v_arqueo_detalle']['Row']

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function EntregarArqueoPage({ params }: { params: Promise<{ arqueoId: string }> }) {
  const { arqueoId } = use(params)

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [arqueo, setArqueo] = useState<ArqueoDetalle | null>(null)

  const [fechaEntrega, setFechaEntrega] = useState(hoyEnCordoba())
  // La caja destino. Vacío = central, que es lo que hacía antes y sigue siendo
  // el 95% de las veces: el default no cambia el comportamiento de nadie.
  const [cajaDestinoId, setCajaDestinoId] = useState('')
  const [comentario, setComentario] = useState('')
  const [cajas, setCajas] = useState<{ id: string; nombre: string; predio_id: string | null; cuenta: string }[]>([])

  const [previewCargando, setPreviewCargando] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewResultado, setPreviewResultado] = useState<PreviewAsiento | null>(null)

  const [registrando, setRegistrando] = useState(false)
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)
  const [resultadoExito, setResultadoExito] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setErrorCarga(null)

      const { data, error } = await supabase
        .from('v_arqueo_detalle')
        .select('*')
        .eq('arqueo_id', arqueoId)
        .maybeSingle()

      if (cancelado) return

      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setArqueo(data)

      // Las cajas activas, para el selector de destino. Se filtran en el
      // render, no acá: el filtro depende del predio del arqueo.
      const { data: cajasData } = await supabase
        .from('caja')
        .select('id, nombre, predio_id, cuenta:cuenta_id(codigo)')
        .eq('activo', true)
        .order('nombre')
      if (!cancelado) {
        setCajas(
          (cajasData ?? []).map((c) => ({
            id: c.id,
            nombre: c.nombre,
            predio_id: c.predio_id,
            cuenta: (c.cuenta as unknown as { codigo: string } | null)?.codigo ?? '',
          })),
        )
      }
      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
  }, [arqueoId])

  const puedeEntregar = arqueo?.estado === 'pendiente_entrega' && (arqueo?.saldo_contado ?? 0) > 0

  useEffect(() => {
    if (!puedeEntregar) {
      setPreviewResultado(null)
      setPreviewError(null)
      return
    }

    let cancelado = false
    const supabase = createClient()

    async function cargarPreview() {
      setPreviewCargando(true)
      setPreviewError(null)

      // preview_entrega_central no está en los tipos generados (migración sin
      // aplicar), de ahí el cast — mismo patrón que usaban gastos antes de
      // que Facu regenerara los tipos.
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: Json | null; error: { message: string } | null }>
      )('preview_entrega_central', {
        p_arqueo_id: arqueoId,
      })

      if (cancelado) return

      if (error) {
        setPreviewError(error.message)
        setPreviewResultado(null)
      } else {
        const asiento = data === null ? null : leerPreviewAsiento(data)
        setPreviewError(asiento ? null : ERROR_PREVIEW_INESPERADO)
        setPreviewResultado(asiento)
      }
      setPreviewCargando(false)
    }

    cargarPreview()

    return () => {
      cancelado = true
    }
  }, [arqueoId, puedeEntregar])

  const puedeConfirmar = !registrando && !!fechaEntrega && previewResultado?.balanceado === true

  async function confirmar() {
    setRegistrando(true)
    setErrorRegistro(null)
    setResultadoExito(null)

    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setRegistrando(false)
      setErrorRegistro('Sesión vencida. Volvé a entrar para registrar la entrega.')
      return
    }

    const { error } = await supabase.rpc('registrar_entrega_central', {
      p_arqueo_id: arqueoId,
      p_fecha: fechaEntrega,
      p_responsable_id: user.id,
      p_caja_destino_id: cajaDestinoId || undefined,
      p_comentario: comentario.trim() || undefined,
    })

    setRegistrando(false)

    if (error) {
      setErrorRegistro(error.message)
      return
    }

    setResultadoExito('Entrega registrada.')
  }

  // El 404 es del recurso, no un estado más de la pantalla: se resuelve acá,
  // durante el render, para que lo capture el not-found más cercano.
  if (!cargando && !errorCarga && !arqueo) {
    notFound()
  }

  return (
    <div className="pb-10">
      <Link href="/arqueo" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a arqueo
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Entrega a central</h1>
        <p className="mt-1 text-[12px] text-muted">
          Traslada el efectivo contado a la caja central. Segundo momento del arqueo.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && arqueo && (
        <>
          <Card title="Arqueo" icon="caja" className="mb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Fecha
                </div>
                <div className="text-[11.5px] text-ink">{formatDate(arqueo.fecha)}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Predio
                </div>
                <div className="text-[11.5px] text-ink">{arqueo.predio ?? '—'}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Saldo contado
                </div>
                <div className="text-[11.5px] font-bold text-ink">
                  <Money value={arqueo.saldo_contado ?? 0} />
                </div>
              </div>
            </div>

            {(arqueo.diferencia ?? 0) !== 0 && (
              <p className="mt-3 text-[11px]">
                {(arqueo.diferencia ?? 0) > 0 ? (
                  <span className="font-bold text-oktx">
                    Sobrante: <Money value={arqueo.diferencia ?? 0} />
                  </span>
                ) : (
                  <span className="font-bold text-errtx">
                    Faltante: <Money value={Math.abs(arqueo.diferencia ?? 0)} />
                  </span>
                )}
              </p>
            )}
          </Card>

          {arqueo.estado === 'entregado' && (
            <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
              Este arqueo ya fue entregado.{' '}
              <Link href="/arqueo" className="font-bold text-blue-d underline">
                Volver a arqueo
              </Link>
            </div>
          )}

          {arqueo.estado !== 'entregado' && (arqueo.saldo_contado ?? 0) === 0 && (
            <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
              Este arqueo contó cero: no hay efectivo que entregar.{' '}
              <Link href="/arqueo" className="font-bold text-blue-d underline">
                Volver a arqueo
              </Link>
            </div>
          )}

          {puedeEntregar && (
            <>
              <Card title="Datos de la entrega" icon="banco" className="mb-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Fecha de entrega" required>
                    <Input
                      type="date"
                      value={fechaEntrega}
                      onChange={(e) => setFechaEntrega(e.target.value)}
                    />
                  </Field>

                  {/* El efectivo no siempre va a la central: puede depositarse,
                      ir a Mercado Pago o quedar en otra caja. El default sigue
                      siendo central, así que quien no elija nada hace lo de
                      siempre.

                      No se ofrece el efectivo de OTRO predio: eso sería un
                      traslado físico de billetes, tiene su propio circuito, y la
                      función lo rechaza igual. Ofrecerlo sería ofrecer un error. */}
                  <Field label="Entregar a" hint="Vacío entrega a la Caja Central, como siempre.">
                    <Select
                      value={cajaDestinoId}
                      onChange={(e) => setCajaDestinoId(e.target.value)}
                    >
                      <option value="">Caja Central</option>
                      {cajas
                        .filter(
                          (c) =>
                            c.cuenta !== 'CAJA_CENTRAL' &&
                            !(c.cuenta === 'CAJA_EFECTIVO' && c.predio_id !== arqueo?.predio_id),
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                    </Select>
                  </Field>

                  <Field
                    label="Comentario"
                    hint="Por qué se entregó ahí, o lo que haga falta anotar."
                    className="lg:col-span-3"
                  >
                    <Input value={comentario} onChange={(e) => setComentario(e.target.value)} />
                  </Field>
                </div>
              </Card>

              <div className="mb-4">
                <AsientoPreview
                  colapsable
                  descripcion="Entrega a central"
                  fecha={fechaEntrega}
                  cargando={previewCargando}
                  error={previewError}
                  lineas={previewResultado?.lineas ?? []}
                  totalDebe={previewResultado?.total_debe ?? 0}
                  totalHaber={previewResultado?.total_haber ?? 0}
                  balanceado={previewResultado?.balanceado ?? false}
                />
              </div>

              {errorRegistro && (
                <p className="mb-4 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
                  {errorRegistro}
                </p>
              )}

              {resultadoExito && (
                <p className="mb-4 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">
                  {resultadoExito}{' '}
                  <Link href="/arqueo" className="font-bold underline">
                    Volver a arqueo
                  </Link>
                </p>
              )}

              <Button
                icon="check"
                loading={registrando}
                disabled={!puedeConfirmar}
                onClick={confirmar}
              >
                Registrar entrega
              </Button>
            </>
          )}
        </>
      )}
    </div>
  )
}
