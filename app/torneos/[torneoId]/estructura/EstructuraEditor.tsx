"use client"

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Badge, Button, Field, Input, Select } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type Fila = Database['public']['Views']['v_estructura_torneo']['Row']
type Torneo = Database['public']['Views']['v_torneo_lista']['Row']
type Genero = Database['public']['Enums']['genero']

interface Categoria {
  id: string
  nombre: string
  genero: string
  orden: number | null
  equipos: number
  series: { id: string; nombre: string; orden: number | null; equipos: number }[]
}

/**
 * La vista devuelve una fila por serie, con los datos de la categoría
 * repetidos, y las categorías sin series vienen con `serie_id` en NULL.
 *
 * Agrupar acá es armado de estructura, no cálculo: los conteos ya vienen
 * resueltos de la vista. Lo único que se hace es plegar filas planas en un
 * árbol para poder dibujarlo.
 */
function agrupar(filas: Fila[]): Categoria[] {
  const mapa = new Map<string, Categoria>()

  for (const f of filas) {
    if (!f.categoria_id) continue
    if (!mapa.has(f.categoria_id)) {
      mapa.set(f.categoria_id, {
        id: f.categoria_id,
        nombre: f.categoria ?? '',
        genero: f.genero ?? '',
        orden: f.categoria_orden,
        equipos: f.equipos_categoria ?? 0,
        series: [],
      })
    }
    if (f.serie_id) {
      mapa.get(f.categoria_id)!.series.push({
        id: f.serie_id,
        nombre: f.serie ?? '',
        orden: f.serie_orden,
        equipos: f.equipos ?? 0,
      })
    }
  }

  const cats = [...mapa.values()]
  cats.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.nombre.localeCompare(b.nombre))
  for (const c of cats) {
    c.series.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.nombre.localeCompare(b.nombre))
  }
  return cats
}

export default function EstructuraEditor({
  torneoId,
  filas,
  origenes,
}: {
  torneoId: string
  filas: Fila[]
  origenes: Torneo[]
}) {
  const router = useRouter()
  const categorias = useMemo(() => agrupar(filas), [filas])
  const vacio = categorias.length === 0

  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Clonado
  const [origenId, setOrigenId] = useState<string>(origenes[0]?.torneo_id ?? '')
  const [resultado, setResultado] = useState<string | null>(null)

  // Alta de categoría
  const [abriendoCat, setAbriendoCat] = useState(false)
  const [catNombre, setCatNombre] = useState('')
  const [catGenero, setCatGenero] = useState<Genero>('masculino')

  // Alta de serie: la categoría en la que se está agregando
  const [serieEn, setSerieEn] = useState<string | null>(null)
  const [serieNombre, setSerieNombre] = useState('')

  // Edición en línea
  const [editando, setEditando] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')

  // `PromiseLike` y no `Promise`: el builder de supabase-js es *thenable* pero
  // no una Promise — no tiene catch ni finally. Awaitearlo funciona igual.
  async function correr(
    clave: string,
    fn: () => PromiseLike<{ error: { message: string } | null }>,
  ) {
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

  async function clonar() {
    if (!origenId) return
    setResultado(null)
    const supabase = createClient()
    setOcupado('clonar')
    setError(null)
    const { data, error: err } = await supabase.rpc('clonar_estructura_torneo', {
      p_origen_id: origenId,
      p_destino_id: torneoId,
    })
    setOcupado(null)
    if (err) {
      setError(err.message)
      return
    }
    // La función informa INSERCIONES, no el estado final: si el destino ya
    // tenía todo, dice 0 y 0. Se muestra tal cual — un "copié 20 series"
    // cuando no copió ninguna sería peor que no decir nada.
    const r = data as {
      categorias_creadas: number
      categorias_reusadas: number
      series_creadas: number
      series_existentes: number
    }
    setResultado(
      r.categorias_creadas === 0 && r.series_creadas === 0
        ? 'No había nada que copiar: la estructura ya estaba completa.'
        : `Se copiaron ${r.categorias_creadas} categoría(s) y ${r.series_creadas} serie(s).` +
            (r.categorias_reusadas > 0
              ? ` ${r.categorias_reusadas} categoría(s) ya existían y se reusaron.`
              : ''),
    )
    router.refresh()
  }

  const supabase = () => createClient()

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {resultado && (
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {resultado}
        </div>
      )}

      {/* ── Clonado ─────────────────────────────────────────────────────── */}
      {origenes.length > 0 && (
        <div
          className={
            vacio
              ? 'rounded-lg border border-blue-200 bg-blue-50 p-5'
              : 'rounded-lg border border-slate-200 p-4'
          }
        >
          {vacio && (
            <>
              <h2 className="text-base font-semibold text-slate-900">
                Este torneo todavía no tiene estructura
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Los nombres de categoría y serie se mantienen entre torneos, así que lo más
                rápido es copiarlos del anterior y después ajustar. No se copia el tarifario
                —sus precios y fechas cambian todos los torneos— ni los equipos inscriptos.
              </p>
            </>
          )}
          <div className="mt-3 flex items-end gap-3">
            <Field label="Copiar la estructura de" className="flex-1">
              <Select value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
                {origenes.map((t) => (
                  <option key={t.torneo_id ?? ''} value={t.torneo_id ?? ''}>
                    {t.nombre} — {t.categorias} {t.categorias === 1 ? 'categoría' : 'categorías'},{' '}
                    {t.series} {t.series === 1 ? 'serie' : 'series'}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              onClick={clonar}
              loading={ocupado === 'clonar'}
              disabled={!origenId || ocupado !== null}
              variant={vacio ? 'primary' : 'secondary'}
            >
              Clonar estructura
            </Button>
          </div>
        </div>
      )}

      {/* ── El árbol ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {categorias.map((c) => (
          <div key={c.id} className="rounded-lg border border-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              {editando === `cat:${c.id}` ? (
                <>
                  <Input
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button
                    size="pill"
                    loading={ocupado === `cat:${c.id}`}
                    onClick={async () => {
                      const ok = await correr(`cat:${c.id}`, () =>
                        supabase().rpc('editar_categoria', {
                          p_categoria_id: c.id,
                          p_nombre: editNombre,
                        }),
                      )
                      if (ok) setEditando(null)
                    }}
                  >
                    Guardar
                  </Button>
                  <Button size="pill" variant="tertiary" onClick={() => setEditando(null)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-900">{c.nombre}</span>
                  <Badge estado={c.genero === 'femenino' ? 'info' : 'neutro'}>
                    {c.genero === 'femenino' ? 'Femenino' : 'Masculino'}
                  </Badge>
                  <span className="text-sm text-slate-500">
                    {c.series.length} serie{c.series.length === 1 ? '' : 's'} · {c.equipos} equipo
                    {c.equipos === 1 ? '' : 's'}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <Button
                      size="pill"
                      variant="tertiary"
                      icon="editar"
                      onClick={() => {
                        setEditando(`cat:${c.id}`)
                        setEditNombre(c.nombre)
                      }}
                    >
                      Renombrar
                    </Button>
                    <Button
                      size="pill"
                      variant="tertiary"
                      icon="borrar"
                      loading={ocupado === `delcat:${c.id}`}
                      onClick={() =>
                        correr(`delcat:${c.id}`, () =>
                          supabase().rpc('borrar_categoria', { p_categoria_id: c.id }),
                        )
                      }
                    >
                      Borrar
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              {c.series.map((s) =>
                editando === `ser:${s.id}` ? (
                  <span key={s.id} className="flex items-center gap-2">
                    <Input
                      value={editNombre}
                      onChange={(e) => setEditNombre(e.target.value)}
                      className="w-24"
                    />
                    <Button
                      size="pill"
                      loading={ocupado === `ser:${s.id}`}
                      onClick={async () => {
                        const ok = await correr(`ser:${s.id}`, () =>
                          supabase().rpc('editar_serie', {
                            p_serie_id: s.id,
                            p_nombre: editNombre,
                          }),
                        )
                        if (ok) setEditando(null)
                      }}
                    >
                      Guardar
                    </Button>
                    <Button size="pill" variant="tertiary" onClick={() => setEditando(null)}>
                      ✕
                    </Button>
                  </span>
                ) : (
                  <span
                    key={s.id}
                    className="group inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                  >
                    <span className="font-medium text-slate-800">{s.nombre}</span>
                    <span className="text-slate-400">{s.equipos}</span>
                    <button
                      className="text-slate-400 hover:text-slate-700"
                      title="Renombrar"
                      onClick={() => {
                        setEditando(`ser:${s.id}`)
                        setEditNombre(s.nombre)
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="text-slate-400 hover:text-red-600"
                      title="Borrar"
                      onClick={() =>
                        correr(`delser:${s.id}`, () =>
                          supabase().rpc('borrar_serie', { p_serie_id: s.id }),
                        )
                      }
                    >
                      ✕
                    </button>
                  </span>
                ),
              )}

              {serieEn === c.id ? (
                <span className="flex items-center gap-2">
                  <Input
                    value={serieNombre}
                    onChange={(e) => setSerieNombre(e.target.value)}
                    placeholder="G"
                    className="w-24"
                  />
                  <Button
                    size="pill"
                    loading={ocupado === `newser:${c.id}`}
                    onClick={async () => {
                      const ok = await correr(`newser:${c.id}`, () =>
                        supabase().rpc('crear_serie', {
                          p_categoria_id: c.id,
                          p_nombre: serieNombre,
                        }),
                      )
                      if (ok) {
                        setSerieEn(null)
                        setSerieNombre('')
                      }
                    }}
                  >
                    Agregar
                  </Button>
                  <Button size="pill" variant="tertiary" onClick={() => setSerieEn(null)}>
                    ✕
                  </Button>
                </span>
              ) : (
                <Button
                  size="pill"
                  variant="tertiary"
                  icon="plus"
                  onClick={() => {
                    setSerieEn(c.id)
                    setSerieNombre('')
                  }}
                >
                  Serie
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Alta de categoría ───────────────────────────────────────────── */}
      {abriendoCat ? (
        <div className="flex items-end gap-3 rounded-lg border border-slate-200 p-4">
          <Field label="Nombre" className="flex-1">
            <Input
              value={catNombre}
              onChange={(e) => setCatNombre(e.target.value)}
              placeholder="+45"
            />
          </Field>
          <Field label="Género">
            <Select value={catGenero} onChange={(e) => setCatGenero(e.target.value as Genero)}>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
            </Select>
          </Field>
          <Button
            loading={ocupado === 'newcat'}
            onClick={async () => {
              const ok = await correr('newcat', () =>
                supabase().rpc('crear_categoria', {
                  p_torneo_id: torneoId,
                  p_nombre: catNombre,
                  p_genero: catGenero,
                }),
              )
              if (ok) {
                setAbriendoCat(false)
                setCatNombre('')
              }
            }}
          >
            Agregar
          </Button>
          <Button variant="tertiary" onClick={() => setAbriendoCat(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button variant="secondary" icon="plus" onClick={() => setAbriendoCat(true)}>
          Agregar categoría
        </Button>
      )}
    </div>
  )
}
