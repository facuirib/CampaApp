"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { Badge, Button, Card, Field, Input, KpiCard, Select } from '@/components/ui'

/**
 * El presupuesto: lo MUESTRA y lo edita.
 *
 * Escribe SIEMPRE por las funciones de PR1 —`agregar_linea_presupuesto`,
 * `editar_linea_presupuesto`, `borrar_linea_presupuesto`, `aprobar_presupuesto`,
 * `crear_presupuesto`— y nunca con un `insert`/`update` directo. Ellas validan,
 * traducen los `unique_violation` a mensajes que dicen qué hacer, y son la
 * misma puerta que usaría cualquier otro cliente.
 *
 * Mismo molde que `AccionesCheque` y `/activos/amortizar`: componente cliente
 * que llama `supabase.rpc(...)` y después `router.refresh()`, porque la página
 * de arriba es Server Component y si no seguiría mostrando los números viejos.
 *
 * ── Por qué el permiso baja como prop y no se resuelve no-renderizando ─────
 *
 * Porque este componente **es también la pantalla de lectura del presupuesto**:
 * las tarjetas por ámbito, las líneas y los totales salen de acá. No dibujarlo
 * para quien no puede editar le sacaría el presupuesto entero a `read-only`,
 * que tiene que poder verlo. Así que se dibuja igual y lo que desaparece son
 * las acciones: agregar, editar, borrar, aprobar y crear.
 */

export interface LineaPresupuesto {
  id: string
  cat_gasto_id: string
  categoria: string
  base: number
  cantidad: number
  /** La unidad EFECTIVA, ya resuelta por la vista (línea → concepto → categoría). */
  unidad: string | null
  /** Lo que guarda la fila. NULL significa «heredada», y se muestra distinto. */
  unidad_linea: string | null
  factor: number
  total: number
  /**
   * La aclaración en texto libre, o null.
   *
   * ACOMPAÑA a la categoría, no la reemplaza: una línea puede estar bien
   * clasificada y además necesitar decir «suponiendo dos predios» o «pendiente
   * de confirmar con el proveedor». Por eso no hay XOR con `concepto_id` como
   * sí lo hay en `gasto` — obligaría a elegir entre clasificar y explicar.
   */
  nota: string | null
}

export interface AmbitoPresupuesto {
  presupuesto_id: string
  ambito: string
  es_estructura: boolean
  estado: string
  anio: number
  lineas: number
  total: number
  lineas_sin_calendario: number
  detalle: LineaPresupuesto[]
}

interface Categoria {
  id: string
  nombre: string
  area: string
  unidad_default: string | null
}

export interface EditorPresupuestoProps {
  /**
   * Si el rol puede editar el presupuesto. Baja RESUELTO desde la Server Page
   * —`puede(rol, 'presupuesto.editar')`—: acá no se decide quién puede qué.
   *
   * Una sola operación para las cinco acciones (agregar, editar, borrar,
   * aprobar, crear), porque en la base también son una: las cinco funciones
   * escriben `presupuesto` o `presupuesto_linea` y las dos policies dicen
   * admin + operador.
   */
  puedeEditar: boolean
  secciones: AmbitoPresupuesto[]
  categorias: Categoria[]
  torneosSinPresupuesto: { id: string; nombre: string }[]
  faltaEstructura: boolean
  ejercicios: { id: string; anio: number }[]
  /**
   * Si el rol puede abrir un ejercicio. Es SOLO_ADMIN, más estricto que
   * `presupuesto.editar` —que es de finanzas—, así que baja aparte: abrir el
   * año no es presupuestar.
   */
  puedeAbrirEjercicio: boolean
}

const ROTULO_UNIDAD: Record<string, string> = {
  por_partido: 'partidos',
  por_dia_cancha: 'días de cancha',
  por_mes: 'meses',
  anual: 'año',
  unico: 'única vez',
}

function rotuloFactor(unidad: string | null, factor: number): string {
  if (!unidad) return `× ${factor}`
  if (unidad === 'anual' || unidad === 'unico') return ROTULO_UNIDAD[unidad]
  return `× ${factor} ${ROTULO_UNIDAD[unidad] ?? unidad}`
}

export default function EditorPresupuesto({
  puedeEditar,
  secciones,
  categorias,
  torneosSinPresupuesto,
  faltaEstructura,
  ejercicios,
  puedeAbrirEjercicio,
}: EditorPresupuestoProps) {
  const router = useRouter()

  const [editando, setEditando] = useState<string | null>(null)
  const [base, setBase] = useState(0)
  const [cantidad, setCantidad] = useState(1)
  const [nota, setNota] = useState('')

  const [agregandoEn, setAgregandoEn] = useState<string | null>(null)
  const [nuevaCat, setNuevaCat] = useState('')
  const [nuevaBase, setNuevaBase] = useState(0)
  const [nuevaCant, setNuevaCant] = useState(1)
  const [nuevaNota, setNuevaNota] = useState('')

  const [borrando, setBorrando] = useState<LineaPresupuesto | null>(null)
  const [borrandoDe, setBorrandoDe] = useState<AmbitoPresupuesto | null>(null)

  const [creando, setCreando] = useState(false)
  const [nuevoTorneo, setNuevoTorneo] = useState('')
  const [nuevoEjercicio, setNuevoEjercicio] = useState(ejercicios[0]?.id ?? '')

  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * El año que se está mirando.
   *
   * Un presupuesto pertenece a un **ejercicio**, y `ejercicio.anio` ES el año
   * calendario: no hace falta inventar una dimensión nueva para filtrar por
   * año, ya está en el modelo. `v_presupuesto_ambito` lo trae resuelto y baja
   * en `s.anio`.
   *
   * Arranca en «todos» y no en el año en curso, a propósito: el presupuesto se
   * arma con meses de anticipación —en octubre se presupuesta el año que
   * viene— y abrir escondiendo justo eso sería esconder el trabajo en curso.
   */
  const [anio, setAnio] = useState<number | 'todos'>('todos')
  const [abriendoAnio, setAbriendoAnio] = useState(false)

  // El único año que se puede abrir es el que sigue al último: la función exige
  // que sean consecutivos, así que ofrecer un campo libre sería ofrecer valores
  // que va a rechazar. Es un máximo sobre una lista de años, no un total de
  // plata.
  const ultimoAnio = ejercicios.length > 0 ? Math.max(...ejercicios.map((e) => e.anio)) : null
  const proximoAnio = ultimoAnio === null ? null : ultimoAnio + 1

  // Los años que REALMENTE tienen presupuesto, no los ejercicios que existen:
  // un ejercicio sin ninguna cabecera daría una opción que filtra a cero.
  const anios = [...new Set(secciones.map((s) => s.anio))].sort((a, b) => b - a)
  const visibles = anio === 'todos' ? secciones : secciones.filter((s) => s.anio === anio)

  async function llamar(fn: string, args: Record<string, unknown>, alTerminar?: () => void) {
    setOcupado(true)
    setError(null)
    // @ts-expect-error — el nombre de la función es dinámico y las 5 tienen firmas distintas
    const { error: err } = await createClient().rpc(fn, args)
    setOcupado(false)
    if (err) {
      setError(err.message)
      return
    }
    alTerminar?.()
    router.refresh()
  }

  const catsDisponibles = (s: AmbitoPresupuesto) =>
    categorias.filter((c) => !s.detalle.some((l) => l.cat_gasto_id === c.id))

  return (
    <>
      {error && (
        <p className="mb-4 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
          {error}
        </p>
      )}

      {secciones.length === 0 && (
        <div className="rounded-md border border-line bg-white px-4 py-12 text-center">
          <p className="text-[12px] font-semibold text-ink">Todavía no hay ningún presupuesto</p>
          <p className="mx-auto mt-2 max-w-[56ch] text-[11px] text-muted">
            Un presupuesto agrupa lo que se planea gastar en un ámbito: un torneo, o la estructura
            permanente que corre haya o no torneo. Nace en borrador y no proyecta hasta aprobarlo.
          </p>
        </div>
      )}

      {/* ── El año ─────────────────────────────────────────────────────────
          Sólo aparece cuando hay más de uno. Un filtro con una sola opción no
          filtra nada: es un control muerto que hace parecer que hay algo que
          elegir. */}
      {anios.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[.06em] text-muted">Año</span>
          {(['todos', ...anios] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAnio(a as number | 'todos')}
              className={
                'rounded-full border px-3 py-1 text-[11px] font-semibold transition ' +
                (anio === a
                  ? 'border-blue-d bg-blue-d text-white'
                  : 'border-line bg-white text-muted hover:text-ink')
              }
            >
              {a === 'todos' ? 'Todos' : a}
            </button>
          ))}
        </div>
      )}

      {/* ── Los KPIs ───────────────────────────────────────────────────────
          Viven acá y no en la Server Page porque tienen que seguir al filtro
          de año, que es estado de cliente. El número sigue saliendo de la
          vista —`s.total`, ya resuelto por v_presupuesto_ambito—: lo que se
          mudó es dónde se dibuja, no quién lo calcula.

          No hay un "total general": sumar los ámbitos sería el .reduce() que
          la regla 1 prohíbe, y además mezclaría un torneo con la estructura
          anual, que no se comparan. */}
      {visibles.length > 0 && (
        <div className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
          {visibles.map((s) => (
            <KpiCard
              key={s.presupuesto_id}
              tono={s.estado === 'aprobado' ? 'info' : 'neutro'}
              titulo={s.ambito}
              valor={s.total}
              icon={s.es_estructura ? 'banco' : 'proyeccion'}
              subtitulo={
                s.estado === 'aprobado'
                  ? `${s.lineas} ${s.lineas === 1 ? 'línea' : 'líneas'} · proyectando`
                  : `${s.lineas} ${s.lineas === 1 ? 'línea' : 'líneas'} · en borrador, no proyecta`
              }
            />
          ))}
        </div>
      )}

      {secciones.length > 0 && visibles.length === 0 && (
        <p className="mb-4 rounded-md border border-dashed border-line bg-panel px-4 py-6 text-center text-[11px] text-muted">
          No hay ningún presupuesto del {anio}. Los que hay están en otros años.
        </p>
      )}

      <div className="grid gap-4">
        {visibles.map((s) => {
          const aprobado = s.estado === 'aprobado'
          return (
            <Card
              key={s.presupuesto_id}
              title={s.ambito}
              icon={s.es_estructura ? 'banco' : 'proyeccion'}
              noPadding
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                {aprobado ? (
                  <Badge estado="ok">Aprobado</Badge>
                ) : (
                  <Badge estado="porVencer">Borrador</Badge>
                )}
                <span className="text-[11px] text-muted">
                  Ejercicio {s.anio} · {s.lineas} {s.lineas === 1 ? 'línea' : 'líneas'}
                </span>
                <span className="ml-auto cifra text-[13px] font-extrabold text-ink">
                  {formatMoney(s.total)}
                </span>
              </div>

              {/* Un borrador con líneas cargadas muestra total 0. Sin explicarlo
                  se lee como que las líneas no se guardaron. */}
              {!aprobado && s.lineas > 0 && (
                <p className="border-b border-line bg-panel px-4 py-2 text-[11px] text-muted">
                  Está en <strong className="font-semibold text-ink">borrador</strong>: las líneas
                  están guardadas pero el total todavía no proyecta. Se activa al aprobar.
                </p>
              )}

              {s.lineas_sin_calendario > 0 && (
                <p className="border-b border-line bg-warnbg px-4 py-2 text-[11px] text-warntx">
                  <strong className="font-bold">
                    {s.lineas_sin_calendario}{' '}
                    {s.lineas_sin_calendario === 1 ? 'línea aporta' : 'líneas aportan'} $0.
                  </strong>{' '}
                  Su unidad depende del calendario y este torneo todavía no tiene jornadas ni días
                  de cancha cargados, así que el factor es 0. Se corrige solo cuando se arme el
                  fixture.
                </p>
              )}

              {s.detalle.length === 0 ? (
                <p className="px-4 py-8 text-center text-[11px] text-muted">
                  Sin líneas todavía. Agregá la primera abajo.
                </p>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="bg-panel text-[9px] uppercase tracking-[.06em] text-muted">
                    <tr>
                      <th className="px-4 py-2 text-left font-bold">Categoría</th>
                      <th className="px-3 py-2 text-right font-bold">Base</th>
                      <th className="px-3 py-2 text-right font-bold">Cant.</th>
                      <th className="px-3 py-2 text-left font-bold">Factor</th>
                      <th className="px-4 py-2 text-right font-bold">Total</th>
                      <th className="px-4 py-2" style={{ width: 130 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {s.detalle.map((l) => {
                      const enEdicion = editando === l.id
                      return (
                        <tr key={l.id} className="border-t border-line2">
                          {/* La nota vive DEBAJO de la categoría y no en una
                              columna propia: es una aclaración de esta línea,
                              no un dato más que se compare entre filas. Una
                              séptima columna además dejaría la tabla sin aire
                              justo donde están los números. */}
                          <td className="px-4 py-2.5 font-semibold text-ink">
                            {l.categoria}
                            {l.unidad_linea === null && (
                              <span className="ml-1.5 text-[9px] uppercase tracking-wide text-muted">
                                unidad heredada
                              </span>
                            )}
                            {enEdicion ? (
                              <Input
                                className="mt-1.5"
                                value={nota}
                                placeholder="Aclaración (opcional)"
                                onChange={(e) => setNota(e.target.value)}
                              />
                            ) : (
                              l.nota && (
                                <p className="mt-0.5 text-[10.5px] font-normal leading-snug text-muted">
                                  {l.nota}
                                </p>
                              )
                            )}
                          </td>

                          {enEdicion ? (
                            <>
                              <td className="px-3 py-1.5" style={{ width: 130 }}>
                                <Input
                                  type="number"
                                  value={base}
                                  onChange={(e) => setBase(Number(e.target.value))}
                                />
                              </td>
                              <td className="px-3 py-1.5" style={{ width: 90 }}>
                                <Input
                                  type="number"
                                  value={cantidad}
                                  onChange={(e) => setCantidad(Number(e.target.value))}
                                />
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="cifra px-3 py-2.5 text-right text-ink">
                                {formatMoney(l.base)}
                              </td>
                              <td className="cifra px-3 py-2.5 text-right text-muted">
                                {l.cantidad}
                              </td>
                            </>
                          )}

                          {/* El factor NO es input: sale del calendario. */}
                          <td className="px-3 py-2.5 text-[11px] text-muted">
                            {l.factor === 0 ? (
                              <span className="text-warntx">sin calendario cargado</span>
                            ) : (
                              rotuloFactor(l.unidad, l.factor)
                            )}
                          </td>

                          <td className="cifra px-4 py-2.5 text-right font-bold text-ink">
                            {formatMoney(l.total)}
                          </td>

                          <td className="px-4 py-1.5 text-right">
                            {enEdicion ? (
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="pill"
                                  loading={ocupado}
                                  disabled={ocupado}
                                  onClick={() =>
                                    llamar(
                                      'editar_linea_presupuesto',
                                      {
                                        p_linea_id: l.id,
                                        p_base: base,
                                        p_cantidad: cantidad,
                                        // Se manda SIEMPRE, incluso vacía: la
                                        // función distingue cadena vacía —borrar
                                        // la nota— de null —no tocarla—, y si el
                                        // campo se vaciara a propósito y no se
                                        // mandara, la nota vieja quedaría.
                                        p_concepto_libre: nota,
                                      },
                                      () => setEditando(null),
                                    )
                                  }
                                >
                                  Guardar
                                </Button>
                                <Button
                                  size="pill"
                                  variant="tertiary"
                                  disabled={ocupado}
                                  onClick={() => setEditando(null)}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            ) : !puedeEditar ? null : (
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="pill"
                                  variant="secondary"
                                  onClick={() => {
                                    setEditando(l.id)
                                    setBase(l.base)
                                    setCantidad(l.cantidad)
                                    setNota(l.nota ?? '')
                                  }}
                                >
                                  Editar
                                </Button>
                                <Button
                                  size="pill"
                                  variant="tertiary"
                                  onClick={() => {
                                    setBorrando(l)
                                    setBorrandoDe(s)
                                  }}
                                >
                                  Borrar
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              {/* ── Agregar línea ─────────────────────────────────────────── */}
              <div className="border-t border-line px-4 py-3">
                {agregandoEn === s.presupuesto_id ? (
                  <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
                    <Field label="Categoría" required>
                      <Select
                        placeholder="Elegir…"
                        value={nuevaCat}
                        onChange={(e) => setNuevaCat(e.target.value)}
                      >
                        {catsDisponibles(s).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} · {c.area}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Base" required>
                      <Input
                        type="number"
                        value={nuevaBase}
                        onChange={(e) => setNuevaBase(Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Cantidad" required>
                      <Input
                        type="number"
                        value={nuevaCant}
                        onChange={(e) => setNuevaCant(Number(e.target.value))}
                      />
                    </Field>
                    <Field
                      label="Aclaración"
                      // Span 3 y no 4: así cae en la segunda fila ocupando el
                      // ancho de los tres controles, y los botones quedan a su
                      // derecha en la columna `auto` en vez de solos abajo.
                      className="sm:col-span-3"
                      hint="Opcional. Por qué se presupuestó así — «suponiendo dos predios», «a confirmar con el proveedor»."
                    >
                      <Input
                        value={nuevaNota}
                        onChange={(e) => setNuevaNota(e.target.value)}
                      />
                    </Field>
                    <div className="flex gap-2 pb-1">
                      <Button
                        loading={ocupado}
                        disabled={ocupado || !nuevaCat || nuevaBase <= 0}
                        onClick={() =>
                          llamar(
                            'agregar_linea_presupuesto',
                            {
                              p_presupuesto_id: s.presupuesto_id,
                              p_cat_gasto_id: nuevaCat,
                              p_base: nuevaBase,
                              p_cantidad: nuevaCant,
                              p_concepto_libre: nuevaNota,
                            },
                            () => {
                              setAgregandoEn(null)
                              setNuevaCat('')
                              setNuevaBase(0)
                              setNuevaCant(1)
                              setNuevaNota('')
                            },
                          )
                        }
                      >
                        Agregar
                      </Button>
                      <Button variant="tertiary" onClick={() => setAgregandoEn(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : !puedeEditar ? null : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="secondary"
                      icon="plus"
                      onClick={() => setAgregandoEn(s.presupuesto_id)}
                    >
                      Agregar línea
                    </Button>

                    {!aprobado && (
                      <Button
                        icon="check"
                        loading={ocupado}
                        disabled={ocupado || s.lineas === 0}
                        onClick={() =>
                          llamar('aprobar_presupuesto', { p_presupuesto_id: s.presupuesto_id })
                        }
                      >
                        Aprobar
                      </Button>
                    )}

                    <span className="text-[10.5px] text-muted">
                      {aprobado
                        ? 'Aprobado: se puede seguir editando, y cada cambio mueve la proyección.'
                        : s.lineas === 0
                          ? 'Necesita al menos una línea para poder aprobarse.'
                          : 'Al aprobar, este presupuesto empieza a proyectar en Proyección.'}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* ── Crear presupuesto ──────────────────────────────────────────────── */}
      {(torneosSinPresupuesto.length > 0 || faltaEstructura) && (
        <div className="mt-4 rounded-md border border-dashed border-line bg-panel px-4 py-4">
          {creando ? (
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
              <Field label="Ámbito" required>
                <Select
                  placeholder="Elegir…"
                  value={nuevoTorneo}
                  onChange={(e) => setNuevoTorneo(e.target.value)}
                >
                  {faltaEstructura && <option value="estructura">Estructura permanente</option>}
                  {torneosSinPresupuesto.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ejercicio" required>
                <Select value={nuevoEjercicio} onChange={(e) => setNuevoEjercicio(e.target.value)}>
                  {ejercicios.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.anio}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex gap-2 pb-1">
                <Button
                  loading={ocupado}
                  disabled={ocupado || !nuevoTorneo || !nuevoEjercicio}
                  onClick={() =>
                    llamar(
                      'crear_presupuesto',
                      {
                        p_ejercicio_id: nuevoEjercicio,
                        p_torneo_id: nuevoTorneo === 'estructura' ? null : nuevoTorneo,
                      },
                      () => {
                        setCreando(false)
                        setNuevoTorneo('')
                      },
                    )
                  }
                >
                  Crear
                </Button>
                <Button variant="tertiary" onClick={() => setCreando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : !puedeEditar ? null : (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" icon="plus" onClick={() => setCreando(true)}>
                Crear presupuesto
              </Button>
              <span className="text-[10.5px] text-muted">
                Nace en <strong className="font-semibold">borrador</strong>: se arma tranquilo y no
                mueve la caja hasta aprobarlo. Una cabecera por torneo y ejercicio.
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── El año contable ────────────────────────────────────────────────
          Vive acá y no en Configuración porque es acá donde se choca con el
          problema: se va a crear el presupuesto del año que viene y el año no
          está en el desplegable. Y va SUELTO, fuera del panel de «crear
          presupuesto», porque ese panel desaparece cuando todos los ámbitos ya
          tienen el suyo — justo el momento en que abrir el año siguiente es lo
          único que queda por hacer. */}
      {puedeAbrirEjercicio && proximoAnio !== null && (
        <div className="mt-4 rounded-md border border-line bg-white px-4 py-4">
          <h2 className="text-[13px] font-extrabold tracking-[-.2px] text-ink">El año contable</h2>

          {abriendoAnio ? (
            <>
              <div className="mt-2 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
                <p className="font-bold">Abrir el ejercicio {proximoAnio} no se deshace.</p>
                <p className="mt-1">
                  No hay forma de borrar un ejercicio, así que si el año está mal queda cargado. Va
                  del 1 de enero al 31 de diciembre de {proximoAnio}, y nace{' '}
                  <strong className="font-semibold">abierto</strong>: desde ese momento se pueden
                  registrar movimientos con fecha de {proximoAnio}.
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  icon="check"
                  loading={ocupado}
                  disabled={ocupado}
                  onClick={() =>
                    llamar('crear_ejercicio', { p_anio: proximoAnio }, () =>
                      setAbriendoAnio(false),
                    )
                  }
                >
                  Abrir el ejercicio {proximoAnio}
                </Button>
                <Button variant="tertiary" disabled={ocupado} onClick={() => setAbriendoAnio(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 max-w-[80ch] text-[11px] leading-snug text-muted">
                El último abierto es el <strong className="font-semibold text-ink">{ultimoAnio}</strong>.
                Un presupuesto pertenece a un ejercicio, así que para presupuestar {proximoAnio} hay
                que abrirlo antes.{' '}
                <strong className="font-semibold text-ink">
                  Y no es sólo el presupuesto: mientras el {proximoAnio} no exista, ningún
                  movimiento con fecha de ese año se puede registrar
                </strong>{' '}
                — ni un cobro ni un gasto. Conviene abrirlo antes de fin de año, no el 2 de enero.
              </p>
              <div className="mt-3">
                <Button variant="secondary" icon="plus" onClick={() => setAbriendoAnio(true)}>
                  Abrir el ejercicio {proximoAnio}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Confirmación de borrado ────────────────────────────────────────
          La fricción es proporcional al efecto: en borrador la línea no dejó
          huella y se borra sin preguntar; en un aprobado saca plata de la
          proyección, y eso se avisa — mismo criterio que el rechazo de cheques. */}
      {borrando && borrandoDe && (
        <Card
          title={borrandoDe.estado === 'aprobado' ? 'Borrar una línea que está proyectando' : 'Borrar la línea'}
          icon={borrandoDe.estado === 'aprobado' ? 'alerta' : 'borrar'}
          className="mt-4"
        >
          <p className="text-[11.5px] text-ink">
            <strong className="font-bold">{borrando.categoria}</strong> ·{' '}
            <span className="cifra">{formatMoney(borrando.total)}</span>
          </p>

          {borrandoDe.estado === 'aprobado' ? (
            <div className="mt-3 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
              <p className="font-bold">Esto saca plata de la proyección.</p>
              <p className="mt-1">
                Este presupuesto está <strong className="font-semibold">aprobado</strong>, así que
                esta línea se está proyectando hoy en{' '}
                <strong className="font-semibold">Proyección</strong>. Al borrarla, esos{' '}
                <span className="cifra font-bold">{formatMoney(borrando.total)}</span> desaparecen
                de los egresos estimados y el saldo proyectado sube — sin que nada más lo avise.
              </p>
              <p className="mt-1.5">
                Si es un error de carga, <strong className="font-semibold">editala</strong> en vez
                de borrarla: queda el rastro del número corregido.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-muted">
              El presupuesto está en borrador, así que esta línea todavía no proyecta nada. Se borra
              sin consecuencias.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button
              variant={borrandoDe.estado === 'aprobado' ? 'secondary' : 'primary'}
              icon="borrar"
              loading={ocupado}
              disabled={ocupado}
              onClick={() =>
                llamar('borrar_linea_presupuesto', { p_linea_id: borrando.id }, () => {
                  setBorrando(null)
                  setBorrandoDe(null)
                })
              }
            >
              Borrar la línea
            </Button>
            <Button
              variant="tertiary"
              disabled={ocupado}
              onClick={() => {
                setBorrando(null)
                setBorrandoDe(null)
              }}
            >
              Cancelar
            </Button>
          </div>
        </Card>
      )}
    </>
  )
}
