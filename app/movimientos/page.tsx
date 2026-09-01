import { redirect } from 'next/navigation'

/**
 * El libro diario se mudó a `/auditoria?vista=diario`.
 *
 * Contestaba la misma pregunta que Auditoría desde otro ángulo —quién tocó
 * qué—, y separados obligaban a mirar en dos lados y cruzar a mano para saber
 * si alguien anduvo en algo.
 */
export default function MovimientosRedirect() {
  redirect('/auditoria?vista=diario')
}
