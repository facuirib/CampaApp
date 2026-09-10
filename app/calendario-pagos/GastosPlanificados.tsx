"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate, formatMoney } from '@/lib/format'
import { Badge, Button, Field, Input, Select } from '@/components/ui'

export interface PlanificadoFila {
  id: string
  descripcion: string
  monto: number
  fecha_esperada: string | null
  estado: string
  categoria: string
  cat_gasto_id: string
  torneo: string | null
}

export interface CategoriaOpcion {
  id: string
  nombre: string
}

export interface TorneoOpcion {
  id: string
  nombre: string
}

export interface GastoRealOpcion {
  id: string
  etiqueta: string
  cat_gasto_id: string
}

/**
 * Los gastos planificados: la rama manual del estimado.
 *
 * Un gasto planificado es plata que se SABE que va a salir pero todavía no se
 * cargó como gasto —el service del grupo electrógeno de noviembre—. Mientras
 * está pendiente, `v_cashflow_gastos_estimado_extra` lo proyecta en la curva
 * de /proyeccion; cuando el gasto real se carga, se marca ejecutado ACÁ y el
 * planificado deja de proyectar — sin la marca, la proyección lo contaría dos
 * veces: una como plan y otra como gasto real.
 *
 * `cancelado` existe en el modelo pero no tiene puerta todavía: un plan que no
 * va a pasar hoy no se puede cancelar desde la app. Está anotado en el mapa.
 */
export default function GastosPlanificados({
  planificados,
  categorias,
  torneos,
  gastosReales,
}: {
  planificados: PlanificadoFila[]
  categorias: CategoriaOpcion[]
  torneos: TorneoOpcion[]
  gastosReales: GastoRealOpcion[]
}) {
  const router = useRouter()
  const [creando, setCreando] = useState(false)
  const [cat, setCat] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState(0)
  const [fecha, setFecha] = useState('')
  const [torneo, setTorneo] = useState('')
  const [ejecutando, setEjecutando] = useState<string | null>(null)
  const [gastoReal, setGastoReal] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function crear() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('crear_gasto_planificado', {
      p_cat_gasto_id: cat,
      p_descripcion: descripcion.trim(),
      p_monto: monto,
      p_fecha_esperada: fecha,
      ...(torneo ? { p_torneo_id: torneo } : {}),
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setCreando(false)
    setCat('')
    setDescripcion('')
    setMonto(0)
    setFecha('')
    setTorneo('')
    router.refresh()
  }

  async function ejecutar() {
    if (!ejecutando) return
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('marcar_gasto_planificado_ejecutado', {
      p_planificado_id: ejecutando,
      p_gasto_id: gastoReal,
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setEjecutando(null)
    setGastoReal('')
    router.refresh()
  }

  const enEjecucion = planificados.find((p) => p.id === ejecutando)
  const candidatos = enEjecucion
    ? gastosReales.filter((g) => g.cat_gasto_id === enEjecucion.cat_gasto_id)
    : []

  return (
    <section className="mt-8 border-t border-line pt-6">
      <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
        Gastos planificados
      </h2>
      <p className="mb-3 max-w-[82ch] text-[11px] leading-snug text-muted">
        Plata que se sabe que va a salir pero todavía no es un gasto cargado. Mientras está{' '}
        <strong className="font-semibold text-ink">pendiente</strong>, proyecta en la curva de
        Proyección; cuando el gasto real se carga, marcalo{' '}
        <strong className="font-semibold text-ink">ejecutado</strong> acá — si no, la proyección lo
        cuenta dos veces.
      </p>

      {error && (
        <p className="mb-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
          {error}
        </p>
      )}

      {planificados.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-panel text-[9px] uppercase tracking-[.06em] text-muted">
              <tr>
                <th className="px-4 py-2 text-left font-bold">Qué</th>
                <th className="px-3 py-2 text-left font-bold">Categoría</th>
                <th className="px-3 py-2 text-left font-bold">Esperado</th>
                <th className="px-3 py-2 text-right font-bold">Monto</th>
                <th className="px-3 py-2 text-left font-bold">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {planificados.map((p) => (
                <tr key={p.id} className={`border-t border-line2 ${p.estado !== 'pendiente' ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-2.5 font-semibold text-ink">
                    {p.descripcion}
                    {p.torneo && <span className="ml-1.5 text-[10.5px] font-normal text-muted">· {p.torneo}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{p.categoria}</td>
                  <td className="px-3 py-2.5 text-muted">{formatDate(p.fecha_esperada)}</td>
                  <td className="cifra px-3 py-2.5 text-right font-bold text-ink">{formatMoney(p.monto)}</td>
                  <td className="px-3 py-2.5">
                    <Badge estado={p.estado === 'pendiente' ? 'porVencer' : p.estado === 'ejecutado' ? 'ok' : 'neutro'}>
                      {p.estado === 'pendiente' ? 'Proyectando' : p.estado === 'ejecutado' ? 'Ejecutado' : 'Cancelado'}
                    </Badge>
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    {p.estado === 'pendiente' && (
                      <Button
                        size="pill"
                        variant="secondary"
                        disabled={ocupado}
                        onClick={() => {
                          setEjecutando(p.id)
                          setGastoReal('')
                        }}
                      >
                        Marcar ejecutado
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {enEjecucion && (
        <div className="mt-3 rounded-md border border-line bg-white p-4">
          <p className="text-[12px] font-bold text-ink">
            «{enEjecucion.descripcion}» ya se cargó como gasto real
          </p>
          <p className="mt-1 max-w-prose text-[11px] leading-snug text-muted">
            Elegí cuál es: el plan se ata a ese gasto y deja de proyectar — el real toma la posta
            en la curva.
          </p>
          <div className="mt-3 max-w-md">
            <Field label="Gasto real" required hint="De la misma categoría, sin plan atado.">
              <Select placeholder="Elegir…" value={gastoReal} onChange={(e) => setGastoReal(e.target.value)}>
                {candidatos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.etiqueta}
                  </option>
                ))}
              </Select>
            </Field>
            {candidatos.length === 0 && (
              <p className="mt-2 text-[10.5px] text-muted">
                No hay gastos de esa categoría sin plan atado. Cargá primero el gasto real en
                Gastos.
              </p>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <Button icon="check" loading={ocupado} disabled={ocupado || !gastoReal} onClick={ejecutar}>
              Atar y dejar de proyectar
            </Button>
            <Button variant="tertiary" disabled={ocupado} onClick={() => setEjecutando(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {creando ? (
        <div className="mt-3 rounded-md border border-line bg-white p-4">
          <h3 className="mb-3 text-[12.5px] font-extrabold text-ink">Planificar un gasto</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Descripción" required className="lg:col-span-2">
              <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Service del grupo electrógeno" />
            </Field>
            <Field label="Categoría" required>
              <Select placeholder="Elegir…" value={cat} onChange={(e) => setCat(e.target.value)}>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Monto" required>
              <Input type="number" value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))} />
            </Field>
            <Field label="Fecha esperada" required hint="Cuándo proyecta en la curva.">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="Torneo" hint="Vacío = estructura.">
              <Select value={torneo} onChange={(e) => setTorneo(e.target.value)}>
                <option value="">Estructura</option>
                {torneos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button icon="check" loading={ocupado} disabled={ocupado || !cat || !descripcion.trim() || monto <= 0 || !fecha} onClick={crear}>
              Planificar
            </Button>
            <Button variant="tertiary" disabled={ocupado} onClick={() => setCreando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button variant="secondary" icon="plus" onClick={() => setCreando(true)}>
            Planificar un gasto
          </Button>
        </div>
      )}
    </section>
  )
}
