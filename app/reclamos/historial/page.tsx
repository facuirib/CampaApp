import { redirect } from 'next/navigation'

/** El historial de comunicación vive dentro de cobranza. */
export default function HistorialRedirect() {
  redirect('/cobranza/avisos/historial')
}
