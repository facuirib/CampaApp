'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { exigirRol } from '@/lib/rol-actual'
import { enviarMail } from '@/lib/mail/send'
import { envolver } from '@/lib/mail/sobre'
import { formatMoneyExacto } from '@/lib/format'
import {
  aplicar,
  PLANTILLA_POR_ETAPA,
  type EtapaCobranza,
} from '@/lib/reclamo/plantilla'

/**
 * Las dos escrituras del módulo de reclamos, del lado del servidor.
 *
 * El envío de mail VIVE ACÁ y no en la pantalla por una razón que no es de
 * estilo: `RESEND_API_KEY` es un secreto. Cualquier cosa que lo toque desde un
 * componente cliente termina en el bundle que baja el navegador, y una key de
 * envío filtrada es una cuenta desde la que cualquiera manda mails firmados
 * como CAMPA.
 *
 * El registro del reclamo también, por otro motivo: `created_by` sale de la
 * sesión leída en el servidor. Si el cliente mandara el id, podría mandar
 * cualquiera — y el historial de reclamos dejaría de responder "quién reclamó".
 */

export interface DatosReclamo {
  tercero_id: string
  torneo_id: string | null
  monto_reclamado: number
  cuotas: number
  cuota_ids: string[]
  /**
   * Los cuatro placeholders ya calculados: equipo, cantidad, monto y detalle.
   *
   * La pantalla manda los DATOS, no el mensaje. El mensaje lo arma la plantilla
   * —acá, en el servidor— así que los dos canales salen de la misma fuente y no
   * pueden decir cosas distintas.
   */
  valores: Record<string, string>
  /**
   * En qué momento de la cobranza va este aviso.
   *
   * Decide DOS cosas: qué plantilla se usa y qué queda guardado en
   * `reclamo.etapa`, que es lo que el candado mira para no repetir. Las dos de
   * la misma fuente a propósito: si el texto saliera de una etapa y el registro
   * de otra, el candado taparía un aviso que nunca se mandó.
   *
   * `null` para el reclamo suelto, el de la ficha sin cola: usa la plantilla
   * vieja y no se le puede atribuir una etapa.
   */
  etapa: EtapaCobranza | null
}

export interface Resultado {
  ok: boolean
  error?: string
  /** True cuando el mail no salió de verdad por falta de key. */
  dryRun?: boolean
}

/** Trae la plantilla del reclamo, que es la única fuente de los dos canales. */
async function traerPlantilla(
  supabase: Awaited<ReturnType<typeof createClient>>,
  etapa: EtapaCobranza | null,
) {
  // La etapa elige la plantilla. Sin etapa —el reclamo suelto de la ficha— cae
  // en la de siempre.
  const clave = etapa ? PLANTILLA_POR_ETAPA[etapa] : 'reclamo_vencida'
  const { data, error } = await supabase
    .from('plantilla_mail')
    .select('asunto, cuerpo, cuerpo_texto')
    .eq('clave', clave)
    .maybeSingle()

  if (error) return { plantilla: null, error: error.message }
  if (!data) {
    return { plantilla: null, error: `Falta la plantilla «${clave}» en plantilla_mail.` }
  }
  return { plantilla: data, error: null }
}

/** Inserta el reclamo con el responsable de la sesión. Sin sesión, no escribe. */
async function registrar(
  datos: DatosReclamo,
  canal: 'mail' | 'whatsapp' | 'manual',
  destino: string | null,
  texto: string,
): Promise<Resultado> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a entrar.' }

  const { error } = await supabase.from('reclamo').insert({
    tercero_id: datos.tercero_id,
    torneo_id: datos.torneo_id,
    canal,
    // Lo que el candado mira para no volver a mandar este mismo aviso.
    etapa: datos.etapa,
    // Congelados: es la foto de cuánto debía cuando se le reclamó. Si mañana
    // paga, el reclamo tiene que seguir diciendo lo que decía.
    monto_reclamado: datos.monto_reclamado,
    cuotas: datos.cuotas,
    cuota_ids: datos.cuota_ids,
    // Se guarda el texto RESUELTO, no la plantilla: editar la plantilla mañana
    // no puede reescribir lo que se mandó ayer.
    texto,
    destino,
    created_by: user.id,
  })

  if (error) return { ok: false, error: error.message }

  // Las tres pantallas muestran el conteo o el último reclamo.
  // Las rutas nuevas. Revalidar `/reclamos*` no haría nada: ahora son
  // redirects sin datos propios.
  revalidatePath('/cobranza')
  revalidatePath(`/cobranza/${datos.tercero_id}`)
  revalidatePath('/cobranza/avisos/historial')

  return { ok: true }
}

/**
 * Reclamo por un canal que no manda nada: WhatsApp abierto a mano, o teléfono.
 *
 * Resuelve la plantilla igual que el mail, para guardar exactamente el texto
 * que el operador tuvo delante.
 */
export async function registrarReclamo(
  datos: DatosReclamo,
  canal: 'whatsapp' | 'manual',
  destino: string | null,
): Promise<Resultado> {
  const supabase = await createClient()
  const { plantilla, error } = await traerPlantilla(supabase, datos.etapa)
  if (!plantilla) return { ok: false, error: error ?? 'Sin plantilla.' }

  const { texto } = aplicar(plantilla, datos.valores)
  return registrar(datos, canal, destino, texto ?? '')
}

/**
 * Manda el mail y, sólo si salió, registra el reclamo.
 *
 * El orden importa: registrar primero dejaría un reclamo que dice "mandado por
 * mail" cuando el mail falló. Es preferible un mail enviado sin registro —que
 * se puede marcar a mano— que un registro que miente.
 */
export async function enviarReclamoMail(datos: DatosReclamo, email: string): Promise<Resultado> {
  // ── El único chequeo de rol de este archivo, y por qué va sólo acá ───────
  //
  // `registrarReclamo` escribe en `reclamo` con el cliente del usuario: si el
  // rol no puede, **la policy lo frena** y el INSERT habla. No necesita un `if`
  // — agregárselo sería una segunda fuente de verdad que se desincroniza de la
  // policy en la próxima migración.
  //
  // Mandar un mail no pasa por ninguna policy. Y acá el orden lo empeora: el
  // mail sale ANTES de registrar, así que el freno de RLS llega tarde —el mail
  // ya está en la casilla del equipo—. Por eso el reclamo por mail se autoriza
  // antes de tocar Resend, con los mismos roles que `reclamo.INSERT`.
  const permiso = await exigirRol(['admin', 'operador'])
  if (!permiso.ok) return { ok: false, error: `Enviar un reclamo por mail no está a tu alcance. ${permiso.error}` }

  const supabase = await createClient()

  const { plantilla, error } = await traerPlantilla(supabase, datos.etapa)
  if (!plantilla) return { ok: false, error: error ?? 'Sin plantilla.' }

  // Los tres formatos salen de la MISMA fila y los MISMOS valores: el asunto y
  // el HTML para el mail, el plano para guardar y para WhatsApp.
  const { asunto, html: mensaje, texto } = aplicar(plantilla, datos.valores)

  // ── El sobre de marca ───────────────────────────────────────────────────
  //
  // El mismo `envolver()` que el recibo y la factura: encabezado navy con el
  // isologo embebido, tarjeta de destacados y pie. **Sin adjunto** — un aviso
  // de cobranza no lleva PDF, sólo texto.
  //
  // Los destacados NO salen de la plantilla: son números y los pone el sobre
  // desde los datos, para que no se puedan desincronizar de lo que se está
  // reclamando.
  //
  // Con etapa va el sobre; sin etapa —el reclamo suelto— sale como salía, con
  // el HTML que trae su propia fila. Esa plantilla vieja tiene el diseño
  // adentro del campo editable, y envolverla pondría un diseño dentro de otro.
  const { data: emisorMail } = await supabase
    .from('emisor')
    .select('razon_social, cuit')
    .eq('id', true)
    .single()

  const html = datos.etapa
    ? envolver({
        cuerpoHtml: mensaje,
        destacados: [
          { rotulo: 'Total adeudado', valor: formatMoneyExacto(datos.monto_reclamado) },
          { rotulo: 'Cuotas', valor: String(datos.cuotas) },
          ...(datos.valores.vencimiento && datos.valores.vencimiento !== '—'
            ? [{ rotulo: 'Vencimiento', valor: datos.valores.vencimiento }]
            : []),
        ],
        emisor: {
          razonSocial: emisorMail?.razon_social ?? 'Campa Fútbol',
          cuit: emisorMail?.cuit ?? '',
        },
      })
    : { html: mensaje, inline: [] }

  const envio = await enviarMail({
    to: email,
    subject: asunto,
    html: html.html,
    adjuntos: html.inline,
  })

  if (!envio.ok) return { ok: false, error: envio.error ?? 'No se pudo enviar el mail.' }

  const registro = await registrar(datos, 'mail', email, texto ?? '')
  if (!registro.ok) {
    return {
      ok: false,
      error: `El mail se envió pero no se pudo registrar el reclamo: ${registro.error}`,
    }
  }

  return { ok: true, dryRun: envio.dryRun }
}
