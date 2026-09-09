"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button, Field, Input } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type Genero = Database['public']['Enums']['genero']
type Concepto = Database['public']['Enums']['concepto_pago']

/**
 * Crear una opción de pago nueva en el tarifario de un torneo.
 *
 * La pieza que faltaba para cerrar el ciclo: `crear_plan_tarifa` existía en la
 * base desde el principio y ninguna pantalla la llamaba — los planes nacían por
 * seed o por clonado, y un torneo creado sin «Opción cuotas» no podía ganarla
 * nunca. Encontrado por Facu queriendo agregarle justamente esa opción al
 * Apertura 2027.
 *
 * La opción nace VACÍA: las líneas se cargan después con el editor que ya
 * existía («Editar precios»). Crear y cargar son dos gestos porque el editor de
 * líneas ya resuelve bien el segundo — duplicarlo acá sería tener dos editores
 * de lo mismo.
 */
export default function NuevaOpcion({
  torneoId,
  genero,
  concepto,
}: {
  torneoId: string
  genero: Genero
  concepto: Concepto
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function crear() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('crear_plan_tarifa', {
      p_torneo_id: torneoId,
      p_genero: genero,
      p_concepto: concepto,
      p_opcion_nombre: nombre,
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setNombre('')
    setAbierto(false)
    router.refresh()
  }

  if (!abierto) {
    return (
      <div className="mt-2">
        <Button size="pill" variant="secondary" icon="plus" onClick={() => setAbierto(true)}>
          Nueva opción
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-md border border-line bg-white p-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_auto] sm:items-end">
        <Field
          label="Nombre de la opción"
          required
          hint="Cómo la va a ver quien inscribe: «Pago único», «Cuotas», «Por fecha»."
        >
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Cuotas"
          />
        </Field>
        <div className="flex gap-2 pb-1">
          <Button
            icon="check"
            loading={ocupado}
            disabled={ocupado || !nombre.trim()}
            onClick={crear}
          >
            Crear
          </Button>
          <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
        </div>
      </div>
      <p className="mt-2 text-[10.5px] leading-snug text-muted">
        La opción nace vacía y sin líneas no genera cuotas. Cargale las líneas con «Editar
        precios» — y recién la van a poder elegir las fichas que se creen desde entonces:{' '}
        <strong className="font-semibold">las cuotas ya generadas nunca se recalculan.</strong>
      </p>
      {error && <p className="mt-2 text-[11px] text-errtx">{error}</p>}
    </div>
  )
}
