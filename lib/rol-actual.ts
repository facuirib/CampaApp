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

/**
 * El rol, para AUTORIZAR — que es un trabajo distinto al de `rolActual()`.
 *
 * La diferencia no es estilística. `rolActual()` dibuja, y para dibujar lo
 * correcto es el claim del JWT: es lo que la base va a leer con `auth_rol()`,
 * así que pantalla y policy dicen lo mismo. Acá no hay policy del otro lado
 * —quien llama a esto usa `service_role` o manda un mail—, así que **esta
 * función ES la autorización**, y entonces conviene el dato fresco del
 * servidor de auth: si a alguien le sacan admin, se le cae en el momento y no
 * cuando venza su token.
 *
 * Devuelve el rol o el motivo del rechazo, nunca un booleano suelto: el que
 * llama tiene que poder decirle al usuario por qué no.
 */
export async function exigirRol(
  permitidos: readonly Rol[],
): Promise<{ ok: true; rol: Rol } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a entrar.' }

  const rol = (user.app_metadata as { rol?: string } | undefined)?.rol as Rol | undefined

  // Allowlist positiva, igual que las policies: un rol desconocido —o ninguno—
  // no está en la lista y queda afuera. Un `!==` dejaría pasar el typo.
  if (!rol || !permitidos.includes(rol)) {
    return {
      ok: false,
      error: `No tenés permiso para esta acción. Tu rol es «${rol ?? 'sin rol'}».`,
    }
  }

  return { ok: true, rol }
}
