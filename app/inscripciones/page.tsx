import { redirect } from 'next/navigation'

/**
 * Inscripciones se mudó a `/cobranza?vista=inscripciones`.
 *
 * Era un módulo propio, y era la cuarta pantalla que miraba las mismas cuotas
 * del mismo equipo —cuenta corriente, avisos, colas e inscripciones—. La
 * inscripción no es otro dominio: es la primera cuota, la que decide si el
 * equipo entra al torneo. Cobrarla es cobrar.
 */
export default function InscripcionesRedirect() {
  redirect('/cobranza?vista=inscripciones')
}
