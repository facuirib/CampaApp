"use client"

import { Button } from '@/components/ui'
import { useGasto } from './GastoProvider'

/**
 * El atajo global de gasto, espejo de `BotonCobroRapido`: cargar un gasto sin
 * ir a /gastos/nuevo. Vive debajo de «Cobrar» en el Sidebar, detrás del mismo
 * candado que esa pantalla (`gasto.registrar`: admin · operador · finanzas) —
 * quien no puede gastar tampoco ve el atajo.
 */
export default function BotonGastoRapido() {
  const { abrir } = useGasto()
  return (
    <Button icon="comprobante" variant="secondary" className="w-full" onClick={abrir}>
      Agregar gasto
    </Button>
  )
}
