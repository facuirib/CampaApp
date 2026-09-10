"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button, Field, Input, Select } from '@/components/ui'

export interface DatosTorneo {
  nombre: string
  anio: number
  temporada: string
  ejercicio_id: string | null
}

/**
 * Editar lo descriptivo del torneo: nombre, año, temporada y ejercicio.
 *
 * Hasta esta pantalla, un typo en el nombre de un torneo era para siempre — no
 * había ni función ni formulario. El estado NO se edita acá (es del ciclo), ni
 * la baja (tiene su par borrar/reactivar).
 *
 * El ejercicio se ASIGNA pero no se des-asigna: la función usa null como «no
 * tocar», así que no hay forma de mandarle «borralo» — y desasignar el
 * ejercicio de un torneo con movimientos es una decisión contable que no
 * debería estar a un select de distancia.
 */
export default function EditarTorneo({
  torneoId,
  inicial,
  ejercicios,
}: {
  torneoId: string
  inicial: DatosTorneo
  ejercicios: { id: string; anio: number }[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState(inicial)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('editar_torneo', {
      p_torneo_id: torneoId,
      p_nombre: datos.nombre,
      p_anio: datos.anio,
      // El cast es del transporte, no una decisión: el enum vive en la base y
      // el select de abajo sólo ofrece sus dos valores.
      p_temporada: datos.temporada as 'apertura' | 'clausura',
      ...(datos.ejercicio_id ? { p_ejercicio_id: datos.ejercicio_id } : {}),
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setAbierto(false)
    router.refresh()
  }

  if (!abierto) {
    return (
      <Button size="pill" variant="secondary" icon="editar" onClick={() => setAbierto(true)}>
        Editar
      </Button>
    )
  }

  return (
    <div className="w-full rounded-md border border-line bg-white p-4">
      <h2 className="mb-3 text-[13px] font-extrabold text-ink">Editar el torneo</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Nombre" required>
          <Input
            value={datos.nombre}
            onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
          />
        </Field>
        <Field label="Año" required>
          <Input
            type="number"
            value={datos.anio}
            onChange={(e) => setDatos({ ...datos, anio: Number(e.target.value) })}
          />
        </Field>
        <Field label="Temporada" required>
          <Select
            value={datos.temporada}
            onChange={(e) => setDatos({ ...datos, temporada: e.target.value })}
          >
            <option value="apertura">Apertura</option>
            <option value="clausura">Clausura</option>
          </Select>
        </Field>
        <Field
          label="Ejercicio"
          hint={inicial.ejercicio_id ? undefined : 'Sin asignar. Una vez asignado, no se quita.'}
        >
          <Select
            value={datos.ejercicio_id ?? ''}
            onChange={(e) => setDatos({ ...datos, ejercicio_id: e.target.value || null })}
          >
            {!inicial.ejercicio_id && <option value="">Sin asignar</option>}
            {ejercicios.map((e) => (
              <option key={e.id} value={e.id}>
                {e.anio}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">{error}</p>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          icon="check"
          loading={ocupado}
          disabled={ocupado || !datos.nombre.trim() || !datos.anio}
          onClick={guardar}
        >
          Guardar
        </Button>
        <Button
          variant="tertiary"
          disabled={ocupado}
          onClick={() => {
            setDatos(inicial)
            setAbierto(false)
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
