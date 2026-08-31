"use client"

import { useState } from 'react'
import { Button } from '@/components/ui'
import { exportarPanel, type Panel } from './acciones-exportar'

const PANELES: { panel: Panel; label: string; nota: string }[] = [
  { panel: 'cobranza', label: 'Cobranza', nota: 'la cola completa, no las 8 de arriba' },
  { panel: 'equipos', label: 'Equipos', nota: 'plan, pagado y saldo por ficha' },
  { panel: 'resultado', label: 'Resultado', nota: 'ingresos y egresos mes a mes' },
  { panel: 'cobros', label: 'Cobros', nota: 'por medio de pago y mes' },
]

/**
 * Bajar los datos del dashboard como planilla.
 *
 * Es lo único cliente de la pantalla de inicio, y por lo mínimo: disparar la
 * descarga necesita `URL.createObjectURL`, que es del navegador. Los datos los
 * arma la Server Action leyendo las vistas — acá no se serializa nada de lo que
 * la pantalla ya tenía, así que el CSV trae la cola entera y no el recorte.
 */
export default function Exportar({
  torneoId,
  anio,
}: {
  torneoId: string | null
  anio: number
}) {
  const [bajando, setBajando] = useState<Panel | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function bajar(panel: Panel) {
    setBajando(panel)
    setError(null)
    const r = await exportarPanel(panel, { torneoId, anio })
    setBajando(null)

    if ('error' in r) return setError(r.error)

    const blob = new Blob([r.contenido], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = r.nombre
    a.click()
    // Sin esto el blob queda vivo hasta que se recargue la página.
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {PANELES.map((p) => (
          <Button
            key={p.panel}
            size="pill"
            variant="secondary"
            icon="descargar"
            disabled={bajando !== null}
            loading={bajando === p.panel}
            onClick={() => bajar(p.panel)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] text-muted">
        Planillas con separador <code className="font-mono">;</code>, que es el que Excel espera en
        configuración argentina — con coma, todo entraría en una sola columna.
      </p>
      {error && <p className="mt-2 text-[11px] text-errtx">{error}</p>}
    </div>
  )
}
