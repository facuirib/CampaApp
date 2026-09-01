"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button, Card, Field, Input } from '@/components/ui'

/**
 * Alta de sponsor.
 *
 * ── Sólo el front: el motor ya existía ────────────────────────────────────
 *
 * `crear_sponsor` es de Horacio y está catalogada (`sponsor.crear`, admin /
 * finanzas / operador por guarda). Lo único que faltaba era una pantalla: hasta
 * hoy un sponsor sólo podía nacer por SQL, y por eso los tres que hay se
 * cargaron a mano.
 *
 * Los datos fiscales NO se piden acá. Un sponsor recién dado de alta se factura
 * como Consumidor Final igual que un equipo nuevo, y su ficha tiene el mismo
 * formulario fiscal que la del equipo — pedirlos en el alta convertiría un paso
 * de dos campos en uno de ocho, y el 90% de las veces no se tienen a mano.
 */
export default function NuevoSponsorPage() {
  const router = useRouter()

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const puedeGuardar = nombre.trim() !== '' && !guardando

  async function guardar() {
    if (!puedeGuardar) return
    setGuardando(true)
    setError(null)

    const { data, error: err } = await createClient().rpc('crear_sponsor', {
      p_nombre: nombre.trim(),
      p_email: email.trim() || undefined,
      p_telefono: telefono.trim() || undefined,
    })

    setGuardando(false)
    if (err) return setError(err.message)

    // A la ficha del sponsor nuevo: es donde se le carga el contrato, que es
    // lo que sigue. Dejarlo en la lista obligaría a buscarlo.
    router.push(`/sponsors/${data as string}`)
  }

  return (
    <div className="pb-10">
      <Link href="/sponsors" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a sponsors
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Nuevo sponsor</h1>
        <p className="mt-1 text-[12px] text-muted">
          Con el nombre alcanza. Los datos fiscales y el contrato se cargan después, en su ficha.
        </p>
      </header>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" required className="sm:col-span-2">
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Bodega Los Cerros"
            />
          </Field>
          <Field label="Email" hint="Para mandarle el comprobante.">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Teléfono" hint="Para el WhatsApp.">
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </Field>
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error}</p>
        )}

        <div className="mt-5">
          <Button icon="check" loading={guardando} disabled={!puedeGuardar} onClick={guardar}>
            Crear sponsor
          </Button>
        </div>
      </Card>
    </div>
  )
}
