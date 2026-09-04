"use client"

import { useState } from 'react'
import { Button, Field, Select } from '@/components/ui'
import FormularioProveedor from './FormularioProveedor'

export interface ProveedorOpcion {
  id: string
  nombre: string
}

/**
 * Elegir un proveedor, o crearlo sin salir de la pantalla.
 *
 * ── Por qué inline y no un link a /proveedores ────────────────────────────
 *
 * El proveedor se descubre EN EL MOMENTO de cargar el gasto: llegó la factura
 * de alguien que no está en la lista. Mandar al operador a otra pantalla
 * significa perder el formulario a medio llenar, o abrir otra pestaña y volver.
 * En la práctica el resultado es que el gasto se carga sin proveedor —que es
 * exactamente lo que pasó: 16 gastos, ninguno con proveedor.
 *
 * El alta embebida pide sólo lo mínimo (`compacto`): nombre, email y contacto.
 * Lo fiscal se completa después en su ficha, cuando llega la factura.
 */
export default function SelectorProveedor({
  proveedores,
  valor,
  onChange,
  puedeCrear,
  label = 'Proveedor',
  hint,
}: {
  proveedores: ProveedorOpcion[]
  valor: string
  onChange: (id: string) => void
  puedeCrear: boolean
  label?: string
  hint?: string
}) {
  const [creando, setCreando] = useState(false)
  const [nuevos, setNuevos] = useState<ProveedorOpcion[]>([])

  const lista = [...proveedores, ...nuevos]

  if (creando) {
    return (
      <div className="rounded-md border border-line bg-white p-3">
        <p className="mb-3 text-[12px] font-bold text-ink">Nuevo proveedor</p>
        <FormularioProveedor
          compacto
          onListo={(id, nombre) => {
            // Se agrega a la lista y se elige solo: crear un proveedor y
            // después tener que buscarlo sería la mitad del favor.
            setNuevos((n) => [...n, { id, nombre }])
            onChange(id)
            setCreando(false)
          }}
        />
        <div className="mt-2">
          <Button variant="tertiary" size="pill" onClick={() => setCreando(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Select value={valor} onChange={(e) => onChange(e.target.value)} className="flex-1">
          <option value="">Sin proveedor</option>
          {lista.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
        {puedeCrear && (
          <Button size="pill" variant="secondary" icon="plus" onClick={() => setCreando(true)}>
            Nuevo
          </Button>
        )}
      </div>
    </Field>
  )
}
