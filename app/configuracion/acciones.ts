'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { obligatoriosPorCuerpo } from '@/lib/reclamo/plantilla'

/**
 * Guardar una plantilla.
 *
 * Es configuración, no un movimiento: escribe `plantilla_mail` y no genera
 * asiento. Pero pasa por el servidor igual, por dos motivos que sí importan:
 * la sesión se valida acá, y las validaciones se repiten del lado del servidor.
 *
 * Lo segundo no es desconfianza del formulario: la pantalla ya avisa y
 * deshabilita el botón. Es que una plantilla sin `{{detalle}}` manda reclamos
 * que no dicen qué se debe, y esa garantía no puede depender de que el único
 * camino a la escritura sea el formulario.
 */

export interface Resultado {
  ok: boolean
  error?: string
}

export async function guardarPlantilla(
  clave: string,
  campos: { asunto: string; cuerpo: string; cuerpo_texto: string | null },
): Promise<Resultado> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Hoy alcanza con estar logueado. Cuando existan roles, editar configuración
  // debería ser de admin: acá es donde un usuario cualquiera puede cambiar lo
  // que se le manda a 300 equipos en nombre de CAMPA.
  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a entrar.' }

  // Cada cuerpo se valida SOLO, no los dos concatenados.
  //
  // Concatenados, un `{{detalle}}` presente en el texto de WhatsApp tapaba su
  // ausencia en el HTML del mail: la validación pasaba y se guardaba un mail
  // que no dice qué cuotas se deben. No es hipotético — así se rompió la
  // plantilla en la prueba de esta pantalla.
  //
  // Son dos mensajes distintos que van por dos canales distintos: cada uno
  // tiene que estar completo por su cuenta.
  const faltan = obligatoriosPorCuerpo(campos)
  const lista = (ps: string[]) => ps.map((f) => `{{${f}}}`).join(', ')

  if (faltan.cuerpo.length > 0) {
    return { ok: false, error: `Falta ${lista(faltan.cuerpo)} en el cuerpo del mail.` }
  }
  if (faltan.cuerpo_texto.length > 0) {
    return { ok: false, error: `Falta ${lista(faltan.cuerpo_texto)} en el cuerpo de WhatsApp.` }
  }

  const { error } = await supabase
    .from('plantilla_mail')
    .update({
      asunto: campos.asunto,
      cuerpo: campos.cuerpo,
      cuerpo_texto: campos.cuerpo_texto,
      // Las dos juntas, acá y no en un trigger: `auth.uid()` en la base es
      // null cuando la escritura no viene de una sesión, y una fecha sin autor
      // es justo la mitad que no sirve. Este Server Action es el único camino
      // de edición y sí tiene el usuario a mano.
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('clave', clave)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracion/plantillas')
  // Las pantallas de reclamo leen la plantilla al renderizar.
  revalidatePath('/reclamos', 'layout')

  return { ok: true }
}
