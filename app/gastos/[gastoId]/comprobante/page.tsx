"use client"

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { formatMoney, formatDate } from '@/lib/format'
import { Button, Card, Field } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

import { adjuntarComprobante, urlComprobante } from './acciones'

type GastoDetalle = Database['public']['Views']['v_gasto_detalle']['Row']

/**
 * Adjuntar el comprobante del proveedor a un gasto.
 *
 * Pantalla propia, como `/pagar`: una acción sobre un gasto. No hay detalle de
 * gasto en el que meterla, y crearlo sería otra pieza.
 *
 * El archivo se valida DEL LADO DEL SERVIDOR —tipo por bytes, tamaño— y acá se
 * avisa antes de mandarlo, que es cortesía y no seguridad: lo que decide es la
 * Server Action.
 */

/** Igual que el tope de la Server Action y que bodySizeLimit de next.config. */
const MAX_MB = 5
const ACEPTA = '.pdf,.jpg,.jpeg,.png'

export default function ComprobanteDeGastoPage({
  params,
}: {
  params: Promise<{ gastoId: string }>
}) {
  const { gastoId } = use(params)

  const [gasto, setGasto] = useState<GastoDetalle | null>(null)
  const [cargando, setCargando] = useState(true)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pathActual, setPathActual] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('v_gasto_detalle').select('*').eq('gasto_id', gastoId).maybeSingle(),
      supabase.from('gasto').select('comprobante_path').eq('id', gastoId).maybeSingle(),
    ]).then(([g, c]) => {
      setGasto(g.data ?? null)
      setPathActual(c.data?.comprobante_path ?? null)
      setCargando(false)
    })
  }, [gastoId])

  async function subir() {
    if (!archivo) return
    setOcupado(true)
    setError(null)
    setAviso(null)

    const fd = new FormData()
    fd.set('gastoId', gastoId)
    fd.set('archivo', archivo)

    const r = await adjuntarComprobante(fd)
    setOcupado(false)

    if (!r.ok) return setError(r.error ?? 'No se pudo adjuntar.')
    setPathActual(r.path ?? null)
    setArchivo(null)
    setAviso('Comprobante adjuntado.')
  }

  async function abrir() {
    setError(null)
    const r = await urlComprobante(gastoId)
    if (!r.ok || !r.url) return setError(r.error ?? 'No se pudo abrir.')
    // El link firmado vive 5 minutos y nunca se muestra el path.
    window.open(r.url, '_blank', 'noopener,noreferrer')
  }

  if (cargando) return <main className="p-6 text-[12px] text-muted">Cargando…</main>

  return (
    <main className="space-y-5 p-6">
      <div>
        <Link href="/gastos" className="text-[11px] text-muted hover:text-ink">
          ← Gastos
        </Link>
        <h1 className="mt-2 text-[19px] font-extrabold text-ink">Comprobante del proveedor</h1>
        {gasto && (
          <p className="mt-1 text-[12px] text-muted">
            {gasto.concepto} · {formatMoney(gasto.total ?? 0)}
            {gasto.devengado_at ? ` · ${formatDate(gasto.devengado_at)}` : ''}
          </p>
        )}
      </div>

      <Card>
        {pathActual ? (
          <>
            <h2 className="mb-1 text-[13px] font-extrabold text-ink">Ya tiene comprobante</h2>
            <p className="mb-4 text-[11px] text-muted">
              Se abre con un link que vive 5 minutos. El archivo está en un bucket privado: no hay
              dirección pública que compartir por accidente.
            </p>
            <Button icon="ver" variant="secondary" onClick={abrir}>
              Ver el comprobante
            </Button>
            <div className="mt-6 border-t border-line pt-5">
              <h3 className="mb-1 text-[12px] font-bold text-ink">Reemplazarlo</h3>
              <p className="mb-3 text-[11px] text-muted">
                El anterior se borra recién cuando el nuevo quedó guardado.
              </p>
            </div>
          </>
        ) : (
          <h2 className="mb-4 text-[13px] font-extrabold text-ink">Adjuntar</h2>
        )}

        <Field
          label="Archivo"
          hint={`PDF, JPG o PNG · hasta ${MAX_MB} MB`}
          error={error}
        >
          <input
            type="file"
            accept={ACEPTA}
            onChange={(e) => {
              setArchivo(e.target.files?.[0] ?? null)
              setError(null)
              setAviso(null)
            }}
            className="w-full text-[12px] text-ink file:mr-3 file:rounded-md file:border file:border-line file:bg-panel file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-ink"
          />
        </Field>

        <div className="mt-5">
          <Button icon="check" loading={ocupado} disabled={ocupado || !archivo} onClick={subir}>
            {pathActual ? 'Reemplazar comprobante' : 'Adjuntar comprobante'}
          </Button>
        </div>

        {aviso && (
          <p className="mt-4 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">{aviso}</p>
        )}
      </Card>

      <p className="max-w-[70ch] text-[11px] leading-snug text-muted">
        El tipo de archivo se verifica por su <strong className="font-semibold">contenido</strong>,
        no por la extensión: renombrar algo a <code className="rounded bg-panel px-1">.pdf</code> no
        lo convierte en PDF, y el servidor lo rechaza igual.
      </p>
    </main>
  )
}
