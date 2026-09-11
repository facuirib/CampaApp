"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Card, Field, Input } from '@/components/ui'
import { crearEquipo } from '../acciones'

/**
 * Alta de equipo.
 *
 * Espejo de `/sponsors/nuevo`, y por la misma razón: hasta esta pantalla un
 * equipo sólo podía nacer por SQL. El alta pide lo mínimo — nombre, y si se
 * tienen a mano, el delegado y cómo contactarlo. Los datos fiscales van en la
 * ficha (misma decisión que sponsors: pedirlos acá convertiría un paso de dos
 * campos en uno de ocho).
 *
 * La escritura es una Server Action con `exigirRol` (ver `../acciones.ts`).
 */
export default function NuevoEquipoPage() {
  const router = useRouter()

  const [nombre, setNombre] = useState('')
  const [delegado, setDelegado] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const puedeGuardar = nombre.trim() !== '' && !guardando

  async function guardar() {
    if (!puedeGuardar) return
    setGuardando(true)
    setError(null)

    const r = await crearEquipo({
      nombre,
      delegado: delegado || null,
      telefono: telefono || null,
      email: email || null,
    })

    setGuardando(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo crear el equipo.')

    // A la ficha del equipo nuevo: es donde se lo inscribe a un torneo, que es
    // lo que sigue. Dejarlo en la lista obligaría a buscarlo.
    router.push(`/equipos/${r.id}`)
  }

  return (
    <div className="pb-10">
      <Link href="/equipos" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a equipos
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Nuevo equipo</h1>
        <p className="mt-1 text-[12px] text-muted">
          Con el nombre alcanza. Los datos fiscales se cargan después, en su ficha; la
          inscripción al torneo, desde la ficha o desde Torneos → Fichas.
        </p>
      </header>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" required className="sm:col-span-2">
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Deportivo Norte"
            />
          </Field>
          <Field label="Delegado" hint="Con quién se habla." className="sm:col-span-2">
            <Input value={delegado} onChange={(e) => setDelegado(e.target.value)} />
          </Field>
          <Field label="Teléfono" hint="Para el WhatsApp.">
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </Field>
          <Field label="Email" hint="Para avisos y comprobantes.">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error}</p>
        )}

        <div className="mt-5">
          <Button icon="check" loading={guardando} disabled={!puedeGuardar} onClick={guardar}>
            Crear equipo
          </Button>
        </div>
      </Card>
    </div>
  )
}
