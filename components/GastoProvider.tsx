"use client"

import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui'
import FormularioGasto from '@/app/gastos/nuevo/FormularioGasto'

interface GastoContextValue {
  abrir: () => void
}

const GastoContext = createContext<GastoContextValue | null>(null)

/** `useGasto().abrir()` desde cualquier pantalla — ver `useCobro`, es el mismo patrón. */
export function useGasto(): GastoContextValue {
  const ctx = useContext(GastoContext)
  if (!ctx) throw new Error('useGasto() necesita <GastoProvider> en un ancestro.')
  return ctx
}

/**
 * El modal para agregar un gasto, UNA sola vez para toda la app.
 *
 * Es la réplica de `CobroProvider` para el otro lado del mostrador: cobrar ya
 * tenía su atajo global y cargar un gasto obligaba a ir a /gastos/nuevo. El
 * formulario es EL MISMO componente de esa página (`FormularioGasto`, con el
 * torneo corriente preseleccionado y «Sin torneo…» para estructura) — acá
 * solo se le da un segundo lugar donde montarse, no una segunda copia.
 *
 * Más simple que el de cobro a propósito: no hay fase de búsqueda —el gasto
 * no necesita elegir a quién— así que el estado es abierto/cerrado y nada
 * más. Y el fondo NO cierra: a diferencia del buscador de equipos, acá hay
 * datos tipeados desde el primer campo, y un click fuera de foco no tiene
 * que tirarlos. Se cierra con la cruz o con «Cerrar».
 */
export default function GastoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)

  function cerrar() {
    setAbierto(false)
    // Mismo trade-off que el modal de cobro: el formulario no avisa si hubo
    // un gasto registrado, así que se refresca siempre al cerrar — lo que
    // esté detrás (la lista de gastos, el dashboard) deja de mostrar viejo.
    router.refresh()
  }

  const modal = abierto && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-md bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-extrabold text-ink">Gasto</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="text-muted hover:text-ink">
            <Icon name="cerrar" size={18} />
          </button>
        </div>

        <FormularioGasto onCerrar={cerrar} />
      </div>
    </div>
  )

  return (
    <GastoContext.Provider value={{ abrir: () => setAbierto(true) }}>
      {children}
      {/* `createPortal` a `document.body`, por lo mismo que CobroProvider:
          ancestros con overflow/sticky no tienen que recortar el modal. */}
      {modal && createPortal(modal, document.body)}
    </GastoContext.Provider>
  )
}
