import { formatMoney } from '@/lib/format'

function layout(contenido: string): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #171717;">
      <div style="padding: 16px 0; border-bottom: 2px solid #171717;">
        <strong style="font-size: 18px;">CAMPA</strong>
      </div>
      <div style="padding: 24px 0; font-size: 14px; line-height: 1.5;">
        ${contenido}
      </div>
      <div style="padding: 16px 0; border-top: 1px solid #e5e5e5; font-size: 12px; color: #737373;">
        Este mail fue generado automáticamente por CAMPA. Ante cualquier duda, respondé este correo.
      </div>
    </div>
  `
}

export function reclamoDeuda(d: {
  equipo: string
  monto: number
  torneo: string
  vencimiento: string
}): { subject: string; html: string } {
  const subject = `${d.equipo} — tenés un pago pendiente en ${d.torneo}`
  const html = layout(`
    <p>Hola,</p>
    <p>
      Te escribimos de CAMPA porque <strong>${d.equipo}</strong> tiene un pago
      pendiente en <strong>${d.torneo}</strong>, vencido desde el
      <strong>${d.vencimiento}</strong>.
    </p>
    <p style="font-size: 20px; font-weight: bold; margin: 16px 0;">
      ${formatMoney(d.monto)}
    </p>
    <p>
      Te pedimos que lo regularices a la brevedad para que el equipo siga
      participando sin inconvenientes. Cualquier consulta, escribinos.
    </p>
    <p>¡Gracias y nos vemos en la cancha!</p>
  `)
  return { subject, html }
}

export function reciboPago(d: {
  equipo: string
  monto: number
  torneo: string
  fecha: string
}): { subject: string; html: string } {
  const subject = `Recibimos tu pago — ${d.equipo}`
  const html = layout(`
    <p>Hola,</p>
    <p>
      Te confirmamos que recibimos el pago de <strong>${d.equipo}</strong>
      correspondiente a <strong>${d.torneo}</strong>, con fecha
      <strong>${d.fecha}</strong>.
    </p>
    <p style="font-size: 20px; font-weight: bold; margin: 16px 0;">
      ${formatMoney(d.monto)}
    </p>
    <p>¡Gracias por estar al día! Nos vemos en la cancha.</p>
  `)
  return { subject, html }
}
