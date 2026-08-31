import { Card } from '@/components/ui'
import FormularioFiscal, { type CondicionIva } from '../FormularioFiscal'
import type { DatosFiscales } from '../acciones'

export type { CondicionIva }

export interface FichaClienteProps {
  terceroId: string
  nombre: string
  tipo: string
  condiciones: CondicionIva[]
  inicial: DatosFiscales
  /**
   * Si el rol puede editar. Baja RESUELTO desde la Server Page —booleano, no el
   * rol— porque quién puede qué ya se decidió en `lib/permisos` y está
   * verificado contra la policy de `tercero`. Repetir esa decisión acá es la
   * forma más silenciosa de que las dos se separen.
   *
   * Y esto ESCONDE, no protege: quien mande el POST igual se topa con RLS.
   */
  puedeEditar: boolean
}

/**
 * La ficha fiscal de un cliente — wrapper de página sobre FormularioFiscal.
 *
 * El formulario en sí vive en app/equipos/FormularioFiscal.tsx porque lo usa
 * también el modal de comprobantes; acá queda solo el Card de esta pantalla.
 */
export default function FichaCliente(props: FichaClienteProps) {
  return (
    <Card>
      <FormularioFiscal {...props} />
    </Card>
  )
}
