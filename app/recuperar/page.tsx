"use client"

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { Button, Field, Input } from '@/components/ui'

/**
 * Pedir el mail de recuperación de contraseña.
 *
 * El mensaje de éxito es EL MISMO exista o no el email: confirmar "ese no
 * está" le regala a cualquiera el padrón de direcciones dadas de alta — la
 * misma regla que el login, que tampoco distingue email de contraseña.
 * (Supabase ya responde OK para emails inexistentes; acá solo no se agrega
 * nada que lo delate.)
 *
 * El link del mail aterriza en /nueva-contrasena con un código de un solo
 * uso — esa URL tiene que estar en las Redirect URLs permitidas de Supabase
 * (Auth → URL Configuration), en local y en producción.
 */
export default function RecuperarPage() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)

    const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nueva-contrasena`,
    })

    setEnviando(false)
    if (err) {
      // Error REAL (red caída, demasiados intentos) — no de "no existe": eso
      // Supabase no lo revela y acá tampoco.
      setError('No se pudo enviar el mail. Esperá un minuto y probá de nuevo.')
      return
    }
    setEnviado(true)
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[320px] px-4 py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <Image src="/brand/campa-isologo-navy.png" alt="" width={56} height={56} priority />
        <h1 className="mt-3 text-lg font-extrabold tracking-[-.3px] text-ink">CAMPA</h1>
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted">
          Recuperar contraseña
        </p>
      </div>

      {enviado ? (
        <div className="rounded-md bg-okbg px-4 py-5 text-center">
          <p className="text-[12px] font-semibold leading-relaxed text-oktx">
            Si ese email está dado de alta, te mandamos un link para crear una contraseña nueva.
          </p>
          <p className="mt-2 text-[11px] leading-snug text-oktx/80">
            Revisá también el correo no deseado. El link vence: usalo apenas llegue.
          </p>
        </div>
      ) : (
        <form onSubmit={enviar} noValidate>
          <p className="mb-5 text-[11.5px] leading-snug text-muted">
            Poné el email con el que entrás al sistema y te mandamos un link para crear una
            contraseña nueva.
          </p>
          <Field label="Email" error={error} className="mb-5">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" loading={enviando} disabled={!email.trim()} className="w-full">
            Mandarme el link
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-[10.5px] text-muted">
        <Link href="/login" className="font-semibold text-blue-d hover:underline">
          ← Volver a entrar
        </Link>
      </p>
    </main>
  )
}
