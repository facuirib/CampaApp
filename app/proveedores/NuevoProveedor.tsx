"use client"

import { useState } from 'react'
import { Button, Card } from '@/components/ui'
import FormularioProveedor from './FormularioProveedor'

/** El alta, desplegable desde la lista. */
export default function NuevoProveedor() {
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <Button icon="plus" onClick={() => setAbierto(true)}>
        Nuevo proveedor
      </Button>
    )
  }

  return (
    <Card className="w-full">
      <h2 className="mb-3 text-[13px] font-extrabold text-ink">Nuevo proveedor</h2>
      <FormularioProveedor onListo={() => setAbierto(false)} />
      <div className="mt-2">
        <Button variant="tertiary" size="pill" onClick={() => setAbierto(false)}>
          Cerrar
        </Button>
      </div>
    </Card>
  )
}
