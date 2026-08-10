"use client"

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/db/client'
import { Button, Field, Input } from '@/components/ui'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEntrando(true)
    setError(null)

    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password: clave,
    })

    if (error) {
      setEntrando(false)
      // Mensaje genérico a propósito: distinguir "no existe ese email" de
      // "contraseña incorrecta" le confirma a cualquiera qué direcciones están
      // dadas de alta.
      setError('Email o contraseña incorrectos.')
      return
    }

    // Navegación DURA, no `router.replace`.
    //
    // El layout raíz decide si monta el sidebar según haya sesión, y Next NO
    // re-renderiza un layout compartido en una navegación de cliente: sólo
    // cambia la página. Entrando con router.replace, la app quedaba andando
    // con el shell de "sin sesión" —sin sidebar— hasta el primer recargado.
    //
    // Con `assign` el documento se pide de nuevo, el layout se evalúa con la
    // cookie ya puesta, y no hace falta ningún refresh previo.
    window.location.assign('/')
  }

  return (
    // El marco lo pone la propia pantalla: sin sesión el layout raíz entrega
    // los children pelados, sin sidebar ni contenedor.
    <main className="mx-auto min-h-screen w-full max-w-[320px] px-4 py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <Image src="/brand/campa-isologo-navy.png" alt="" width={56} height={56} priority />
        <h1 className="mt-3 text-lg font-extrabold tracking-[-.3px] text-ink">CAMPA</h1>
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted">
          Gestión administrativa
        </p>
      </div>

      <form onSubmit={entrar} noValidate>
        <Field label="Email" className="mb-3">
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>

        <Field label="Contraseña" error={error} className="mb-5">
          <Input
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
          />
        </Field>

        <Button type="submit" loading={entrando} className="w-full">
          Entrar
        </Button>
      </form>

      <p className="mt-6 text-center text-[10.5px] leading-snug text-muted">
        ¿Olvidaste la contraseña? Pedile a quien administra el sistema que la reponga.
      </p>
    </main>
  )
}
