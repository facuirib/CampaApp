'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, ROLES, type Rol } from '@/lib/db/admin'
import { exigirRol } from '@/lib/rol-actual'

/**
 * La gestión de usuarios, del lado del servidor.
 *
 * Vive acá y no en la pantalla por la misma razón que el envío de reclamos:
 * `SUPABASE_SERVICE_ROLE_KEY` es un secreto, y este es peor que el de Resend —
 * saltea RLS entero. Cualquier cosa que lo toque desde un componente cliente
 * termina en el bundle que baja el navegador.
 *
 * **Cada acción exige admin acá adentro, y ese `if` ES la seguridad.** Una
 * Server Action es un POST con un id que viaja en el bundle: se la puede llamar
 * sin pasar por la pantalla, así que esconder el menú no cierra nada. Y como
 * `service_role` no pasa por ninguna policy, no hay una segunda línea atrás
 * que ataje lo que se escape de acá.
 *
 * Hasta el 24/08 estas dos chequeaban sólo que hubiera sesión — o sea que
 * cualquier usuario logueado podía llamar a `cambiarRol` y hacerse admin.
 */

interface Resultado {
  ok: boolean
  error?: string
}

function esRolValido(rol: string): rol is Rol {
  return (ROLES as readonly string[]).includes(rol)
}

export async function cambiarRol(userId: string, rol: string): Promise<Resultado> {
  // Primero de todo, antes de construir el cliente admin: repartir permisos es
  // la operación que más manda de todas — con ésta se consiguen las demás.
  const permiso = await exigirRol(['admin'])
  if (!permiso.ok) return { ok: false, error: `Cambiar roles es de administrador. ${permiso.error}` }

  if (!esRolValido(rol)) return { ok: false, error: `Rol desconocido: «${rol}».` }

  const admin = createAdminClient()

  // Se lee el metadata actual y se le SUMA el rol, no se reemplaza:
  // `raw_app_meta_data` guarda además `provider` y `providers`, que usa GoTrue
  // para el login. Pisarlo entero deja al usuario sin poder entrar.
  const { data: actual, error: errLeer } = await admin.auth.admin.getUserById(userId)
  if (errLeer) return { ok: false, error: errLeer.message }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...actual.user.app_metadata, rol },
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracion/usuarios')
  return { ok: true }
}

export async function invitar(email: string, rol: string): Promise<Resultado> {
  // Invitar es cambiarRol con un paso previo: crea la cuenta Y le pone el rol.
  const permiso = await exigirRol(['admin'])
  if (!permiso.ok) return { ok: false, error: `Invitar usuarios es de administrador. ${permiso.error}` }

  if (!esRolValido(rol)) return { ok: false, error: `Rol desconocido: «${rol}».` }

  const limpio = email.trim().toLowerCase()
  if (!limpio || !limpio.includes('@')) return { ok: false, error: 'El email no es válido.' }

  const admin = createAdminClient()

  // ── Dos pasos, y el segundo no es opcional ──────────────────────────────
  //
  // El `data` de `inviteUserByEmail` va a **`user_metadata`**, que es el campo
  // que el propio usuario puede editar desde el cliente con `updateUser()`. Un
  // rol ahí es un permiso que su portador puede subirse solo.
  //
  // Por eso se invita primero y se escribe el rol después, en `app_metadata`,
  // que solo `service_role` toca. Es la razón por la que elegimos ese campo y
  // no el otro: si el rol viviera donde el usuario llega, no sería un permiso.
  const { data: invitado, error } = await admin.auth.admin.inviteUserByEmail(limpio)
  if (error) return { ok: false, error: error.message }

  const { error: errRol } = await admin.auth.admin.updateUserById(invitado.user.id, {
    app_metadata: { ...invitado.user.app_metadata, rol },
  })
  if (errRol) {
    // El usuario quedó creado pero sin rol. Se dice, en vez de devolver ok:
    // un usuario sin rol es uno que va a poder entrar y no va a poder hacer
    // nada, y quien invitó tiene que saber que le falta un paso.
    return {
      ok: false,
      error:
        `Se envió la invitación a ${limpio}, pero no se le pudo asignar el rol ` +
        `(${errRol.message}). Asignáselo desde la lista cuando aparezca.`,
    }
  }

  revalidatePath('/configuracion/usuarios')
  return { ok: true }
}

/**
 * Editar un usuario: estado, nombre y apellido.
 *
 * El rol NO se toca acá — para eso está `cambiarRol`, que ya existe y tiene su
 * propia advertencia sobre por qué `app_metadata` no se pisa entero. Dos
 * puertas y no una porque son dos cosas distintas: nombre y apellido son datos
 * de la persona; el rol es un permiso, y la operación que más manda de todas.
 *
 * ── Nombre y apellido NO necesitan columnas ───────────────────────────────
 *
 * Los usuarios viven en `auth.users` y no hay tabla propia. El nombre va a
 * `user_metadata`, que es exactamente para esto: **datos del usuario que el
 * usuario puede ver y editar de sí mismo**. El rol, en cambio, vive en
 * `app_metadata` justamente porque ahí NO puede tocarlo —un rol en
 * `user_metadata` sería un permiso que su portador se sube solo—.
 *
 * Esa distinción ya está tomada y documentada en `invitar()`; acá se respeta.
 *
 * ── El estado es un baneo, no una baja ────────────────────────────────────
 *
 * Desactivar es `ban_duration`, que impide entrar y deja la cuenta y toda su
 * historia en pie. Borrar un usuario dejaría los asientos que creó apuntando a
 * un id que no existe: la autoría del diario no se reasigna (regla del
 * proyecto).
 */
export async function editarUsuario(
  userId: string,
  campos: { nombre: string; apellido: string; activo: boolean },
): Promise<Resultado> {
  const permiso = await exigirRol(['admin'])
  if (!permiso.ok) return { ok: false, error: `Editar usuarios es de administrador. ${permiso.error}` }

  const admin = createAdminClient()

  const { data: actual, error: errLeer } = await admin.auth.admin.getUserById(userId)
  if (errLeer) return { ok: false, error: errLeer.message }

  // Mismo cuidado que en `cambiarRol`: se SUMA al metadata, no se reemplaza.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...actual.user.user_metadata,
      nombre: campos.nombre.trim(),
      apellido: campos.apellido.trim(),
    },
    // '0s' levanta el baneo; 'none' no existe en la API y deja el baneo puesto
    // en silencio, que es la clase de error que nadie nota hasta que alguien
    // no puede entrar.
    ban_duration: campos.activo ? '0s' : '876000h',
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracion/usuarios')
  return { ok: true }
}
