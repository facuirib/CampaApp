"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button } from '@/components/ui'

/**
 * Deshacer la baja lógica de un torneo.
 *
 * Sin confirmación en dos pasos, y es a propósito: la reactivación es
 * exactamente reversible —la baja está a un botón de distancia— y pedir
 * confirmación para algo reversible entrena a confirmar sin leer. El mismo
 * criterio que la baja lógica en `EliminarTorneo`.
 */
export default function ReactivarTorneo({ torneoId }: { torneoId: string }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reactivar() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('reactivar_torneo', {
      p_torneo_id: torneoId,
    })
    setOcupado(false)
    if (err) return setError(err.message)
    router.refresh()
  }

  return (
    <div>
      <Button size="pill" variant="secondary" icon="refrescar" loading={ocupado} disabled={ocupado} onClick={reactivar}>
        Reactivar torneo
      </Button>
      {error && <p className="mt-2 text-[11px] text-errtx">{error}</p>}
    </div>
  )
}
