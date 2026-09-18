"use client"

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate, formatMoney } from '@/lib/format'
import { Badge, Button, Field, Icon, Input, Select, type EstadoBadge } from '@/components/ui'
import type { TorneoOpcion } from './GastosPlanificados'

export interface ProximaCuota {
  compromiso_id: string
  vence_at: string
  monto: number
}

export interface CuotaDetalle {
  /** No viene de ninguna columna — `compromiso` no tiene "número de cuota",
   *  sólo la fecha. Se deriva en page.tsx por orden de vence_at, que es
   *  fiable porque generar_cuotas_plan las crea siempre en ese orden. */
  numero: number
  vence_at: string
  monto: number
  /** 'pendiente' | 'cumplido' — el estado de `compromiso`, no el del plan. */
  estado: string
}

export interface PlanPagoFila {
  id: string
  nombre: string
  organismo: string | null
  categoria: string
  torneo: string | null
  cuotas_total: number
  monto_cuota: number
  /** No se lee de v_algo: se cuenta sobre los compromisos ya traídos en
   *  page.tsx. Ver la nota grande más abajo, antes de crear. */
  cuotas_cumplidas: number
  estado: string
  proxima_cuota: ProximaCuota | null
  /** Todas las cuotas del plan, para el detalle desplegable — no sólo la
   *  próxima. Mismo origen que cuotas_cumplidas/proxima_cuota: los
   *  compromiso ya traídos en page.tsx, ordenados por vence_at. */
  cuotas: CuotaDetalle[]
  /** Si el monto de las cuotas puede ajustar mes a mes. Sin esto en `true`,
   *  devengar_cuota_plan rechaza cualquier monto distinto del pactado — así
   *  que también decide si esta pantalla ofrece editarlo al devengar. */
  indexado: boolean
}

export interface CategoriaPlanOpcion {
  id: string
  nombre: string
  naturaleza: string
}

/**
 * Planes de pago: gasto en cuotas, con total y cantidad conocidos de
 * antemano — moratoria, financiación, un arreglo pactado en pagos.
 *
 * Dos actos separados, igual que en la base (docs/arquitectura.md §3.14):
 *
 * **Alta** (`crear_plan_pago`) genera las N cuotas de una, como `compromiso`
 * — entran a v_cashflow_comprometido / a esta pantalla desde hoy — pero
 * ningún `gasto` todavía.
 *
 * **Devengo** (`devengar_cuota_plan`) es mensual y manual: el botón "Devengar
 * esta cuota" carga el gasto real de la próxima cuota pendiente. No hay cron
 * — nadie descubre solo que llegó el mes (mismo principio que
 * devengar_sueldos_socios).
 *
 * ── Nota sobre `cuotas_cumplidas` y `proxima_cuota` ──────────────────────
 *
 * Estos dos números NO salen de una vista — se calculan en `page.tsx` sobre
 * los `compromiso` de cada plan, ya traídos. Es una excepción a la regla 1
 * ("todo número visible sale de una vista SQL"), hecha a propósito para esta
 * primera versión: no es una suma de plata que pueda desalinearse — es un
 * conteo de filas y encontrar la de fecha más próxima entre las ya
 * pendientes. Si esta pantalla crece (filtros, orden, más data derivada),
 * el camino correcto es una `v_plan_pago_detalle` que haga exactamente esto
 * en SQL — queda anotado, no resuelto.
 */
export default function PlanesPago({
  planes,
  categorias,
  torneos,
}: {
  planes: PlanPagoFila[]
  categorias: CategoriaPlanOpcion[]
  torneos: TorneoOpcion[]
}) {
  const router = useRouter()

  // El default: "Planes de Pago" existe en el catálogo real (administración,
  // recurrente) y es literalmente la categoría pensada para esto — moratorias
  // y financiaciones son estructura permanente, sin torneo. Si no está en el
  // catálogo (otra base, la desactivaron), el select arranca vacío y nada más.
  const catPlanesDePago = categorias.find(
    (c) => c.nombre === 'Planes de Pago' && c.naturaleza === 'recurrente',
  )?.id

  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [organismo, setOrganismo] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [cuotasTotal, setCuotasTotal] = useState(0)
  const [montoCuota, setMontoCuota] = useState(0)
  const [diaVencimiento, setDiaVencimiento] = useState(15)
  const [cat, setCat] = useState(catPlanesDePago ?? '')
  const [torneo, setTorneo] = useState('')
  const [indexado, setIndexado] = useState(false)
  const [devengando, setDevengando] = useState<string | null>(null)
  // El monto editado por fila, mientras se lo toca. Clave = compromiso_id de
  // la próxima cuota, así que dos planes indexados con acción pendiente no
  // se pisan entre sí. Arranca vacío: hasta que alguien lo toque, el valor
  // que se ve y el que se manda es el proyectado (proxima_cuota.monto).
  const [montosEditados, setMontosEditados] = useState<Record<string, number>>({})
  // Qué planes tienen el detalle de cuotas desplegado. Por id de plan, no
  // hay uno "activo" a la vez — varios pueden estar abiertos juntos.
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleExpandido(planId: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(planId)) next.delete(planId)
      else next.add(planId)
      return next
    })
  }

  // Qué naturaleza acepta crear_plan_pago según haya torneo o no —
  // trg_gasto_coherente decide, la función lo valida, esto sólo evita
  // ofrecer una combinación que la base va a rechazar. Ver
  // docs/arquitectura.md §3.14.
  const naturalezaRequerida = torneo ? 'eventual' : 'recurrente'
  const categoriasCompatibles = categorias.filter((c) => c.naturaleza === naturalezaRequerida)

  function cambiarTorneo(nuevoTorneo: string) {
    setTorneo(nuevoTorneo)
    // La categoría elegida puede dejar de ser válida al cambiar de lado
    // (recurrente ↔ eventual). Se limpia en vez de arrastrar una selección
    // que ya no aparece en la lista.
    const naturalezaNueva = nuevoTorneo ? 'eventual' : 'recurrente'
    const sigueValida = categorias.some((c) => c.id === cat && c.naturaleza === naturalezaNueva)
    if (!sigueValida) setCat('')
  }

  function limpiarForm() {
    setCreando(false)
    setNombre('')
    setOrganismo('')
    setFechaInicio('')
    setCuotasTotal(0)
    setMontoCuota(0)
    setDiaVencimiento(15)
    setCat(catPlanesDePago ?? '')
    setTorneo('')
    setIndexado(false)
  }

  async function crear() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('crear_plan_pago', {
      p_nombre: nombre.trim(),
      // '' y no null: crear_plan_pago hace `nullif(trim(coalesce(...)), '')`
      // adentro, así que una cadena vacía ya se normaliza a NULL en la base
      // — no hace falta forzar el tipo acá para mandar null.
      p_organismo: organismo.trim(),
      p_fecha_inicio: fechaInicio,
      p_cuotas_total: cuotasTotal,
      p_monto_cuota: montoCuota,
      p_cat_gasto_id: cat,
      p_dia_vencimiento: diaVencimiento,
      p_indexado: indexado,
      ...(torneo ? { p_torneo_id: torneo } : {}),
    })
    setOcupado(false)
    if (err) return setError(err.message)
    limpiarForm()
    router.refresh()
  }

  async function devengar(compromisoId: string, montoReal?: number) {
    setOcupado(true)
    setDevengando(compromisoId)
    setError(null)

    const supabase = createClient()
    // El responsable sale de la sesión, no de un default: devengar_cuota_plan
    // exige p_created_by resoluble y no acepta null (mismo criterio que
    // registrar_cobro en /equipos/[id]/cobrar).
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setOcupado(false)
      setDevengando(null)
      setError('Sesión vencida. Volvé a entrar para devengar la cuota.')
      return
    }

    const { error: err } = await supabase.rpc('devengar_cuota_plan', {
      p_compromiso_id: compromisoId,
      p_created_by: user.id,
      // Sólo se manda si el plan es indexado y hay un valor tocado — un plan
      // fijo nunca pasa por acá con esta clave, así que devengar_cuota_plan
      // ni se entera de que existió la posibilidad de mandarlo.
      ...(montoReal !== undefined ? { p_monto_real: montoReal } : {}),
    })

    setOcupado(false)
    setDevengando(null)
    if (err) return setError(err.message)
    // El editado de ESTA fila ya cumplió su función — la próxima vez que el
    // plan tenga una cuota pendiente va a ser OTRO compromiso_id, con su
    // propio proyectado.
    setMontosEditados((m) => {
      const copia = { ...m }
      delete copia[compromisoId]
      return copia
    })
    router.refresh()
  }

  const puedeCrear =
    !ocupado &&
    nombre.trim().length > 0 &&
    !!fechaInicio &&
    cuotasTotal > 0 &&
    montoCuota > 0 &&
    !!cat &&
    diaVencimiento >= 1 &&
    diaVencimiento <= 28

  return (
    <section className="mt-8 border-t border-line pt-6">
      <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
        Planes de pago
      </h2>
      <p className="mb-3 max-w-[82ch] text-[11px] leading-snug text-muted">
        Gasto en cuotas con total y cantidad conocidos de antemano —una moratoria, una
        financiación—. Al dar de alta el plan, <strong className="font-semibold text-ink">
        las cuotas enteras entran al cashflow</strong> como comprometido. El gasto real de
        cada una recién se carga al devengarla, un mes a la vez — no hay generación
        automática: alguien aprieta{' '}
        <strong className="font-semibold text-ink">«Devengar esta cuota»</strong> cuando
        corresponde procesar ese mes. En un plan{' '}
        <strong className="font-semibold text-ink">indexado</strong>, el monto de esa cuota
        se puede corregir al devengarla — la corrección queda como referencia en las cuotas
        pendientes que vencen después, no en las que ya se devengaron.
      </p>

      {error && (
        <p className="mb-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
          {error}
        </p>
      )}

      {planes.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-panel text-[9px] uppercase tracking-[.06em] text-muted">
              <tr>
                <th className="px-3 py-2" />
                <th className="px-4 py-2 text-left font-bold">Plan</th>
                <th className="px-3 py-2 text-left font-bold">Categoría</th>
                <th className="px-3 py-2 text-right font-bold">Cuotas</th>
                <th className="px-3 py-2 text-right font-bold">Por cuota</th>
                <th className="px-3 py-2 text-left font-bold">Estado</th>
                <th className="px-3 py-2 text-left font-bold">Próxima cuota</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {planes.map((p) => {
                const { estado, label } = estadoVisual(p)
                const abierto = expandidos.has(p.id)
                return (
                  <Fragment key={p.id}>
                    <tr className={`border-t border-line2 ${!p.proxima_cuota ? 'opacity-60' : ''}`}>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleExpandido(p.id)}
                          aria-expanded={abierto}
                          aria-label={abierto ? 'Ocultar cuotas' : 'Ver todas las cuotas'}
                          className="rounded-sm p-1 text-muted hover:bg-row-hover hover:text-ink"
                        >
                          <Icon
                            name="chevronDerecha"
                            size={11}
                            className={`transition-transform ${abierto ? 'rotate-90' : ''}`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-ink">
                        {p.nombre}
                        {p.organismo && (
                          <span className="ml-1.5 text-[10.5px] font-normal text-muted">
                            · {p.organismo}
                          </span>
                        )}
                        {p.torneo && (
                          <span className="ml-1.5 text-[10.5px] font-normal text-muted">
                            · {p.torneo}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted">{p.categoria}</td>
                      <td className="cifra px-3 py-2.5 text-right font-bold text-ink">
                        {p.cuotas_cumplidas} / {p.cuotas_total}
                      </td>
                      <td className="cifra px-3 py-2.5 text-right text-muted">
                        {formatMoney(p.monto_cuota)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge estado={estado}>{label}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {p.proxima_cuota ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted">
                              {formatDate(p.proxima_cuota.vence_at)}
                            </span>
                            <span className="cifra font-bold text-ink">
                              {formatMoney(p.proxima_cuota.monto)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5">
                        {p.proxima_cuota && (
                          <div className="flex items-start justify-end gap-1.5">
                            {/* Editable sólo en planes indexados — en uno fijo,
                                devengar_cuota_plan rechaza cualquier monto
                                distinto del pactado, así que ofrecer el campo
                                acá sería prometer algo que la base no cumple. */}
                            {p.indexado && (
                              <Field
                                label="Monto real de esta cuota"
                                hint="Se propaga a las cuotas pendientes futuras."
                                className="w-40"
                              >
                                <Input
                                  type="number"
                                  disabled={ocupado}
                                  value={montosEditados[p.proxima_cuota.compromiso_id] ?? p.proxima_cuota.monto}
                                  onChange={(e) => {
                                    const id = p.proxima_cuota!.compromiso_id
                                    const v = Number(e.target.value)
                                    setMontosEditados((m) => ({ ...m, [id]: v }))
                                  }}
                                />
                              </Field>
                            )}
                            {/* `items-start` en vez de `items-end`: con el hint
                                visible, el hermano más alto es el Field entero
                                (label + input + hint), así que `items-end`
                                cuelga el botón del borde del HINT, no del
                                input. Este `mt` compensa el bloque fijo del
                                label de Field (h-4 + mb-1.5 = 22px) para que
                                el botón quede a la altura del input mismo,
                                haya o no haya hint — y en un plan sin indexar
                                (sin Field al lado) el margen no se aplica. */}
                            <div className={p.indexado ? 'mt-[22px]' : undefined}>
                              <Button
                                size="pill"
                                variant="secondary"
                                disabled={ocupado}
                                loading={ocupado && devengando === p.proxima_cuota.compromiso_id}
                                onClick={() =>
                                  devengar(
                                    p.proxima_cuota!.compromiso_id,
                                    p.indexado
                                      ? (montosEditados[p.proxima_cuota!.compromiso_id] ?? p.proxima_cuota!.monto)
                                      : undefined,
                                  )
                                }
                              >
                                Devengar esta cuota
                              </Button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="border-t border-line2 bg-panel">
                        <td colSpan={8} className="px-4 py-3">
                          {/* Sin `w-full`: con colSpan={8} el contenedor es
                              tan ancho como la tabla de afuera, y una tabla
                              interna forzada a llenarlo reparte el sobrante
                              entre las columnas — eso era lo desparramado.
                              Sin esa clase, se achica al contenido. */}
                          <table className="text-[11px]">
                            <thead className="text-[8.5px] uppercase tracking-[.06em] text-muted">
                              <tr>
                                <th className="px-2 pb-1.5 text-left font-bold">Cuota</th>
                                <th className="px-2 pb-1.5 text-left font-bold">Vence</th>
                                <th className="px-2 pb-1.5 text-right font-bold">Monto</th>
                                <th className="px-2 pb-1.5 text-left font-bold">Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.cuotas.map((c) => {
                                const cuotaEstado = cuotaEstadoVisual(c.estado)
                                return (
                                  <tr key={c.numero} className="border-t border-line2/60">
                                    <td className="px-2 py-1.5 text-muted">
                                      {c.numero} / {p.cuotas_total}
                                    </td>
                                    <td className="px-2 py-1.5 text-muted">{formatDate(c.vence_at)}</td>
                                    <td className="cifra px-2 py-1.5 text-right text-ink">
                                      {formatMoney(c.monto)}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <Badge estado={cuotaEstado.estado}>{cuotaEstado.label}</Badge>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {creando ? (
        <div className="mt-3 rounded-md border border-line bg-white p-4">
          <h3 className="mb-3 text-[12.5px] font-extrabold text-ink">Nuevo plan de pago</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Nombre" required className="lg:col-span-2">
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Moratoria ARCA"
              />
            </Field>
            <Field label="Organismo" hint="Opcional: a quién se le paga.">
              <Input value={organismo} onChange={(e) => setOrganismo(e.target.value)} placeholder="ARCA" />
            </Field>
            <Field
              label="Categoría"
              required
              hint={
                torneo
                  ? 'Con torneo: solo categorías eventuales.'
                  : 'Sin torneo: solo categorías de estructura (recurrentes).'
              }
            >
              <Select placeholder="Elegir…" value={cat} onChange={(e) => setCat(e.target.value)}>
                {categoriasCompatibles.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </Select>
            </Field>

            <Field label="Torneo" hint="Vacío = estructura, como en Gastos planificados.">
              <Select value={torneo} onChange={(e) => cambiarTorneo(e.target.value)}>
                <option value="">Estructura</option>
                {torneos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="Fecha de inicio"
              required
              hint="El mes de la primera cuota — el día lo define 'Día de vencimiento'."
            >
              <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </Field>
            <Field label="Cantidad de cuotas" required>
              <Input
                type="number"
                min={1}
                value={cuotasTotal || ''}
                onChange={(e) => setCuotasTotal(Number(e.target.value))}
              />
            </Field>
            <Field label="Monto por cuota" required>
              <Input
                type="number"
                value={montoCuota || ''}
                onChange={(e) => setMontoCuota(Number(e.target.value))}
              />
            </Field>
            <Field label="Día de vencimiento" required hint="Entre 1 y 28.">
              <Input
                type="number"
                min={1}
                max={28}
                value={diaVencimiento || ''}
                onChange={(e) => setDiaVencimiento(Number(e.target.value))}
              />
            </Field>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-ink">
            <input
              type="checkbox"
              checked={indexado}
              onChange={(e) => setIndexado(e.target.checked)}
              className="size-3.5 accent-blue"
            />
            Este plan se indexa (el monto puede cambiar mes a mes)
          </label>

          <div className="mt-4 flex gap-2">
            <Button icon="check" loading={ocupado} disabled={!puedeCrear} onClick={crear}>
              Crear plan
            </Button>
            <Button variant="tertiary" disabled={ocupado} onClick={limpiarForm}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button variant="secondary" icon="plus" onClick={() => setCreando(true)}>
            Nuevo plan de pago
          </Button>
        </div>
      )}
    </section>
  )
}

/**
 * `plan_pago.estado`, tal cual — ya no hace falta compararlo contra
 * cuotas_cumplidas/cuotas_total acá. `devengar_cuota_plan` lo pasa a
 * 'finalizado' solo cuando se devenga la última cuota pendiente del plan
 * (mismo commit que reflotó plan_pago/compromiso, migración
 * 20260917110000): la columna ya dice la verdad, este mapeo sólo la traduce
 * a color y texto — mismo criterio que el resto de los Badge del proyecto.
 */
function estadoVisual(p: PlanPagoFila): { estado: EstadoBadge; label: string } {
  if (p.estado === 'caido') return { estado: 'mora', label: 'Caído' }
  if (p.estado === 'finalizado') return { estado: 'ok', label: 'Completo' }
  return { estado: 'info', label: 'Vigente' }
}

/**
 * El estado de UNA cuota (`compromiso.estado`), no el del plan —
 * 'pendiente' | 'cumplido'. Mismo par que ya usa GastosPlanificados.tsx para
 * su propio 'pendiente'/'ejecutado': ámbar mientras falta, verde una vez
 * devengada.
 */
function cuotaEstadoVisual(estado: string): { estado: EstadoBadge; label: string } {
  if (estado === 'cumplido') return { estado: 'ok', label: 'Cumplida' }
  return { estado: 'porVencer', label: 'Pendiente' }
}
