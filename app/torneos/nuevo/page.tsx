"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button, Card, Field, Input, Select } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type Temporada = Database['public']['Enums']['temporada']
type TorneoLista = Database['public']['Views']['v_torneo_lista']['Row']

const TEMPORADAS: { value: Temporada; label: string }[] = [
  { value: 'apertura', label: 'Apertura' },
  { value: 'clausura', label: 'Clausura' },
]

type Modo = 'vacio' | 'clonar'

/**
 * `ejercicio_id` no está en el formulario, a propósito.
 *
 * `crear_torneo` lo sigue aceptando —la columna existe y algún día va a
 * importar— pero hoy los dos torneos cargados lo tienen en NULL, hay un solo
 * ejercicio, y nadie lo completa. Un campo que siempre queda vacío no informa:
 * ocupa lugar y hace dudar de si había que llenarlo.
 *
 * Cuando el cierre de ejercicio empiece a usarse de verdad, entra acá.
 *
 * En el modo "Clonar" SÍ hace falta —`clonar_torneo` lo exige, sin default—,
 * pero tampoco se pide: se resuelve solo, leyendo el ejercicio del torneo
 * origen elegido. Es el mismo criterio que "el torneo nuevo hereda del
 * anterior", aplicado a un campo más.
 */
export default function NuevoTorneoPage() {
  const router = useRouter()

  const [modo, setModo] = useState<Modo>('vacio')

  const [nombre, setNombre] = useState('')
  const [temporada, setTemporada] = useState<Temporada>('apertura')
  const [anio, setAnio] = useState<number>(new Date().getFullYear() + 1)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  // Solo para "Clonar de..."
  const [origenId, setOrigenId] = useState('')

  const [existentes, setExistentes] = useState<TorneoLista[]>([])
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('v_torneo_lista')
      .select('*')
      .then(({ data }) => {
        const filas = data ?? []
        setExistentes(filas)
        if (filas[0]?.torneo_id) setOrigenId(filas[0].torneo_id)

        // El default salta al primer hueco libre.
        //
        // Sin esto se entraba a la pantalla con la advertencia de duplicado ya
        // puesta —el año siguiente casi siempre tiene su Apertura cargada— y el
        // botón deshabilitado antes de tocar nada. Una pantalla que se abre
        // quejándose enseña a ignorar la queja, que es justo lo que no se
        // quiere de un aviso que a veces sí importa.
        //
        // Se recorren temporadas y años en el orden en que ocurren, arrancando
        // del año que ya estaba propuesto.
        const ocupado = (t: Temporada, a: number) =>
          filas.some((f) => f.temporada === t && f.anio === a)

        for (let a = anio; a < anio + 5; a++) {
          for (const t of ['apertura', 'clausura'] as Temporada[]) {
            if (!ocupado(t, a)) {
              setTemporada(t)
              setAnio(a)
              return
            }
          }
        }
      })
    // Corre una sola vez: `anio` es el punto de partida de la búsqueda, no una
    // dependencia — reaccionar a él pisaría lo que el operador acaba de tipear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * El duplicado, avisado antes de llamar.
   *
   * `torneo` tiene UNIQUE (temporada, anio) y las dos funciones —`crear_torneo`
   * y `clonar_torneo`— lo traducen a un mensaje propio, así que la validación
   * real está en la base y no acá. Esto es sólo no hacerle leer una excepción
   * a alguien que ya tiene la lista de torneos delante: se le dice cuál choca,
   * con nombre. Vale para los dos modos por igual.
   */
  const duplicado = useMemo(
    () => existentes.find((t) => t.temporada === temporada && t.anio === anio) ?? null,
    [existentes, temporada, anio],
  )

  const fechasAlReves = Boolean(desde && hasta && desde > hasta)

  const puedeCrear =
    !creando && nombre.trim().length > 0 && anio >= 2000 && !duplicado && !fechasAlReves
  const puedeClonar =
    !creando && nombre.trim().length > 0 && anio >= 2000 && !duplicado && !!origenId

  async function crear() {
    setCreando(true)
    setError(null)

    const supabase = createClient()
    const { data, error: errRpc } = await supabase.rpc('crear_torneo', {
      p_nombre: nombre.trim(),
      p_temporada: temporada,
      p_anio: anio,
      p_fecha_desde: desde || undefined,
      p_fecha_hasta: hasta || undefined,
    })

    setCreando(false)

    if (errRpc) {
      setError(errRpc.message)
      return
    }

    // El torneo nace vacío: sin categorías, sin series y sin tarifario no se
    // puede inscribir a nadie. La lista lo marca con «Falta cargar», así que
    // volver ahí es lo que dice cuál es el paso siguiente.
    router.push('/torneos')
    router.refresh()
    void data
  }

  /**
   * Clonar: el ejercicio se lee del origen, no se pide.
   *
   * Una consulta chica antes del RPC en vez de pasarle el trabajo a
   * `clonar_torneo`: la función exige `p_ejercicio_id` sin default —a
   * diferencia de `crear_torneo`— y `torneo.ejercicio_id` es NOT NULL en la
   * base, así que un origen sin ejercicio asignado rompería con un 23502 crudo
   * si no se lo frena acá con un mensaje que diga qué pasó.
   */
  async function clonar() {
    if (!origenId) return
    setCreando(true)
    setError(null)

    const supabase = createClient()

    const { data: origen, error: errOrigen } = await supabase
      .from('torneo')
      .select('ejercicio_id')
      .eq('id', origenId)
      .single()

    if (errOrigen || !origen?.ejercicio_id) {
      setCreando(false)
      setError(
        errOrigen?.message ??
          'El torneo origen no tiene un ejercicio asignado: no se puede clonar sin eso.',
      )
      return
    }

    const { data, error: errRpc } = await supabase.rpc('clonar_torneo', {
      p_torneo_origen_id: origenId,
      p_nombre_nuevo: nombre.trim(),
      p_anio: anio,
      p_temporada: temporada,
      p_ejercicio_id: origen.ejercicio_id,
    })

    setCreando(false)

    if (errRpc) {
      setError(errRpc.message)
      return
    }

    // A diferencia del vacío, acá hay estructura, tarifario y equipos recién
    // copiados para revisar — el paso siguiente es editar ESE torneo, no ver
    // la lista de todos. `data` es el uuid que devuelve clonar_torneo.
    router.push(`/torneos/${data}/fichas`)
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/torneos" className="text-sm text-slate-500 hover:text-slate-700">
          ← Torneos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Nuevo torneo</h1>
        <p className="mt-1 text-sm text-slate-500">
          {modo === 'vacio'
            ? 'El torneo nace vacío y en estado planificado. Después hay que cargarle categorías, series y tarifario para poder inscribir equipos.'
            : 'Copia categorías, series, tarifario (con precios) y equipos del torneo elegido. Nace en estado planificado, sin cuotas: se editan los equipos y recién después se confirma.'}
        </p>
      </div>

      <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
        {(
          [
            ['vacio', 'Vacío'],
            ['clonar', 'Clonar de...'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`rounded-[5px] px-4 py-1.5 text-[11px] font-bold transition ${
              modo === m ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <div className="space-y-4">
          <Field label="Nombre" hint="Como se va a ver en toda la app. Por ejemplo: Apertura 2027.">
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Apertura 2027"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Temporada">
              <Select value={temporada} onChange={(e) => setTemporada(e.target.value as Temporada)}>
                {TEMPORADAS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Año">
              <Input
                type="number"
                value={anio}
                min={2000}
                onChange={(e) => setAnio(Number(e.target.value))}
              />
            </Field>
          </div>

          {duplicado && (
            <p className="text-sm text-amber-700">
              Ya existe <strong>{duplicado.nombre}</strong> para esa temporada y año. No pueden
              coexistir dos: cambiá el año o la temporada.
            </p>
          )}

          {modo === 'vacio' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Desde" hint="Opcional. Se puede completar después.">
                  <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                </Field>
                <Field label="Hasta" hint="Opcional.">
                  <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </Field>
              </div>

              {fechasAlReves && (
                <p className="text-sm text-amber-700">
                  La fecha de inicio es posterior a la de fin.
                </p>
              )}
            </>
          ) : (
            <Field
              label="Copiar la estructura, tarifario y equipos de"
              hint="Sin cuotas todavía — se editan los equipos y se confirma después."
            >
              <Select value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
                {existentes.map((t) => (
                  <option key={t.torneo_id ?? ''} value={t.torneo_id ?? ''}>
                    {t.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Link href="/torneos">
              <Button variant="tertiary">Cancelar</Button>
            </Link>
            {modo === 'vacio' ? (
              <Button onClick={crear} disabled={!puedeCrear} loading={creando} icon="plus">
                Crear torneo
              </Button>
            ) : (
              <Button onClick={clonar} disabled={!puedeClonar} loading={creando} icon="plus">
                Clonar torneo
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
