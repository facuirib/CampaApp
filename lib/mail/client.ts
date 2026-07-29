import { Resend } from 'resend'

export const mailHabilitado = !!process.env.RESEND_API_KEY

export const resend = mailHabilitado ? new Resend(process.env.RESEND_API_KEY) : null
