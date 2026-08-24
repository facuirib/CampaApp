import { createClient } from '@/lib/db/server'
import type { Rol } from '@/lib/roles'

/**
 * El rol del usuario logueado, del lado del servidor.
 *
 * Sale de `app_metadata`, que viaja **dentro del JWT**: no hay consulta a la
 * base ni round-trip: el rol ya está en la sesión que el middleware validó.
 *
 * Devuelve `null` cuando no hay sesión o cuando el usuario no tiene rol
 * asignado. Las dos cosas se tratan igual a propósito: un usuario sin rol no
 * puede escribir nada —las policies usan una allowlist, y `NULL` no está en
 * ninguna lista— así que para la UI es indistinguible de no estar logueado.
 *
 * ⚠️ Esto es para DIBUJAR, no para autorizar. Quien decide si una escritura
 * ocurre es la policy en la base, que corre con el JWT real y no con lo que el
 * navegador diga. Ocultar un botón mejora la pantalla; no protege una tabla.
 */
export async function rolActual(): Promise<Rol | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const rol = (user.app_metadata as { rol?: string } | undefined)?.rol
  return (rol as Rol | undefined) ?? null
}

/** Si el rol puede escribir. Hoy: todos menos `read-only` y los que no tienen. */
export function puedeEscribir(rol: Rol | null): boolean {
  return rol === 'admin' || rol === 'operador' || rol === 'bar'
}
