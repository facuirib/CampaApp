"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Badge, Button, Field, Input, Select } from '@/components/ui'
import { formatMoney } from '@/lib/format'
import type { Database } from '@/lib/db/database.types'

type Linea = Database['public']['Tables']['plan_tarifa_linea']['Row']
type Plan = Database['public']['Tables']['plan_tarifa']['Row']
type Uso = Database['public']['Views']['v_plan_tarifa_uso']['Row']
type Regla = Database['public']['Enums']['regla_vencimiento']

/**
 * Las cuatro formas de una línea, y qué campos pide cada una.
 *
 * Es la misma matriz que valida `validar_linea_tarifa` en la base, que a su vez
 * calca lo que `crear_equipo_torneo` exige. Acá está para MOSTRAR los campos
 * correctos, no para validar: la puerta sigue siendo la función. Si las dos se
 * desalinean, la base gana y el operador ve el mensaje de la función.
 */
const FORMAS: Record<string, { label: string; ref: boolean; rango: boolean; cantidad: boolean }> = {
  fecha_fija: { label: 'Fecha fija', ref: true, rango: false, cantidad: false },
  por_partido: { label: 'Por partido', ref: false, rango: true, cantidad: true },
  por_partido_playoff: { label: 'Por partido · playoffs', ref: false, rango: false, cantidad: true },
  bloque_adelantado: { label: 'Bloque adelantado', ref: true, rango: true, cantidad: true },
}

function formaDe(regla: string, esPlayoff: boolean): string {
  return regla === 'por_partido' && esPlayoff ? 'por_partido_playoff' : regla
}

export default function EditarPlan({
  planes,
  lineas,
  uso,
  torneoId,
}: {
  planes: Plan[]
  lineas: Linea[]
  uso: Uso[]
  torneoId: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Alta de línea: la regla se elige acá y no se cambia después.
  const [nuevaEn, setNuevaEn] = useState<string | null>(null)
  const [nForma, setNForma] = useState<string>('fecha_fija')
  const [nLabel, setNLabel] = useState('')
  const [nEfec, setNEfec] = useState(0)
  const [nTransf, setNTransf] = useState(0)
  const [nRef, setNRef] = useState('')
  const [nDesde, setNDesde] = useState<string>('')
  const [nHasta, setNHasta] = useState<string>('')
  const [nCant, setNCant] = useState<string>('')

  async function correr(clave: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setOcupado(clave)
    setError(null)
    const { error: err } = await fn()
    setOcupado(null)
    if (err) {
      setError(err.message)
      return false
    }
    router.refresh()
    return true
  }

  const sb = () => createClient()
  const usoDe = (planId: string) => uso.find((u) => u.plan_id === planId)

  if (!abierto) {
    return (
      <div className="mt-2 flex justify-end">
        <Button size="pill" variant="tertiary" icon="editar" onClick={() => setAbierto(true)}>
          Editar precios
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-md border border-line bg-white p-4">
      {error && (
        <p className="mb-3 rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">{error}</p>
      )}

      {planes.map((p) => {
        const u = usoDe(p.id)
        const suyas = lineas
          .filter((l) => l.plan_tarifa_id === p.id)
          .sort((a, b) => a.linea_orden - b.linea_orden)

        return (
          <div key={p.id} className="mb-5 last:mb-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[12px] font-bold text-ink">{p.opcion_nombre}</span>
              {!p.activo && <Badge estado="vencido">Desactivada</Badge>}
              <Button
                size="pill"
                variant="tertiary"
                loading={ocupado === `plan:${p.id}`}
                onClick={() =>
                  correr(`plan:${p.id}`, () =>
                    sb().rpc('editar_plan_tarifa', { p_plan_id: p.id, p_activo: !p.activo }),
                  )
                }
              >
                {p.activo ? 'Desactivar' : 'Reactivar'}
              </Button>
            </div>

            {/* ── El aviso ────────────────────────────────────────────────
                Solo cuando hay fichas: si el plan no se usó todavía, no hay
                nada que aclarar y el aviso sería ruido que enseña a ignorar
                los avisos. */}
            {u && (u.fichas ?? 0) > 0 && (
              <p className="mb-2 rounded-md bg-warnbg px-3 py-2 text-[11px] text-warntx">
                <strong>{u.fichas} ficha{u.fichas === 1 ? '' : 's'}</strong> ya usan esta opción
                {(u.cuotas_emitidas ?? 0) > 0 && (
                  <> y tienen {u.cuotas_emitidas} cuotas emitidas por {formatMoney(u.monto_emitido ?? 0)}</>
                )}
                . Editar los precios <strong>no cambia esas cuotas</strong> — solo las de fichas
                nuevas.
              </p>
            )}

            <table className="w-full text-[11px]">
              <tbody>
                {suyas.map((l) => {
                  const forma = FORMAS[formaDe(l.regla, l.es_playoff)]
                  return (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3 font-medium text-ink">
                        {l.concepto_label}
                        {l.es_playoff && (
                          <>
                            {' '}
                            <Badge estado="info">Playoff</Badge>
                          </>
                        )}
                        <span className="ml-2 text-muted">{forma?.label}</span>
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          type="number"
                          defaultValue={l.precio_efectivo ?? 0}
                          className="w-28"
                          onBlur={(e) => {
                            const v = Number(e.target.value)
                            if (v === Number(l.precio_efectivo)) return
                            correr(`l:${l.id}`, () =>
                              sb().rpc('editar_linea_tarifa', {
                                p_linea_id: l.id,
                                p_precio_efectivo: v,
                              }),
                            )
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          type="number"
                          defaultValue={l.precio_transferencia ?? 0}
                          className="w-28"
                          onBlur={(e) => {
                            const v = Number(e.target.value)
                            if (v === Number(l.precio_transferencia)) return
                            correr(`l:${l.id}`, () =>
                              sb().rpc('editar_linea_tarifa', {
                                p_linea_id: l.id,
                                p_precio_transferencia: v,
                              }),
                            )
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        {forma?.ref && (
                          <Input
                            type="date"
                            defaultValue={l.fecha_referencia ?? ''}
                            className="w-36"
                            onBlur={(e) => {
                              if (e.target.value === (l.fecha_referencia ?? '')) return
                              correr(`l:${l.id}`, () =>
                                sb().rpc('editar_linea_tarifa', {
                                  p_linea_id: l.id,
                                  p_fecha_referencia: e.target.value,
                                }),
                              )
                            }}
                          />
                        )}
                        {forma?.rango && (
                          <span className="ml-1 text-muted">
                            fechas {l.fecha_desde}–{l.fecha_hasta}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          className="text-muted hover:text-errtx"
                          title="Borrar línea"
                          onClick={() =>
                            correr(`del:${l.id}`, () =>
                              sb().rpc('borrar_linea_tarifa', { p_linea_id: l.id }),
                            )
                          }
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {nuevaEn === p.id ? (
              <div className="mt-3 grid grid-cols-6 gap-2 rounded-md bg-slate-50 p-3">
                <Field label="Concepto" className="col-span-2">
                  <Input value={nLabel} onChange={(e) => setNLabel(e.target.value)} placeholder="Cuota 3" />
                </Field>
                <Field label="Regla" className="col-span-2">
                  <Select value={nForma} onChange={(e) => setNForma(e.target.value)}>
                    {Object.entries(FORMAS).map(([k, f]) => (
                      <option key={k} value={k}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Efectivo">
                  <Input type="number" value={nEfec} onChange={(e) => setNEfec(Number(e.target.value))} />
                </Field>
                <Field label="Transferencia">
                  <Input type="number" value={nTransf} onChange={(e) => setNTransf(Number(e.target.value))} />
                </Field>
                {FORMAS[nForma].ref && (
                  <Field label="Vence" className="col-span-2">
                    <Input type="date" value={nRef} onChange={(e) => setNRef(e.target.value)} />
                  </Field>
                )}
                {FORMAS[nForma].rango && (
                  <>
                    <Field label="Desde (fecha)">
                      <Input type="number" value={nDesde} onChange={(e) => setNDesde(e.target.value)} />
                    </Field>
                    <Field label="Hasta (fecha)">
                      <Input type="number" value={nHasta} onChange={(e) => setNHasta(e.target.value)} />
                    </Field>
                  </>
                )}
                {FORMAS[nForma].cantidad && (
                  <Field label="Cantidad">
                    <Input type="number" value={nCant} onChange={(e) => setNCant(e.target.value)} />
                  </Field>
                )}
                <div className="col-span-6 flex justify-end gap-2">
                  <Button size="pill" variant="tertiary" onClick={() => setNuevaEn(null)}>
                    Cancelar
                  </Button>
                  <Button
                    size="pill"
                    loading={ocupado === `new:${p.id}`}
                    onClick={async () => {
                      const esPlayoff = nForma === 'por_partido_playoff'
                      const regla: Regla = esPlayoff ? 'por_partido' : (nForma as Regla)
                      const ok = await correr(`new:${p.id}`, () =>
                        sb().rpc('crear_linea_tarifa', {
                          p_plan_id: p.id,
                          p_concepto_label: nLabel,
                          p_precio_efectivo: nEfec,
                          p_precio_transferencia: nTransf,
                          p_regla: regla,
                          p_fecha_referencia: nRef || undefined,
                          p_fecha_desde: nDesde ? Number(nDesde) : undefined,
                          p_fecha_hasta: nHasta ? Number(nHasta) : undefined,
                          p_cantidad_esperada: nCant ? Number(nCant) : undefined,
                          p_es_playoff: esPlayoff,
                        }),
                      )
                      if (ok) {
                        setNuevaEn(null)
                        setNLabel('')
                        setNEfec(0)
                        setNTransf(0)
                        setNRef('')
                        setNDesde('')
                        setNHasta('')
                        setNCant('')
                      }
                    }}
                  >
                    Agregar línea
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="pill"
                variant="tertiary"
                icon="plus"
                onClick={() => setNuevaEn(p.id)}
              >
                Línea
              </Button>
            )}
          </div>
        )
      })}

      <div className="mt-3 flex justify-end border-t border-line pt-3">
        <Button size="pill" variant="tertiary" onClick={() => setAbierto(false)}>
          Cerrar edición
        </Button>
      </div>
    </div>
  )
}
