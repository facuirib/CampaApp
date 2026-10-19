"use client"

import { Button, type ButtonProps } from '@/components/ui'
import { useCobro } from './CobroProvider'

export interface BotonCobrarProps extends Omit<ButtonProps, 'onClick' | 'type'> {
  /** El equipo al que se le va a cobrar. Entra derecho al formulario. */
  terceroId: string
  /**
   * El torneo ya filtrado en la pantalla de origen, si hay uno. Es sólo el
   * default: si el equipo no debe ahí, `FormularioCobro` cae en su propia
   * prioridad (torneo en curso, después el único que tenga).
   */
  torneoId?: string | null
}

/**
 * El botón "Cobrar" de cualquier pantalla —Cobranza, Inscripciones, la
 * ficha del equipo—, con la ropa de `Button` de siempre.
 *
 * Ya no navega a `/equipos/[id]/cobrar`: abre el modal global de
 * `CobroProvider`, con el equipo (y el torneo, si se conoce) puestos. La
 * ruta sigue viva para quien entra por un link directo —un bookmark, un
 * mail—, pero el flujo de uso diario pasa por acá.
 */
export default function BotonCobrar({ terceroId, torneoId, ...props }: BotonCobrarProps) {
  const { abrir } = useCobro()
  return <Button {...props} onClick={() => abrir({ terceroId, torneoId: torneoId ?? undefined })} />
}
