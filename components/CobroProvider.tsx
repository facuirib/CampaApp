"use client"

import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui'
import FormularioCobro from '@/app/equipos/[terceroId]/cobrar/FormularioCobro'
import BuscadorEquipoCobro from './BuscadorEquipoCobro'

interface AbrirOpciones {
  /** Con equipo ya elegido, el modal entra directo al formulario. */
  terceroId?: string
  /** El torneo que ya se sabe —viene de dónde se abrió—, o ninguno. */
  torneoId?: string
}

interface EstadoCobro {
  terceroId: string | null
  torneoId: string | null
}

interface CobroContextValue {
  abrir: (opciones?: AbrirOpciones) => void
}

const CobroContext = createContext<CobroContextValue | null>(null)

/**
 * `useCobro().abrir(...)` desde cualquier pantalla, server o client.
 *
 * El componente que llama a `abrir` tiene que ser Client (`BotonCobrar`,
 * `BotonCobroRapido`) — eso no cambia—, pero la PANTALLA que lo monta puede
 * seguir siendo Server Component: el botón es la única parte que necesita
 * `"use client"`, igual que ya pasaba con cualquier otro control de
 * formulario de este sistema.
 */
export function useCobro(): CobroContextValue {
  const ctx = useContext(CobroContext)
  if (!ctx) throw new Error('useCobro() necesita <CobroProvider> en un ancestro.')
  return ctx
}

/**
 * El modal de cobro, UNA sola vez para toda la app.
 *
 * ── Por qué un solo mount y no uno por botón ─────────────────────────────
 *
 * Antes, `CobroRapido` montaba su propio modal con su propia copia de
 * `FormularioCobro`. Funcionaba porque sólo existía un botón (el del pie del
 * Sidebar). Ahora "Cobrar" se abre desde media docena de pantallas —
 * Cobranza, Inscripciones, la ficha del equipo, el atajo del Sidebar— y cada
 * una NO puede traer su propio modal: aparte de duplicar el código,
 * `createPortal` a `document.body` desde dos botones a la vez abriría dos
 * capas superpuestas si alguien pudiera disparar ambas. Con un solo estado
 * acá arriba, cualquier botón sólo pide "abrí con estos datos" y hay un
 * único modal que decide qué mostrar.
 *
 * ── Qué pantalla muestra, según lo que `abrir` recibió ───────────────────
 *
 * Con `terceroId` (viene de una fila con equipo conocido: Cobranza,
 * Inscripciones, la ficha) entra derecho a `FormularioCobro` — el `torneoId`,
 * si vino, es sólo el default que ya conoce `FormularioCobro` (prioridad:
 * explícito > torneo en curso si debe ahí > el único que tenga).
 *
 * Sin `terceroId` (el atajo del Sidebar, sin equipo previo) primero hay que
 * encontrar a quién cobrarle: `BuscadorEquipoCobro` pide torneo y lista los
 * equipos con deuda ahí. Elegido el equipo, se completa el mismo estado y el
 * modal pasa a mostrar `FormularioCobro` — nunca dos componentes a la vez.
 */
export default function CobroProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [estado, setEstado] = useState<EstadoCobro | null>(null)

  function abrir(opciones: AbrirOpciones = {}) {
    setEstado({ terceroId: opciones.terceroId ?? null, torneoId: opciones.torneoId ?? null })
  }

  function cerrar() {
    setEstado(null)
    // Mismo trade-off que tenía CobroRapido: FormularioCobro no avisa si
    // hubo un cobro exitoso —es el mismo componente de la página de
    // siempre, sin props de más—, así que se refresca siempre al cerrar. Si
    // no pasó nada es un refresh de más; si pasó, lo que esté detrás (una
    // lista de deudores, por ejemplo) deja de mostrar la deuda vieja.
    router.refresh()
  }

  function elegirEquipo(terceroId: string) {
    setEstado((prev) => (prev ? { ...prev, terceroId } : prev))
  }

  function clicDeFondo() {
    // Mientras se busca el equipo, el fondo cierra como cualquier modal
    // liviano. Elegido el equipo —o si ya se abrió con uno— hay datos
    // tipeados (monto, medio, cheque…) y un click fuera de foco no tiene
    // que tirarlos.
    if (estado?.terceroId) return
    cerrar()
  }

  const modal = estado && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={clicDeFondo}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-md bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-extrabold text-ink">Cobro</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="text-muted hover:text-ink">
            <Icon name="cerrar" size={18} />
          </button>
        </div>

        {estado.terceroId ? (
          <FormularioCobro
            terceroId={estado.terceroId}
            torneoInicial={estado.torneoId}
            onCerrar={cerrar}
          />
        ) : (
          <BuscadorEquipoCobro torneoInicial={estado.torneoId} onElegirEquipo={elegirEquipo} />
        )}
      </div>
    </div>
  )

  return (
    <CobroContext.Provider value={{ abrir }}>
      {children}
      {/* `createPortal` a `document.body`: igual motivo que tenía
          CobroRapido — el Sidebar y varias pantallas tienen ancestros con
          `overflow`/`sticky`, y el modal necesita cubrir la pantalla
          entera, no quedar recortado por ninguno de ellos. Seguro para SSR:
          `estado` nace en `null` y sólo lo pone un click, que no existe
          hasta que el componente ya está montado en el browser. */}
      {modal && createPortal(modal, document.body)}
    </CobroContext.Provider>
  )
}
