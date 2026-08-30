import { mailHabilitado, resend } from '@/lib/mail/client'

/**
 * El remitente.
 *
 * Va en el código y no en el entorno a propósito: no es un secreto, y es parte
 * de la identidad del club — el día que cambie, tiene que cambiar en un commit
 * que alguien revise, no en una variable que se toca sin dejar rastro.
 *
 * El dominio está verificado en Resend. Antes era `onboarding@resend.dev`, el
 * sandbox: los mails salían, pero desde una dirección que no es nuestra y que
 * ningún equipo reconocería.
 */
const REMITENTE = 'Campa Fútbol <info@campafutbol.com.ar>'

/** Un adjunto. `contenido` es el archivo en base64, que es lo que pide Resend. */
export interface Adjunto {
  nombre: string
  contenido: string
  /**
   * Si viene, el adjunto va **inline** y no en la lista de adjuntos.
   *
   * Es lo que documenta el SDK: «If set, this attachment will be sent as an
   * inline attachment and you can reference it in the HTML content using the
   * cid: prefix». O sea que el isologo viaja adentro del mensaje —por eso
   * ningún cliente lo bloquea— sin aparecer como un archivo más para bajar al
   * lado del PDF del comprobante.
   */
  cid?: string
}

export async function enviarMail(opts: {
  to: string
  subject: string
  html: string
  adjuntos?: Adjunto[]
  // Devuelve el id que asigna Resend cuando el envío sale. Se guarda en el
  // registro para que, si un equipo dice que no le llegó, haya con qué
  // buscarlo en el panel en vez de discutirlo de memoria.
}): Promise<{ ok: boolean; dryRun: boolean; error?: string; id?: string }> {
  if (!mailHabilitado || !resend) {
    console.log(
      `[mail:dry-run] No se envió (falta RESEND_API_KEY). to=${opts.to} subject="${opts.subject}"` +
        (opts.adjuntos?.length ? ` adjuntos=${opts.adjuntos.map((a) => a.nombre).join(', ')}` : '')
    )
    return { ok: true, dryRun: true }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: REMITENTE,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      // Resend quiere `content` en base64 y `filename`. Se mandan sólo si hay:
      // un `attachments: []` vacío es distinto de no mandar el campo.
      ...(opts.adjuntos?.length
        ? {
            attachments: opts.adjuntos.map((a) => ({
              filename: a.nombre,
              content: a.contenido,
              ...(a.cid ? { contentId: a.cid } : {}),
            })),
          }
        : {}),
    })

    if (error) {
      return { ok: false, dryRun: false, error: error.message }
    }

    return { ok: true, dryRun: false, id: data?.id }
  } catch (e) {
    return { ok: false, dryRun: false, error: e instanceof Error ? e.message : String(e) }
  }
}
