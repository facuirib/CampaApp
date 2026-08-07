"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { AsientoPreview, Button, Card, Field, Input, Select } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type CatGasto = Pick<
  Database['public']['Tables']['cat_gasto']['Row'],
  'id' | 'nombre' | 'naturaleza' | 'area'
>
type ConceptoGasto = Pick<
  Database['public']['Tables']['concepto_gasto']['Row'],
  'id' | 'nombre' | 'cat_gasto_id' | 'arancel_ref'
>
type Predio = Pick<Database['public']['Tables']['predio']['Row'], 'id' | 'nombre'>
type Torneo = Pick<Database['public']['Tables']['torneo']['Row'], 'id' | 'nombre'>

/** Sentinel del <option> "concepto libre" — no es un id real. */
const CONCEPTO_LIBRE = '__libre__'

interface LineaPreviewGasto {
  cuenta: string
  cuenta_nombre?: string | null
  debe?: number | null
  haber?: number | null
}

interface PreviewGastoResult {
  lineas: LineaPreviewGasto[]
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

export default function CargarGastoPage() {
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [categorias, setCategorias] = useState<CatGasto[]>([])
  const [conceptos, setConceptos] = useState<ConceptoGasto[]>([])
  const [predios, setPredios] = useState<Predio[]>([])
  const [torneos, setTorneos] = useState<Torneo[]>([])

  const [catGastoId, setCatGastoId] = useState<string | null>(null)
  const [conceptoId, setConceptoId] = useState<string | null>(null)
  const [usarConceptoLibre, setUsarConceptoLibre] = useState(false)
  const [conceptoLibre, setConceptoLibre] = useState('')
  const [arancel, setArancel] = useState(0)
  const [cantidad, setCantidad] = useState(1)
  const [devengadoAt, setDevengadoAt] = useState(hoyEnCordoba())
  const [torneoId, setTorneoId] = useState<string | null>(null)
  const [predioId, setPredioId] = useState<string | null>(null)

  const [previewCargando, setPreviewCargando] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewResultado, setPreviewResultado] = useState<PreviewGastoResult | null>(null)

  const [registrando, setRegistrando] = useState(false)
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)
  const [resultadoExito, setResultadoExito] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setErrorCarga(null)

      const [
        { data: categoriasData, error: errorCategorias },
        { data: conceptosData, error: errorConceptos },
        { data: prediosData, error: errorPredios },
        { data: torneosData, error: errorTorneos },
      ] = await Promise.all([
        supabase
          .from('cat_gasto')
          .select('id, nombre, naturaleza, area')
          .eq('activo', true)
          .order('nombre'),
        supabase
          .from('concepto_gasto')
          .select('id, nombre, cat_gasto_id, arancel_ref')
          .eq('activo', true)
          .order('nombre'),
        supabase.from('predio').select('id, nombre').order('nombre'),
        supabase.from('torneo').select('id, nombre').order('nombre'),
      ])

      if (cancelado) return

      const error = errorCategorias ?? errorConceptos ?? errorPredios ?? errorTorneos
      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setCategorias(categoriasData ?? [])
      setConceptos(conceptosData ?? [])
      setPredios(prediosData ?? [])
      setTorneos(torneosData ?? [])
      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
  }, [])

  // Filtrado de UI sobre datos ya traídos, no es una regla de negocio.
  const conceptosDeCategoria = useMemo(
    () => conceptos.filter((c) => c.cat_gasto_id === catGastoId),
    [conceptos, catGastoId],
  )

  function elegirCategoria(id: string) {
    setCatGastoId(id || null)
    // El concepto pertenece a una categoría: al cambiarla, se reinicia.
    setConceptoId(null)
    setUsarConceptoLibre(false)
    setConceptoLibre('')
  }

  function elegirConcepto(value: string) {
    if (value === CONCEPTO_LIBRE) {
      setUsarConceptoLibre(true)
      setConceptoId(null)
      return
    }
    setUsarConceptoLibre(false)
    setConceptoId(value || null)

    const elegido = conceptosDeCategoria.find((c) => c.id === value)
    if (elegido?.arancel_ref != null) {
      setArancel(elegido.arancel_ref)
    }
  }

  // Cálculo de UI para mostrar en pantalla — el monto real del asiento sale
  // de preview_gasto / registrar_gasto, no de esta cuenta.
  const total = arancel * cantidad

  useEffect(() => {
    if (!catGastoId || total <= 0) {
      setPreviewResultado(null)
      setPreviewError(null)
      return
    }

    let cancelado = false
    const supabase = createClient()

    async function cargarPreview() {
      setPreviewCargando(true)
      setPreviewError(null)

      // preview_gasto no está en los tipos generados (migración sin aplicar).
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: PreviewGastoResult | null; error: { message: string } | null }>
      )('preview_gasto', {
        p_cat_gasto_id: catGastoId,
        p_total: total,
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
  }, [catGastoId, total])

  const conceptoValido = usarConceptoLibre ? conceptoLibre.trim().length > 0 : !!conceptoId

  const puedeConfirmar =
    !registrando &&
    !!catGastoId &&
    conceptoValido &&
    arancel > 0 &&
    cantidad > 0 &&
    !!devengadoAt &&
    previewResultado?.balanceado === true

  async function confirmar() {
    if (!catGastoId) return

    setRegistrando(true)
    setErrorRegistro(null)
    setResultadoExito(null)

    const supabase = createClient()

    // registrar_gasto tampoco está en los tipos generados.
    const { error } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    )('registrar_gasto', {
      p_cat_gasto_id: catGastoId,
      p_arancel: arancel,
      p_cantidad: cantidad,
      p_devengado_at: devengadoAt,
      p_concepto_id: usarConceptoLibre ? undefined : conceptoId,
      p_concepto_libre: usarConceptoLibre ? conceptoLibre : undefined,
      p_torneo_id: torneoId ?? undefined,
      p_predio_id: predioId ?? undefined,
      // p_created_by: transitorio hasta que exista auth (bloque 10, Roles y
      // RLS). Se omite y queda a cargo de auth.uid() en el backend — mismo
      // patrón que p_responsable_id en registrar_cobro (B2). Sin sesión,
      // registrar_gasto va a fallar con "Falta responsable del gasto": es
      // esperable hasta entonces.
    })

    setRegistrando(false)

    if (error) {
      setErrorRegistro(error.message)
      return
    }

    setResultadoExito('Gasto registrado correctamente.')
    setCatGastoId(null)
    setConceptoId(null)
    setUsarConceptoLibre(false)
    setConceptoLibre('')
    setArancel(0)
    setCantidad(1)
    setDevengadoAt(hoyEnCordoba())
    setTorneoId(null)
    setPredioId(null)
  }

  return (
    <div className="pb-10">
      <Link href="/gastos" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a gastos
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Cargar gasto</h1>
        <p className="mt-1 text-[12px] text-muted">
          Se reconoce al cargar (devengo). El pago es un paso aparte.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && (
        <>
          <Card title="Datos del gasto" icon="comprobante" className="mb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Categoría" required>
                <Select
                  placeholder="Elegir categoría…"
                  value={catGastoId ?? ''}
                  onChange={(e) => elegirCategoria(e.target.value)}
                >
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nombre} — {cat.area} / {cat.naturaleza}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Concepto" required>
                <Select
                  placeholder="Elegir concepto…"
                  value={usarConceptoLibre ? CONCEPTO_LIBRE : (conceptoId ?? '')}
                  onChange={(e) => elegirConcepto(e.target.value)}
                  disabled={!catGastoId}
                >
                  {conceptosDeCategoria.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                  <option value={CONCEPTO_LIBRE}>Otro (texto libre)</option>
                </Select>
              </Field>

              {usarConceptoLibre && (
                <Field label="Concepto (texto libre)" required>
                  <Input
                    type="text"
                    value={conceptoLibre}
                    onChange={(e) => setConceptoLibre(e.target.value)}
                    placeholder="Describí el gasto…"
                  />
                </Field>
              )}

              <Field label="Arancel" required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={arancel || ''}
                  onChange={(e) => setArancel(parseFloat(e.target.value) || 0)}
                />
              </Field>

              <Field label="Cantidad" required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cantidad || ''}
                  onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
                />
              </Field>

              <Field label="Fecha devengado" required>
                <Input
                  type="date"
                  value={devengadoAt}
                  onChange={(e) => setDevengadoAt(e.target.value)}
                />
              </Field>

              <Field label="Torneo" hint="Vacío = estructura permanente">
                <Select
                  placeholder="Sin torneo…"
                  value={torneoId ?? ''}
                  onChange={(e) => setTorneoId(e.target.value || null)}
                >
                  {torneos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Predio">
                <Select
                  placeholder="Sin predio…"
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

              {/* TODO: jornada — depende de serie, se omite por ahora. La
                  mayoría de los gastos no la necesitan; check_gasto_coherente
                  la valida en el backend cuando haga falta. */}
            </div>
          </Card>

          {total > 0 && (
            <p className="mb-3 text-[11px] text-muted">
              Total: <span className="font-bold text-ink">{formatMoney(total)}</span>
            </p>
          )}

          {catGastoId && total > 0 && (
            <div className="mb-4">
              <AsientoPreview
                colapsable
                descripcion="Devengo del gasto"
                fecha={devengadoAt}
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

          <Button icon="check" loading={registrando} disabled={!puedeConfirmar} onClick={confirmar}>
            Registrar gasto
          </Button>
        </>
      )}
    </div>
  )
}