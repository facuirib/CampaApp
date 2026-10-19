"use client"

import { Button } from '@/components/ui'
import { useCobro } from './CobroProvider'

/**
 * El atajo global: cobrarle a cualquier equipo sin pasar primero por su
 * ficha. Vive arriba del Sidebar, debajo del logo —no en el pie, que es
 * donde estaba `CobroRapido`—, detrás del mismo candado que la pantalla de
 * cobro (`cobro.registrar`): quien no puede cobrar tampoco ve el atajo.
 *
 * Abre `CobroProvider` sin equipo ni torneo: el modal arranca por
 * `BuscadorEquipoCobro` (torneo → equipos con deuda ahí) y recién después
 * entra al formulario — a diferencia de `BotonCobrar`, que ya sabe a quién.
 */
export default function BotonCobroRapido() {
  const { abrir } = useCobro()
  return (
    <Button icon="cobranza" variant="secondary" className="w-full" onClick={() => abrir()}>
      Cobrar
    </Button>
  )
}
