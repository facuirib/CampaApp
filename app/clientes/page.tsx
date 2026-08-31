import { redirect } from 'next/navigation'

/**
 * `/clientes` se mudó a `/equipos`.
 *
 * El nombre cambió porque la pantalla cambió de sujeto: «cliente» es un ROL
 * —a quién le facturo— y el sponsor también lo tiene. `equipo` es la ENTIDAD,
 * y es la que tiene serie, torneos y deuda. Los sponsors tienen `/sponsors`.
 *
 * Queda el redirect y no un 404 porque la URL vieja está en marcadores y en
 * links de esta misma app que todavía no se rastrearon todos.
 */
export default function ClientesRedirect() {
  redirect('/equipos')
}
