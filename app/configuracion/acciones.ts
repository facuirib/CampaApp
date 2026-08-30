'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { exigirRol } from '@/lib/rol-actual'
import { PERMISOS } from '@/lib/permisos'
import { obligatoriosPorCuerpo, type ClavePlantilla } from '@/lib/reclamo/plantilla'

/**
 * Las plantillas de comprobante no llevan `{{detalle}}` obligatorio.
 *
 * La regla de reclamos —«un reclamo que no dice qué cuotas se deben no es un
 * reclamo, es una queja»— no aplica: un recibo lleva el número, el monto y la
 * fecha en la tarjeta que arma el sobre, y esos números NO salen del texto.
 * Exigir el placeholder acá bloquearía guardar un texto perfectamente válido.
 */
const SIN_OBLIGATORIOS: ClavePlantilla[] = ['recibo_pago', 'factura_emitida']

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
  // ── El rol, que antes no se miraba ──────────────────────────────────────
  //
  // Este `if` decía «alcanza con estar logueado», con una nota que se contestaba
  // sola: «cuando existan roles, editar configuración debería ser de admin: acá
  // es donde un usuario cualquiera puede cambiar lo que se le manda a 300
  // equipos en nombre de CAMPA». Los roles existen desde hace rato.
  //
  // Y faltaba la mitad más silenciosa: el UPDATE de abajo no miraba cuántas
  // filas tocó. **RLS deniega el UPDATE sin hacer ruido** —cero filas, sin
  // excepción—, así que a quien no podía editar la pantalla le decía «Plantilla
  // guardada» y no se había guardado nada. El `.select()` de abajo lo cierra.
  const permiso = await exigirRol(PERMISOS['plantilla.editar'].roles)
  if (!permiso.ok) return { ok: false, error: `Editar plantillas no está a tu alcance. ${permiso.error}` }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

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
  const faltan = SIN_OBLIGATORIOS.includes(clave as ClavePlantilla)
    ? { cuerpo: [], cuerpo_texto: [] }
    : obligatoriosPorCuerpo(campos)
  const lista = (ps: string[]) => ps.map((f) => `{{${f}}}`).join(', ')

  if (faltan.cuerpo.length > 0) {
    return { ok: false, error: `Falta ${lista(faltan.cuerpo)} en el cuerpo del mail.` }
  }
  if (faltan.cuerpo_texto.length > 0) {
    return { ok: false, error: `Falta ${lista(faltan.cuerpo_texto)} en el cuerpo de WhatsApp.` }
  }

  const { data: filas, error } = await supabase
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
    .select('clave')

  if (error) return { ok: false, error: error.message }
  if (!filas?.length) {
    return { ok: false, error: 'No se guardó: editar plantillas es de administración o finanzas.' }
  }

  revalidatePath('/configuracion/plantillas')
  // Las pantallas de reclamo leen la plantilla al renderizar.
  revalidatePath('/reclamos', 'layout')

  return { ok: true }
}
