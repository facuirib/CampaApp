"use client"

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { Button, Field, Input } from '@/components/ui'

/**
 * Crear la contraseña nueva — adonde aterriza el LINK del mail.
 *
 * El link trae un código de un solo uso (?code=); `createBrowserClient`
 * (PKCE) lo canjea solo al cargar la página y deja una sesión de
 * recuperación — por eso acá alcanza con `updateUser({ password })`, sin
 * tocar el código a mano. Si no hay sesión (link vencido, ya usado, o
 * alguien entró directo), updateUser falla y se ofrece pedir otro link.
 *
 * Las reglas de contraseña las pone Supabase (largo mínimo y protección de
 * contraseñas filtradas, que está ACTIVADA): si la rechaza, el motivo se
 * muestra claro — en castellano para los casos conocidos.
 */
export default function NuevaContrasenaPage() {
  const [clave, setClave] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vencido, setVencido] = useState(false)

  function traducir(mensaje: string): string {
    const m = mensaje.toLowerCase()
    if (m.includes('at least'))
      return 'La contraseña es demasiado corta para las reglas del sistema.'
    if (m.includes('weak') || m.includes('pwned') || m.includes('compromised') || m.includes('leaked'))
      return 'Esa contraseña apareció en filtraciones de datos conocidas — elegí otra distinta.'
    if (m.includes('different from the old') || m.includes('should be different'))
      return 'La contraseña nueva tiene que ser distinta de la anterior.'
    return mensaje
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (clave !== confirmacion) {
      setError('Las dos contraseñas no coinciden.')
      return
    }
    setGuardando(true)
    setError(null)

    const supabase = createClient()
    const { data: sesion } = await supabase.auth.getSession()
    if (!sesion.session) {
      setGuardando(false)
      setVencido(true)
      return
    }

    const { error: err } = await supabase.auth.updateUser({ password: clave })
    if (err) {
      setGuardando(false)
      setError(traducir(err.message))
      return
    }

    // Navegación DURA, como el login: el layout tiene que evaluarse de nuevo
    // con la sesión puesta para montar el sidebar.
    window.location.assign('/')
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[320px] px-4 py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <Image src="/brand/campa-isologo-navy.png" alt="" width={56} height={56} priority />
        <h1 className="mt-3 text-lg font-extrabold tracking-[-.3px] text-ink">CAMPA</h1>
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted">
          Nueva contraseña
        </p>
      </div>

      {vencido ? (
        <div className="rounded-md bg-warnbg px-4 py-5 text-center">
          <p className="text-[12px] font-semibold leading-relaxed text-warntx">
            El link venció o ya se usó.
          </p>
          <p className="mt-2 text-[11px] text-warntx/80">
            <Link href="/recuperar" className="font-bold underline">
              Pedí uno nuevo acá
            </Link>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={guardar} noValidate>
          <Field label="Contraseña nueva" className="mb-3">
            <Input
              type="password"
              autoComplete="new-password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              required
            />
          </Field>
          <Field label="Repetila, para confirmar" error={error} className="mb-5">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              required
            />
          </Field>
          <Button
            type="submit"
            loading={guardando}
            disabled={guardando || !clave || !confirmacion}
            className="w-full"
          >
            Guardar y entrar
          </Button>
        </form>
      )}
    </main>
  )
}
