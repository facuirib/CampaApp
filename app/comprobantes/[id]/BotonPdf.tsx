'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'
import { descargarPdf } from './acciones'

/**
 * El botón que baja el PDF.
 *
 * Los bytes llegan en base64 desde la Server Action, se arman en un Blob y se
 * disparan con un ancla temporal. Es el camino que evita estrenar un `route.ts`
 * para una descarga.
 */
export default function BotonPdf({ comprobanteId }: { comprobanteId: string }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function bajar() {
    setOcupado(true)
    setError(null)
    const r = await descargarPdf(comprobanteId)
    setOcupado(false)

    if (!r.ok || !r.base64 || !r.nombre) {
      setError(r.error ?? 'No se pudo generar el PDF.')
      return
    }

    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = r.nombre
    a.click()
    // Sin esto el Blob queda en memoria hasta que se cierre la pestaña.
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Button icon="descargar" loading={ocupado} disabled={ocupado} onClick={bajar}>
        Descargar PDF
      </Button>
      {error && (
        <p className="mt-2 rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">{error}</p>
      )}
    </div>
  )
}
