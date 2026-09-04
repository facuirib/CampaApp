"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Field, Input } from '@/components/ui'
import { crearProveedor, guardarProveedor, type DatosProveedor } from './acciones'

const VACIO: DatosProveedor = {
  nombre: '',
  razon_social: null,
  cuit: null,
  domicilio: null,
  email: null,
  contacto: null,
}

/**
 * Alta y edición de un proveedor, en el mismo formulario.
 *
 * ── Sólo el nombre es obligatorio ─────────────────────────────────────────
 *
 * Lo demás es fiscal y se completa cuando llega la factura. Exigir CUIT en el
 * alta convertiría «cargá el gasto del árbitro» en «conseguí el CUIT del
 * árbitro», y el gasto quedaría sin cargar — que es peor que un proveedor a
 * medio completar.
 */
export default function FormularioProveedor({
  id,
  inicial,
  onListo,
  compacto = false,
}: {
  /** Sin id es un alta. */
  id?: string
  inicial?: DatosProveedor
  /** Para el uso embebido: qué hacer con el proveedor recién creado. */
  onListo?: (id: string, nombre: string) => void
  /** Menos campos y sin navegación: para el modal desde gasto o activo. */
  compacto?: boolean
}) {
  const router = useRouter()
  const [datos, setDatos] = useState<DatosProveedor>(inicial ?? VACIO)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const set = (k: keyof DatosProveedor, v: string) =>
    setDatos((d) => ({ ...d, [k]: v }))

  async function guardar() {
    if (!datos.nombre.trim()) return setError('El proveedor necesita un nombre.')
    setOcupado(true)
    setError(null)
    setAviso(null)

    const r = id ? await guardarProveedor(id, datos) : await crearProveedor(datos)
    setOcupado(false)

    if (!r.ok) return setError(r.error ?? 'No se pudo guardar.')

    if (onListo && r.id) {
      onListo(r.id, datos.nombre.trim())
      setDatos(VACIO)
      return
    }
    setAviso(id ? 'Proveedor guardado.' : 'Proveedor creado.')
    if (!id) setDatos(VACIO)
    router.refresh()
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" required className="sm:col-span-2">
          <Input
            value={datos.nombre}
            onChange={(e) => set('nombre', e.target.value)}
            placeholder="Árbitros AFA · Ferretería del Centro"
          />
        </Field>

        {!compacto && (
          <>
            <Field label="Razón social" hint="Como figura en la factura.">
              <Input value={datos.razon_social ?? ''} onChange={(e) => set('razon_social', e.target.value)} />
            </Field>
            <Field label="CUIT">
              <Input value={datos.cuit ?? ''} onChange={(e) => set('cuit', e.target.value)} />
            </Field>
            <Field label="Domicilio">
              <Input value={datos.domicilio ?? ''} onChange={(e) => set('domicilio', e.target.value)} />
            </Field>
          </>
        )}

        <Field label="Email">
          <Input value={datos.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Contacto" hint="Teléfono o con quién se habla.">
          <Input value={datos.contacto ?? ''} onChange={(e) => set('contacto', e.target.value)} />
        </Field>
      </div>

      {error && <p className="mt-3 rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">{error}</p>}
      {aviso && <p className="mt-3 rounded-md bg-okbg px-3 py-2 text-[11px] text-oktx">{aviso}</p>}

      <div className="mt-4">
        <Button icon="check" loading={ocupado} disabled={ocupado || !datos.nombre.trim()} onClick={guardar}>
          {id ? 'Guardar' : 'Crear proveedor'}
        </Button>
      </div>
    </div>
  )
}
