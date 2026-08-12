"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { AsientoPreview, Button, Card, Field, Input, Select } from '@/components/ui'
import { ERROR_PREVIEW_INESPERADO, leerPreviewAsiento, type PreviewAsiento } from '@/lib/db/preview'
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
type Activo = Pick<Database['public']['Tables']['activo']['Row'], 'id' | 'nombre' | 'categoria'>

/**
 * Una jornada con el camino hasta su torneo, que es lo que hace falta para
 * agruparla y para filtrarla por el torneo elegido: la jornada cuelga de una
 * serie, la serie de una categoría, y recién ahí aparece el torneo.
 */
interface JornadaOpcion {
  id: string
  /** Null en playoff: ahí manda `instancia` (lo garantiza chk_liga_o_playoff). */
  numero: number | null
  /** Nullable en el schema: una jornada puede crearse sin fecha todavía. */
  fecha: string | null
  es_playoff: boolean
  instancia: string | null
  serie: { nombre: string; categoria: { nombre: string; torneo_id: string } } | null
}

/** Sentinel del <option> "concepto libre" — no es un id real. */
const CONCEPTO_LIBRE = '__libre__'

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Traduce los errores conocidos de registrar_gasto a mensajes en español. */
function mensajeErrorGasto(error: { message: string }): string {
  const m = error.message.toLowerCase()
  if (m.includes('permission denied'))
    return 'No tenés permiso para registrar gastos. Verificá tu sesión.'
  if (m.includes('violates not-null') || m.includes('null value'))
    return 'Falta completar un dato obligatorio del gasto.'
  if (m.includes('violates foreign key'))
    return 'Alguna referencia del gasto (categoría, torneo o predio) no es válida.'
  if (m.includes('violates check constraint'))
    return 'Los datos del gasto no cumplen una validación del sistema. Revisá los montos y campos.'
  if (m.includes('duplicate key')) return 'Este gasto parece ya estar registrado.'
  // Fallback: mensaje genérico + el técnico entre paréntesis por si sirve para reportar
  return `No se pudo registrar el gasto. (${error.message})`
}

export default function CargarGastoPage() {
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [categorias, setCategorias] = useState<CatGasto[]>([])
  const [conceptos, setConceptos] = useState<ConceptoGasto[]>([])
  const [predios, setPredios] = useState<Predio[]>([])
  const [torneos, setTorneos] = useState<Torneo[]>([])
  const [jornadas, setJornadas] = useState<JornadaOpcion[]>([])
  const [activos, setActivos] = useState<Activo[]>([])

  const [catGastoId, setCatGastoId] = useState<string | null>(null)
  const [conceptoId, setConceptoId] = useState<string | null>(null)
  const [usarConceptoLibre, setUsarConceptoLibre] = useState(false)
  const [conceptoLibre, setConceptoLibre] = useState('')
  const [arancel, setArancel] = useState(0)
  const [cantidad, setCantidad] = useState(1)
  const [devengadoAt, setDevengadoAt] = useState(hoyEnCordoba())
  const [torneoId, setTorneoId] = useState<string | null>(null)
  const [predioId, setPredioId] = useState<string | null>(null)
  const [jornadaId, setJornadaId] = useState<string | null>(null)
  const [activoId, setActivoId] = useState<string | null>(null)

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

      const [
        { data: categoriasData, error: errorCategorias },
        { data: conceptosData, error: errorConceptos },
        { data: prediosData, error: errorPredios },
        { data: torneosData, error: errorTorneos },
        { data: jornadasData, error: errorJornadas },
        { data: activosData, error: errorActivos },
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
        // La jornada cuelga de serie → categoría, y el torneo está recién ahí:
        // se trae el camino entero porque el <optgroup> y el filtro por torneo
        // lo necesitan. Una jornada suspendida no se ofrece.
        supabase
          .from('jornada')
          .select(
            'id, numero, fecha, es_playoff, instancia, serie:serie_id(nombre, categoria:categoria_id(nombre, torneo_id))',
          )
          .in('estado', ['programada', 'jugada'])
          .order('fecha'),
        supabase
          .from('activo')
          .select('id, nombre, categoria')
          .eq('estado', 'activo')
          .order('nombre'),
      ])

      if (cancelado) return

      const error =
        errorCategorias ??
        errorConceptos ??
        errorPredios ??
        errorTorneos ??
        errorJornadas ??
        errorActivos
      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setCategorias(categoriasData ?? [])
      setConceptos(conceptosData ?? [])
      setPredios(prediosData ?? [])
      setTorneos(torneosData ?? [])
      setJornadas(jornadasData ?? [])
      setActivos(activosData ?? [])
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

  // La naturaleza decide qué anclaje pide check_gasto_coherente: `por_fecha`
  // exige jornada e `inversion` exige activo. El trigger es el que manda; acá
  // se muestra el campo que corresponde para no ofrecer un gasto imposible.
  const naturaleza = useMemo(
    () => categorias.find((c) => c.id === catGastoId)?.naturaleza ?? null,
    [categorias, catGastoId],
  )
  const pideJornada = naturaleza === 'por_fecha'
  const pideActivo = naturaleza === 'inversion'

  /**
   * Las jornadas agrupadas por «Categoría · Serie», que es como las nombra
   * quien carga el gasto. Si hay torneo elegido, solo las de ese torneo: un
   * gasto imputado a un torneo con la jornada de otro no lo rechaza nada.
   */
  const gruposDeJornadas = useMemo(() => {
    const grupos = new Map<string, JornadaOpcion[]>()

    for (const j of jornadas) {
      if (!j.serie) continue
      if (torneoId && j.serie.categoria.torneo_id !== torneoId) continue

      const rotulo = `${j.serie.categoria.nombre} · ${j.serie.nombre}`
      const grupo = grupos.get(rotulo)
      if (grupo) grupo.push(j)
      else grupos.set(rotulo, [j])
    }

    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
  }, [jornadas, torneoId])

  function elegirCategoria(id: string) {
    setCatGastoId(id || null)
    // El concepto pertenece a una categoría: al cambiarla, se reinicia.
    setConceptoId(null)
    setUsarConceptoLibre(false)
    setConceptoLibre('')
    // Y el anclaje también: la categoría nueva puede pedir otro, o ninguno.
    setJornadaId(null)
    setActivoId(null)
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
    // El early-return de arriba ya descartó el null, pero no narrowea dentro
    // del closure: se captura acá, que además congela el valor de esta corrida.
    const catId = catGastoId

    async function cargarPreview() {
      setPreviewCargando(true)
      setPreviewError(null)

      const { data, error } = await supabase.rpc('preview_gasto', {
        p_cat_gasto_id: catId,
        p_total: total,
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
  }, [catGastoId, total])

  const conceptoValido = usarConceptoLibre ? conceptoLibre.trim().length > 0 : !!conceptoId

  const puedeConfirmar =
    !registrando &&
    !!catGastoId &&
    conceptoValido &&
    arancel > 0 &&
    cantidad > 0 &&
    !!devengadoAt &&
    (!pideJornada || !!jornadaId) &&
    (!pideActivo || !!activoId) &&
    previewResultado?.balanceado === true

  async function confirmar() {
    if (!catGastoId) return

    setRegistrando(true)
    setErrorRegistro(null)
    setResultadoExito(null)

    const supabase = createClient()

    // El responsable sale de la sesión, no de un default del backend: el
    // asiento va a quedar con este id y tiene que ser el de quien está
    // apretando el botón.
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setRegistrando(false)
      setErrorRegistro('Sesión vencida. Volvé a entrar para registrar el gasto.')
      return
    }

    const { error } = await supabase.rpc('registrar_gasto', {
      p_cat_gasto_id: catGastoId,
      p_arancel: arancel,
      p_cantidad: cantidad,
      p_devengado_at: devengadoAt,
      p_concepto_id: usarConceptoLibre ? undefined : (conceptoId ?? undefined),
      p_concepto_libre: usarConceptoLibre ? conceptoLibre : undefined,
      p_torneo_id: torneoId ?? undefined,
      p_predio_id: predioId ?? undefined,
      p_jornada_id: jornadaId ?? undefined,
      p_activo_id: activoId ?? undefined,
      p_created_by: user.id,
    })

    setRegistrando(false)

    if (error) {
      setErrorRegistro(mensajeErrorGasto(error))
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
    setJornadaId(null)
    setActivoId(null)
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

              {pideJornada && (
                <Field
                  label="Jornada"
                  required
                  error={jornadaId ? null : 'Un gasto por fecha se ancla a una jornada.'}
                  hint={torneoId ? undefined : 'Elegí el torneo para acortar la lista.'}
                >
                  <Select
                    placeholder="Elegir jornada…"
                    value={jornadaId ?? ''}
                    onChange={(e) => setJornadaId(e.target.value || null)}
                  >
                    {gruposDeJornadas.map(([rotulo, delGrupo]) => (
                      <optgroup key={rotulo} label={rotulo}>
                        {delGrupo.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.es_playoff ? j.instancia : `Fecha ${j.numero}`} — {j.fecha}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
              )}

              {pideActivo && (
                <Field
                  label="Activo"
                  required
                  error={activoId ? null : 'Una inversión se imputa a un activo.'}
                >
                  <Select
                    placeholder="Elegir activo…"
                    value={activoId ?? ''}
                    onChange={(e) => setActivoId(e.target.value || null)}
                  >
                    {activos.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre} — {a.categoria}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
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

          <Button icon="check" loading={registrando} disabled={!puedeConfirmar} onClick={confirmar}>
            Registrar gasto
          </Button>
        </>
      )}
    </div>
  )
}
