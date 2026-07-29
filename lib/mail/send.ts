import { mailHabilitado, resend } from '@/lib/mail/client'

export async function enviarMail(opts: {
  to: string
  subject: string
  html: string
}): Promise<{ ok: boolean; dryRun: boolean; error?: string }> {
  if (!mailHabilitado || !resend) {
    console.log(
      `[mail:dry-run] No se envió (falta RESEND_API_KEY). to=${opts.to} subject="${opts.subject}"`
    )
    return { ok: true, dryRun: true }
  }

  try {
    const { error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    })

    if (error) {
      return { ok: false, dryRun: false, error: error.message }
    }

    return { ok: true, dryRun: false }
  } catch (e) {
    return { ok: false, dryRun: false, error: e instanceof Error ? e.message : String(e) }
  }
}
