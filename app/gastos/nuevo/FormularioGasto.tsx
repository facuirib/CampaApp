"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import SelectorProveedor from '@/app/proveedores/SelectorProveedor'
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
type Proveedor = Pick<Database['public']['Tables']['proveedor']['Row'], 'id' | 'nombre'>
type Torneo = Pick<Database['public']['Tables']['torneo']['Row'], 'id' | 'nombre'>
type Activo = Pick<Database['public']['Tables']['activo']['Row'], 'id' | 'nombre' | 'categoria'>


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
  // Fallback: no matchea ningún patrón técnico, así que es probablemente un
  // raise exception de negocio de la función — ya viene en español y es más
  // claro que cualquier traducción. Se muestra tal cual, sin envolver.
  return error.message
}

export interface FormularioGastoProps {
  /**
   * Si viene, el formulario ofrece SÓLO las categorías de esa área.
   *
   * Es lo que permite que la carga de costos de bar viva dentro de `/bar` sin
   * duplicar estas 578 líneas: la misma pantalla, con el catálogo acotado. Y
   * acotarlo importa —no es cosmética—: «Limpieza» existe en predio y en bar y
   * se clasifican distinto, así que ofrecer las cuatro áreas desde Bar invita a
   * elegir la Limpieza equivocada.
   */
  soloArea?: string
  /** El título de la pantalla, que cambia según desde dónde se entre. */
  titulo?: string
  bajada?: string
  /** A dónde vuelve el «← Volver». */
  volverA?: { href: string; label: string }
}

export default function FormularioGasto({
  soloArea,
  titulo = 'Cargar gasto',
  bajada,
  volverA = { href: '/gastos', label: '← Volver a gastos' },
}: FormularioGastoProps = {}) {
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [categorias, setCategorias] = useState<CatGasto[]>([])
  const [conceptos, setConceptos] = useState<ConceptoGasto[]>([])
  const [predios, setPredios] = useState<Predio[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [torneos, setTorneos] = useState<Torneo[]>([])
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
  const [proveedorId, setProveedorId] = useState<string | null>(null)
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
        { data: activosData, error: errorActivos },
        { data: proveedoresData, error: errorProveedores },
      ] = await Promise.all([
        // 🔴 Sin las de inversión: comprar un activo no se carga acá.
        // Se carga en /activos/nuevo, con `comprar_activo`, que crea el activo
        // y su capitalización en la misma transacción. Ofrecerlas de este lado
        // era la mitad del circuito —el gasto sin el activo, o al revés— y por
        // eso nada garantizaba que un activo tuviera su compra.
        supabase
          .from('cat_gasto')
          .select('id, nombre, naturaleza, area')
          .eq('activo', true)
          .neq('naturaleza', 'inversion')
          .order('nombre'),
        supabase
          .from('concepto_gasto')
          .select('id, nombre, cat_gasto_id, arancel_ref')
          .eq('activo', true)
          .order('nombre'),
        supabase.from('predio').select('id, nombre').order('nombre'),
        supabase.from('torneo').select('id, nombre').order('nombre'),
        supabase
          .from('activo')
          .select('id, nombre, categoria')
          .eq('estado', 'activo')
          .order('nombre'),
        supabase.from('proveedor').select('id, nombre').eq('activo', true).order('nombre'),
      ])

      if (cancelado) return

      const error =
        errorCategorias ??
        errorConceptos ??
        errorPredios ??
        errorTorneos ??
        errorActivos ??
        errorProveedores
      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setCategorias(categoriasData ?? [])
      setConceptos(conceptosData ?? [])
      setPredios(prediosData ?? [])
      setTorneos(torneosData ?? [])
      setActivos(activosData ?? [])
      setProveedores(proveedoresData ?? [])
      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
  }, [])

  // Filtrado de UI sobre datos ya traídos, no es una regla de negocio.
  /**
   * Las categorías agrupadas por área.
   *
   * Antes el label era `{nombre} — {area} / {naturaleza}`, y eso mostraba dos
   * cosas que el operador no elige: el ÁREA, que es organización, y la
   * NATURALEZA, que es maquinaria interna —define cómo el gasto escala y se
   * proyecta, no qué se está cargando—.
   *
   * El área no se pierde, cambia de lugar: pasa de sufijo técnico a `<optgroup>`.
   * Y ahí hace falta de verdad, porque **hay categorías con el mismo nombre en
   * áreas distintas** —«Limpieza» existe en predio y en bar, y se clasifican
   * distinto— así que sin el grupo quedarían dos opciones idénticas.
   *
   * La naturaleza desaparece de la vista y NO del dato: `naturaleza` se sigue
   * leyendo del objeto para decidir `pideActivo`, y el trigger
   * `check_gasto_coherente` la valida en la base. Sacarla del label no toca nada.
   */
  const categoriasPorArea = useMemo(() => {
    // Orden fijo y no alfabético: es el orden en que la gente piensa el gasto.
    // Un área nueva que no esté acá cae al final con su propio nombre, así que
    // agregar una al catálogo no la esconde (regla 12).
    const ORDEN = ['torneo', 'predio', 'bar', 'administracion']
    const ROTULO: Record<string, string> = {
      torneo: 'Torneo',
      predio: 'Predio',
      bar: 'Bar',
      administracion: 'Administración',
    }

    const grupos = new Map<string, CatGasto[]>()
    for (const cat of categorias) {
      // Con `soloArea`, el resto del catálogo ni se ofrece.
      if (soloArea && cat.area !== soloArea) continue
      // Y sin `soloArea` —o sea, entrando desde Gastos— el bar NO se ofrece:
      // se carga desde /bar/costo. Dos puertas para lo mismo terminan en dos
      // costumbres distintas y en nadie sabiendo cuál es la buena.
      if (!soloArea && cat.area === 'bar') continue
      const enGrupo = grupos.get(cat.area)
      if (enGrupo) enGrupo.push(cat)
      else grupos.set(cat.area, [cat])
    }

    return [...grupos.entries()]
      .sort(([a], [b]) => {
        const ia = ORDEN.indexOf(a)
        const ib = ORDEN.indexOf(b)
        return (ia === -1 ? ORDEN.length : ia) - (ib === -1 ? ORDEN.length : ib)
      })
      .map(([area, cats]) => [
        ROTULO[area] ?? area,
        [...cats].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
      ] as const)
  }, [categorias, soloArea])

  const conceptosDeCategoria = useMemo(
    () => conceptos.filter((c) => c.cat_gasto_id === catGastoId),
    [conceptos, catGastoId],
  )

  // La naturaleza decide qué anclaje pide check_gasto_coherente: `por_fecha`
  // ── Por qué acá NO se pide jornada (23/08) ───────────────────────────────
  //
  // Un gasto se ancla a FECHA + predio donde corresponda, y a nada más. Anclarlo
  // a una jornada lo ataba a una SERIE —`jornada.serie_id`—, y esa dependencia
  // no existe en el negocio: el tribunal de un sábado es del día, no de la serie
  // A ni de la B. Y no alcanzaba con pedir la fecha para deducirla: una fecha
  // tiene 9,5 jornadas en promedio y hasta 19, así que elegir «la» jornada era
  // elegir una de diecinueve, casi siempre arbitrariamente.
  //
  // Con árbitros el costo se ESTIMA mirando los partidos, pero el número lo pone
  // el operador libre — `arancel × cantidad`, los dos a mano. Que haya pensado
  // en 12 partidos no tiene por qué quedar como vínculo de datos.
  //
  // `check_gasto_coherente` dejó de exigirla (20260822100000), y la exclusión de
  // doble conteo de `v_cashflow_estimado` pasó a cruzar por cat_gasto + fecha.
  // `gasto.jornada_id` sigue existiendo y aceptando valor: lo que cambió es que
  // esta pantalla no lo pide.
  //
  // `inversion` exige activo. El trigger es el que manda; acá
  // se muestra el campo que corresponde para no ofrecer un gasto imposible.
  const naturaleza = useMemo(
    () => categorias.find((c) => c.id === catGastoId)?.naturaleza ?? null,
    [categorias, catGastoId],
  )
  const pideActivo = naturaleza === 'inversion'

  function elegirCategoria(id: string) {
    setCatGastoId(id || null)
    // El concepto pertenece a una categoría: al cambiarla, se reinicia.
    setConceptoId(null)
    setUsarConceptoLibre(false)
    setConceptoLibre('')
    // Y el anclaje también: la categoría nueva puede pedir otro, o ninguno.
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
      p_activo_id: activoId ?? undefined,
      p_created_by: user.id,
      p_proveedor_id: proveedorId ?? undefined,
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
    setActivoId(null)
    setProveedorId(null)
  }

  return (
    <div className="pb-10">
      <Link href={volverA.href} className="text-[11px] font-semibold text-blue-d hover:underline">
        {volverA.label}
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">{titulo}</h1>
        <p className="mt-1 text-[12px] text-muted">
          {bajada ?? 'Se reconoce al cargar (devengo). El pago es un paso aparte.'}
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
                  {categoriasPorArea.map(([area, cats]) => (
                    <optgroup key={area} label={area}>
                      {cats.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.nombre}
                        </option>
                      ))}
                    </optgroup>
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

              {/* El proveedor se descubre acá: llegó la factura de alguien que
                  no está en la lista. Mandar a otra pantalla significaría
                  perder el formulario a medio llenar — y el resultado real fue
                  que nadie cargaba proveedor: 16 gastos, ninguno con uno. */}
              <SelectorProveedor
                proveedores={proveedores}
                valor={proveedorId ?? ''}
                onChange={(id) => setProveedorId(id || null)}
                puedeCrear
                hint="A quién se le compró. Si no está, se crea acá."
              />


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
              <Link href={volverA.href} className="font-bold underline">
                {volverA.label.replace('← ', '')}
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
