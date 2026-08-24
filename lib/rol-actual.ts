import { createClient } from '@/lib/db/server'
import type { Rol } from '@/lib/roles'

/**
 * El rol del usuario logueado, para DIBUJAR.
 *
 * Sale del **claim del JWT**, y esa es la parte que importa: `auth_rol()` en la
 * base lee exactamente ese claim. Leyendo lo mismo, pantalla y policy no pueden
 * discrepar — el botón que se muestra es el que la base va a aceptar.
 *
 * Con `getUser()` sí podían. `getUser()` va al servidor de auth y trae el
 * registro **fresco**, así que en la ventana entre un cambio de rol y la
 * renovación del token —hasta una hora— devolvía el rol nuevo mientras la base
 * seguía decidiendo con el viejo: justo el botón que falla que esta fase viene
 * a sacar. Para dibujar, el claim no es una versión peor de la verdad; es la
 * verdad operativa.
 *
 * Devuelve `null` cuando no hay sesión o cuando el usuario no tiene rol. Las
 * dos cosas se tratan igual a propósito: un usuario sin rol no puede escribir
 * nada —las policies usan allowlist y `NULL` no está en ninguna lista— así que
 * para la UI es indistinguible de no estar logueado.
 *
 * ⚠️ Esto es para DIBUJAR, no para autorizar. Quien decide si una escritura
 * ocurre es la policy, que corre con el JWT real y no con lo que el navegador
 * diga. Ocultar un botón mejora la pantalla; no protege una tabla. Para
 * autorizar de verdad —lo que esquiva RLS— está `exigirRol()`, más abajo.
 */
export async function rolActual(): Promise<Rol | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  const rol = (data?.claims.app_metadata as { rol?: string } | undefined)?.rol
  return (rol as Rol | undefined) ?? null
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
