import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import ArmarReclamo from './ArmarReclamo'

/**
 * Server Component delgado: resuelve el rol y baja los dos permisos.
 *
 * La pantalla es MIXTA y por eso no va a `RUTAS_PROTEGIDAS`: la situación del
 * equipo —cuánto debe, qué cuotas están vencidas, qué se le reclamó antes— es
 * lectura, y `read-only` la conserva entera. Lo que se esconde es mandar.
 *
 * Dos permisos y no uno porque en la base también son dos: registrar el
 * reclamo lo cubre la policy de `reclamo`, y mandar el mail no lo cubre
 * ninguna —Resend no pasa por RLS— así que lo frena el `exigirRol` de la
 * Server Action.
 */
export default async function ArmarReclamoPage({
  params,
}: {
  params: Promise<{ terceroId: string }>
}) {
  const { terceroId } = await params
  const rol = await rolActual()

  return (
    <ArmarReclamo
      terceroId={terceroId}
      puedeRegistrar={puede(rol, 'reclamo.registrar')}
      puedeMail={puede(rol, 'reclamo.mail')}
    />
  )
}
