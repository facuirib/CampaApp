"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/db/client'
import { Field, Input, Select } from '@/components/ui'
import { formatMoney } from '@/lib/format'

interface Torneo {
  id: string
  nombre: string
}

interface DeudorTorneo {
  tercero_id: string
  equipo: string
  deuda_total: number
}

/**
 * El primer tramo del cobro sin equipo previo: elegir torneo, después a
 * quién. Vive adentro de `CobroProvider` — nunca se monta solo.
 *
 * ── Por qué primero torneo y no un buscador de equipos a secas ──────────
 *
 * La versión anterior (`CobroRapido`) buscaba en `tercero` sin filtrar por
 * deuda: encontraba cualquier equipo, debiera o no. Acá el punto de partida
 * es la otra pregunta — "¿a quién le cobro EN ESTE TORNEO?" — así que la
 * lista sale de `v_deuda_equipo_torneo` ya filtrada a `deuda_total > 0`. Un
 * equipo al día no aparece: no hay nada que cobrarle ahí, y mostrarlo sería
 * ofrecer un cobro que `registrar_cobro` va a rechazar.
 *
 * Con la lista ya acotada al torneo, la búsqueda de más abajo es sobre lo
 * que ya está en memoria —sin ida y vuelta a la base por cada letra—, a
 * diferencia del buscador viejo que sí necesitaba debounce porque pegaba
 * contra toda la tabla `tercero`.
 */
export default function BuscadorEquipoCobro({
  torneoInicial,
  onElegirEquipo,
}: {
  torneoInicial: string | null
  onElegirEquipo: (terceroId: string) => void
}) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [torneos, setTorneos] = useState<Torneo[]>([])
  const [torneoId, setTorneoId] = useState<string | null>(torneoInicial)
  const [deudores, setDeudores] = useState<DeudorTorneo[]>([])
  const [busqueda, setBusqueda] = useState('')

  // Torneos + el actual, una sola vez: el default es el en curso, salvo que
  // ya haya llegado uno explícito desde donde se abrió el modal.
  useEffect(() => {
    let cancelado = false
    async function cargarTorneos() {
      const supabase = createClient()
      const [{ data: torneosData, error: errorTorneos }, { data: actual }] = await Promise.all([
        supabase.from('torneo').select('id, nombre').order('anio', { ascending: false }),
        supabase.from('v_torneo_actual').select('id').maybeSingle(),
      ])
      if (cancelado) return
      if (errorTorneos) {
        setError(errorTorneos.message)
        setCargando(false)
        return
      }
      setTorneos(torneosData ?? [])
      if (!torneoInicial) setTorneoId(actual?.id ?? torneosData?.[0]?.id ?? null)
    }
    cargarTorneos()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Los deudores del torneo elegido. Se repite cada vez que cambia el
  // torneo — es la pregunta "quién debe ACÁ", no una lista global a filtrar.
  useEffect(() => {
    if (!torneoId) {
      setDeudores([])
      setCargando(false)
      return
    }
    const idTorneo = torneoId
    let cancelado = false
    setCargando(true)
    async function cargarDeudores() {
      const { data, error: errorDeuda } = await createClient()
        .from('v_deuda_equipo_torneo')
        .select('tercero_id, equipo, deuda_total')
        .eq('torneo_id', idTorneo)
        .gt('deuda_total', 0)
        .order('equipo')
      if (cancelado) return
      if (errorDeuda) {
        setError(errorDeuda.message)
        setCargando(false)
        return
      }
      setDeudores((data ?? []) as DeudorTorneo[])
      setCargando(false)
    }
    cargarDeudores()
    return () => {
      cancelado = true
    }
  }, [torneoId])

  // La lista YA NO se muestra entera: con 28 equipos con deuda el modal
  // medía una pantalla. Los deudores se siguen cargando igual —la búsqueda
  // es sobre esa lista— pero solo se RENDERIZAN los resultados de lo
  // tipeado. La lógica de elegir y cobrar no cambia en nada.
  const hayBusqueda = busqueda.trim() !== ''
  const filtrados = hayBusqueda
    ? deudores.filter((d) => d.equipo.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : []

  return (
    <div>
      {torneos.length === 0 ? (
        <p className="text-[11px] text-muted">Cargando torneos…</p>
      ) : (
        <Field label="Torneo">
          <Select value={torneoId ?? ''} onChange={(e) => setTorneoId(e.target.value || null)}>
            {torneos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="mt-4">
        <Field label="Buscar equipo">
          <Input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre del equipo…"
            disabled={!torneoId}
          />
        </Field>
      </div>

      {error && <p className="mt-3 text-[11px] text-errtx">{error}</p>}

      {!error && cargando && <p className="mt-3 text-[11px] text-muted">Cargando…</p>}

      {!error && !cargando && torneoId && filtrados.length === 0 && (
        <p className="mt-3 text-[11px] text-muted">
          {deudores.length === 0
            ? 'Ningún equipo tiene deuda en este torneo.'
            : hayBusqueda
              ? 'Sin resultados para esa búsqueda.'
              : `Escribí para buscar entre los ${deudores.length} equipos con deuda de este torneo.`}
        </p>
      )}

      <ul className="mt-3 grid gap-1">
        {filtrados.map((d) => (
          <li key={d.tercero_id}>
            <button
              type="button"
              onClick={() => onElegirEquipo(d.tercero_id)}
              className="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-[12px] font-semibold text-ink hover:bg-row-hover"
            >
              <span>{d.equipo}</span>
              <span className="shrink-0 text-[11px] font-bold text-errtx">
                {formatMoney(d.deuda_total)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
