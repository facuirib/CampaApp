"use client"

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Badge, Button, Field, Select } from '@/components/ui'
import { formatMoney } from '@/lib/format'
import type { Database } from '@/lib/db/database.types'

type Ficha = Database['public']['Views']['v_ficha_torneo']['Row']
type Estructura = Database['public']['Views']['v_estructura_torneo']['Row']
type Torneo = Database['public']['Views']['v_torneo_lista']['Row']
type MedioPrevisto = Database['public']['Enums']['medio_pago']

interface Previo {
  fichas_creadas: number
  ya_existian: number
  sin_serie_equivalente: number
  sin_plan_equivalente: number
  salteadas: { equipo: string; motivo: string }[]
}

interface ResultadoConfirmar {
  fichas_procesadas: number
  cuotas_generadas: number
}

const MEDIOS: { value: MedioPrevisto; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
]

export default function FichasEditor({
  torneoId,
  torneo,
  fichas,
  series,
  origenes,
}: {
  torneoId: string
  torneo: Torneo
  fichas: Ficha[]
  series: Estructura[]
  origenes: Torneo[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [origenId, setOrigenId] = useState(origenes[0]?.torneo_id ?? '')
  const [previo, setPrevio] = useState<Previo | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)

  const sb = () => createClient()

  const ordenadas = useMemo(
    () =>
      [...fichas].sort(
        (a, b) =>
          (a.categoria_orden ?? 999) - (b.categoria_orden ?? 999) ||
          (a.serie_orden ?? 999) - (b.serie_orden ?? 999) ||
          (a.equipo ?? '').localeCompare(b.equipo ?? ''),
      ),
    [fichas],
  )

  /** Las series del torneo, agrupadas para el select de mover. */
  const opcionesSerie = useMemo(
    () =>
      series
        .filter((s) => s.serie_id)
        .sort(
          (a, b) =>
            (a.categoria_orden ?? 999) - (b.categoria_orden ?? 999) ||
            (a.serie_orden ?? 999) - (b.serie_orden ?? 999),
        ),
    [series],
  )

  // Cuántas fichas todavía no tienen cuotas — el estado normal después de
  // clonar, y lo que "Confirmar" resuelve. Distinto de `atada` (que mira
  // cuotas atadas a JORNADA, no cuotas en general): acá alcanza con que
  // tenga alguna, sea cual sea, porque editar_medio_previsto y borrar_ficha
  // bloquean apenas hay una.
  const sinConfirmar = useMemo(() => ordenadas.filter((f) => (f.cuotas ?? 0) === 0).length, [ordenadas])

  async function simular() {
    setOcupado('preview')
    setError(null)
    setResultado(null)
    const { data, error: err } = await sb().rpc('arrastrar_fichas', {
      p_origen_id: origenId,
      p_destino_id: torneoId,
      p_simular: true,
    })
    setOcupado(null)
    if (err) {
      setError(err.message)
      setPrevio(null)
      return
    }
    setPrevio(data as unknown as Previo)
  }

  async function arrastrar() {
    setOcupado('arrastrar')
    setError(null)
    const {
      data: { user },
    } = await sb().auth.getUser()
    const { data, error: err } = await sb().rpc('arrastrar_fichas', {
      p_origen_id: origenId,
      p_destino_id: torneoId,
      p_responsable_id: user?.id,
    })
    setOcupado(null)
    if (err) {
      setError(err.message)
      return
    }
    const r = data as unknown as Previo
    setPrevio(null)
    setResultado(
      r.fichas_creadas === 0
        ? `No se creó ninguna ficha: los ${r.ya_existian} equipos ya estaban inscriptos.`
        : `Se crearon ${r.fichas_creadas} fichas con sus cuotas.` +
            (r.ya_existian > 0 ? ` ${r.ya_existian} ya estaban inscriptos.` : ''),
    )
    router.refresh()
  }

  async function mover(fichaId: string, serieId: string) {
    setOcupado(`m:${fichaId}`)
    setError(null)
    const { error: err } = await sb().rpc('mover_ficha_de_serie', {
      p_ficha_id: fichaId,
      p_nueva_serie_id: serieId,
    })
    setOcupado(null)
    if (err) {
      setError(err.message)
      return
    }
    router.refresh()
  }

  /** Sacar una ficha. borrar_ficha() ya rechaza si tiene cuotas; acá además
   *  no se ofrece el botón en ese caso — mismo criterio que `atada` de arriba. */
  async function sacar(fichaId: string) {
    setOcupado(`b:${fichaId}`)
    setError(null)
    const { error: err } = await sb().rpc('borrar_ficha', { p_equipo_torneo_id: fichaId })
    setOcupado(null)
    if (err) {
      setError(err.message)
      return
    }
    router.refresh()
  }

  async function cambiarMedio(fichaId: string, medio: MedioPrevisto) {
    setOcupado(`mp:${fichaId}`)
    setError(null)
    const { error: err } = await sb().rpc('editar_medio_previsto', {
      p_equipo_torneo_id: fichaId,
      p_medio_previsto: medio,
    })
    setOcupado(null)
    if (err) {
      setError(err.message)
      return
    }
    router.refresh()
  }

  /** Confirmar: genera las cuotas de todas las fichas que todavía no las
   *  tienen. `confirmar_torneo_clonado` es RETURNS TABLE, así que `data`
   *  llega como array de una fila, no como objeto. */
  async function confirmar() {
    setOcupado('confirmar')
    setError(null)
    setResultado(null)
    const { data, error: err } = await sb().rpc('confirmar_torneo_clonado', {
      p_torneo_id: torneoId,
    })
    setOcupado(null)
    if (err) {
      setError(err.message)
      return
    }
    const r = (data as unknown as ResultadoConfirmar[])[0]
    setResultado(
      r.fichas_procesadas === 0
        ? 'No había fichas pendientes: todas ya tenían cuotas generadas.'
        : `Se confirmaron ${r.fichas_procesadas} ficha${r.fichas_procesadas === 1 ? '' : 's'}, con ${
            r.cuotas_generadas
          } cuota${r.cuotas_generadas === 1 ? '' : 's'} generada${r.cuotas_generadas === 1 ? '' : 's'} en total.`,
    )
    router.refresh()
  }

  const puedeArrastrar = origenes.length > 0
  // El bloque va destacado cuando el torneo está armado pero casi vacío: es el
  // momento en que arrastrar es lo que corresponde hacer.
  const destacado = fichas.length === 0

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md bg-errbg px-4 py-3 text-sm text-errtx">{error}</div>}
      {resultado && (
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {resultado}
        </div>
      )}

      {/* ── El arrastre ──────────────────────────────────────────────────── */}
      {puedeArrastrar && (
        <div
          className={
            destacado
              ? 'rounded-lg border border-blue-200 bg-blue-50 p-5'
              : 'rounded-lg border border-slate-200 p-4'
          }
        >
          {destacado && (
            <>
              <h2 className="text-base font-semibold text-slate-900">
                Este torneo todavía no tiene inscriptos
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                El torneo nuevo suele ser continuidad del anterior: los mismos equipos, en
                las mismas series. Traerlos genera sus cuotas con el tarifario de{' '}
                <strong>este</strong> torneo, no con los precios viejos. Después se mueven
                de serie los que ascendieron o descendieron.
              </p>
            </>
          )}

          <div className="mt-3 flex items-end gap-3">
            <Field label="Traer los inscriptos de" className="flex-1">
              <Select
                value={origenId}
                onChange={(e) => {
                  setOrigenId(e.target.value)
                  setPrevio(null)
                }}
              >
                {origenes.map((t) => (
                  <option key={t.torneo_id ?? ''} value={t.torneo_id ?? ''}>
                    {t.nombre} — {t.equipos} equipo{t.equipos === 1 ? '' : 's'}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              onClick={simular}
              loading={ocupado === 'preview'}
              disabled={!origenId || ocupado !== null}
              variant="secondary"
            >
              Ver qué se va a crear
            </Button>
          </div>

          {/* ── El preview ───────────────────────────────────────────────
              Sale de la MISMA función con p_simular, no de una consulta
              aparte: el número que promete es el que después ocurre porque
              lo calcula el mismo emparejamiento. */}
          {previo && (
            <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-800">
                Se van a crear <strong>{previo.fichas_creadas} ficha
                {previo.fichas_creadas === 1 ? '' : 's'}</strong>, cada una con sus cuotas.
                {previo.ya_existian > 0 && (
                  <> {previo.ya_existian} equipo(s) ya están inscriptos y se saltean.</>
                )}
              </p>

              {previo.salteadas.length > 0 && (
                <>
                  <p className="mt-3 text-sm font-medium text-amber-700">
                    {previo.salteadas.length} se saltean:
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {previo.salteadas.map((s, i) => (
                      <li key={i} className="text-[12px] text-slate-600">
                        <strong>{s.equipo}</strong> — {s.motivo}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="tertiary" onClick={() => setPrevio(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={arrastrar}
                  loading={ocupado === 'arrastrar'}
                  disabled={previo.fichas_creadas === 0}
                >
                  Crear las {previo.fichas_creadas} fichas
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Las fichas ───────────────────────────────────────────────────── */}
      {ordenadas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Equipo</th>
                <th className="py-2 pr-3">Serie</th>
                <th className="py-2 pr-3">Inscripción</th>
                <th className="py-2 pr-3">Partidos</th>
                <th className="py-2 pr-3 text-right">Plan</th>
                <th className="py-2 pr-3 text-right">Cuotas</th>
                <th className="py-2 pr-3">Mover de serie</th>
                <th className="py-2 pr-3">Medio previsto</th>
                <th className="py-2">Sacar</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((f) => {
                const atada = (f.cuotas_con_jornada ?? 0) > 0
                // Distinto de `atada`: acá importa CUALQUIER cuota, no solo
                // las atadas a jornada. editar_medio_previsto y borrar_ficha
                // rechazan apenas hay una — el monto ya se calculó con el
                // medio_previsto y el plan de ese momento.
                const tieneCuotas = (f.cuotas ?? 0) > 0
                return (
                  <tr key={f.ficha_id} className="border-b border-line last:border-0">
                    {/* El nombre linkea a la ficha del equipo. Era el tercer
                        silo: acá se veía en qué serie y con qué modalidad juega
                        un equipo, y no había forma de saltar a lo que debe. */}
                    <td className="py-2 pr-3 font-medium text-ink">
                      {f.tercero_id ? (
                        <Link href={`/equipos/${f.tercero_id}`} className="hover:underline">
                          {f.equipo}
                        </Link>
                      ) : (
                        f.equipo
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {f.categoria} {f.serie}
                    </td>
                    <td className="py-2 pr-3 text-muted">{f.plan_inscripcion}</td>
                    <td className="py-2 pr-3 text-muted">{f.plan_partidos}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatMoney(f.total_plan ?? 0)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {f.cuotas_pagadas}/{f.cuotas}
                    </td>
                    <td className="py-2 pr-3">
                      {atada ? (
                        /* No se ofrece el select y se dice por qué. Ofrecerlo y
                           que la función lo rechace sería hacerle descubrir el
                           bloqueo al operador con un error. */
                        <span className="text-[11px] text-muted">
                          <Badge estado="neutro">No se puede</Badge>{' '}
                          {f.cuotas_con_jornada} cuotas atadas a fechas de esta serie
                        </span>
                      ) : (
                        <Select
                          value={f.serie_id ?? ''}
                          disabled={ocupado === `m:${f.ficha_id}`}
                          onChange={(e) => mover(f.ficha_id!, e.target.value)}
                          className="w-44"
                        >
                          {opcionesSerie
                            .filter((s) => s.genero === f.genero)
                            .map((s) => (
                              <option key={s.serie_id ?? ''} value={s.serie_id ?? ''}>
                                {s.categoria} {s.serie}
                              </option>
                            ))}
                        </Select>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {tieneCuotas ? (
                        <span className="text-[11px] text-muted">
                          <Badge estado="neutro">No se puede</Badge> ya tiene cuotas
                        </span>
                      ) : (
                        <Select
                          value={(f.medio_previsto as MedioPrevisto) ?? ''}
                          disabled={ocupado === `mp:${f.ficha_id}`}
                          onChange={(e) => cambiarMedio(f.ficha_id!, e.target.value as MedioPrevisto)}
                          className="w-36"
                        >
                          {MEDIOS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </td>
                    <td className="py-2">
                      {tieneCuotas ? (
                        <span className="text-[11px] text-muted">—</span>
                      ) : (
                        <Button
                          size="pill"
                          variant="tertiary"
                          icon="borrar"
                          loading={ocupado === `b:${f.ficha_id}`}
                          disabled={ocupado !== null}
                          onClick={() => sacar(f.ficha_id!)}
                        >
                          Sacar
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {ordenadas.length === 0 && !puedeArrastrar && (
        <p className="py-8 text-center text-sm text-muted">
          {torneo.tiene_estructura
            ? 'Todavía no hay equipos inscriptos, y no hay otro torneo del cual traerlos.'
            : 'Este torneo no tiene estructura cargada: primero las categorías, series y el tarifario.'}
        </p>
      )}

      {/* ── Confirmar ────────────────────────────────────────────────────
          Mismo estilo destacado que el bloque de arrastre cuando corresponde
          actuar: acá "corresponde" es que haya algo sin confirmar. */}
      {sinConfirmar > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-base font-semibold text-slate-900">
            {sinConfirmar} ficha{sinConfirmar === 1 ? '' : 's'} sin confirmar
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Todavía no tienen cuotas — es el estado normal después de clonar un torneo.
            Revisá series, medio previsto y bajas antes de confirmar: una vez generadas las
            cuotas, esta pantalla ya no deja tocar esos datos para las fichas afectadas.
          </p>
          <div className="mt-3 flex justify-end">
            <Button
              onClick={confirmar}
              loading={ocupado === 'confirmar'}
              disabled={ocupado !== null}
            >
              Confirmar y generar cuotas
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
