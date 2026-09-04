"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button } from '@/components/ui'

/**
 * Eliminar un torneo — o darlo de baja, si eliminarlo no se puede.
 *
 * ── 🔴 El botón se llama como lo que VA A PASAR ───────────────────────────
 *
 * `borrar_torneo` borra de verdad sólo si el torneo está planificado, no tiene
 * cuotas y nada lo referencia. Si alguno de los tres frena, no falla: lo da de
 * baja lógica.
 *
 * Un botón que dijera «Eliminar» sobre un torneo en curso mentiría dos veces:
 * promete lo que no hace, y esconde que existe otra acción —la baja— que sí
 * funciona y que probablemente sea la que el operador quiere.
 *
 * Por eso el rótulo sale de `impideBorrar`, que la vista calcula con las MISMAS
 * condiciones que la función. Y cuando no se puede borrar, la razón se muestra
 * **antes** de abrir el diálogo: enterarse de que «tiene 273 cuotas» después de
 * confirmar es enterarse tarde.
 *
 * ── La confirmación ───────────────────────────────────────────────────────
 *
 * Sólo para el borrado real, que es el irreversible. La baja lógica no la pide:
 * se deshace poniendo `activo` de nuevo en true, y pedir confirmación para algo
 * reversible entrena a confirmar sin leer.
 */
export default function EliminarTorneo({
  torneoId,
  nombre,
  impideBorrar,
}: {
  torneoId: string
  nombre: string
  /** Lo que impide el borrado real. Vacío = se borra de verdad. */
  impideBorrar: string[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ resultado: string; motivo: string } | null>(null)

  const seBorra = impideBorrar.length === 0

  async function ejecutar() {
    setOcupado(true)
    setError(null)
    const { data, error: err } = await createClient().rpc('borrar_torneo', {
      p_torneo_id: torneoId,
    })
    setOcupado(false)
    if (err) return setError(err.message)

    const r = data as unknown as { resultado: string; motivo: string }
    if (r.resultado === 'borrado') {
      // El torneo ya no existe: quedarse en su ficha daría un 404.
      router.push('/torneos')
      return
    }
    // Baja lógica: se queda y muestra por qué no se pudo borrar.
    setResultado(r)
    setAbierto(false)
    router.refresh()
  }

  if (resultado) {
    return (
      <div className="rounded-md bg-warnbg px-4 py-3">
        <p className="text-[11.5px] font-bold text-warntx">El torneo quedó dado de baja.</p>
        <p className="mt-1 text-[11px] leading-snug text-warntx">{resultado.motivo}</p>
        <p className="mt-1.5 text-[11px] leading-snug text-warntx">
          No se borró, pero ya no aparece como activo. Sus datos siguen enteros.
        </p>
      </div>
    )
  }

  if (!abierto) {
    return (
      <div>
        <Button
          size="pill"
          variant="tertiary"
          icon="borrar"
          loading={ocupado}
          disabled={ocupado}
          onClick={() => (seBorra ? setAbierto(true) : ejecutar())}
        >
          {seBorra ? 'Eliminar torneo' : 'Dar de baja'}
        </Button>

        {/* La razón, ANTES del click. Enterarse de que «tiene 273 cuotas»
            después de confirmar es enterarse tarde. */}
        {!seBorra && (
          <p className="mt-2 max-w-prose text-[10.5px] leading-snug text-muted">
            No se puede eliminar: {impideBorrar.join(' · ')}. Se puede dar de baja, que lo saca de
            las listas sin tocar sus datos.
          </p>
        )}

        {error && <p className="mt-2 text-[11px] text-errtx">{error}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-md border border-err bg-errbg p-4">
      <p className="text-[12px] font-bold text-errtx">Eliminar «{nombre}»</p>
      <p className="mt-1 max-w-prose text-[11px] leading-snug text-errtx">
        Se van a borrar el torneo, sus categorías y series, su calendario, su tarifario y sus
        fichas. <strong className="font-bold">Esto no se puede deshacer.</strong>
      </p>

      {error && (
        <p className="mt-3 rounded-md bg-white px-3 py-2 text-[11px] leading-relaxed text-errtx">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button icon="borrar" loading={ocupado} disabled={ocupado} onClick={ejecutar}>
          Eliminar torneo
        </Button>
        <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
