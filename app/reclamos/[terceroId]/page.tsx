"use client"

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney, formatDate } from '@/lib/format'
import { Button, Card, DataTable, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type ResumenDeuda = Database['public']['Views']['v_deuda_equipo']['Row']
type CuotaDeuda = Database['public']['Views']['v_deuda_detalle']['Row']

interface FilaCuota {
  cuota_id: string
  cuotaLabel: string
  torneo: string | null
  vence_at: string | null
  saldo: number | null
  diasAtrasoLabel: string
}

const COLUMNAS: ColumnDef<FilaCuota>[] = [
  { key: 'cuotaLabel', label: 'Cuota' },
  { key: 'torneo', label: 'Torneo' },
  { key: 'vence_at', label: 'Venció', format: 'date', width: 108 },
  { key: 'saldo', label: 'Saldo', format: 'money', width: 118 },
  { key: 'diasAtrasoLabel', label: 'Atraso', width: 90 },
]

/** Solo cuotas vencidas, impagas y de jornada NO suspendida: eso es lo reclamable. */
function esReclamable(c: CuotaDeuda): boolean {
  if (c.jornada_suspendida) return false
  if ((c.saldo ?? 0) <= 0) return false
  return c.estado === 'vencida' || c.estado === 'parcial_vencida'
}

function armarTexto(equipo: string, deudaVencida: number, cuotas: FilaCuota[]): string {
  const cantidad = cuotas.length
  const lista = cuotas
    .map(
      (c) =>
        `- ${c.cuotaLabel} (${c.torneo ?? 'torneo'}) vencida el ${formatDate(c.vence_at)}, ${formatMoney(c.saldo ?? 0)}`,
    )
    .join('\n')

  return [
    `Hola! Te escribimos de CAMPA por la deuda del equipo ${equipo}.`,
    `Registrás ${cantidad} cuota${cantidad === 1 ? '' : 's'} vencida${cantidad === 1 ? '' : 's'} por un total de ${formatMoney(deudaVencida)}:`,
    lista,
    'Te pedimos regularizar el pago. Cualquier duda, quedamos a disposición.',
  ].join('\n\n')
}

export default function ArmarReclamoPage({
  params,
}: {
  params: Promise<{ terceroId: string }>
}) {
  const { terceroId } = use(params)

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [resumen, setResumen] = useState<ResumenDeuda | null>(null)
  const [cuotas, setCuotas] = useState<CuotaDeuda[]>([])
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setErrorCarga(null)

      const [
        { data: resumenData, error: errorResumen },
        { data: cuotasData, error: errorCuotas },
      ] = await Promise.all([
        supabase.from('v_deuda_equipo').select('*').eq('tercero_id', terceroId).maybeSingle(),
        supabase.from('v_deuda_detalle').select('*').eq('tercero_id', terceroId),
      ])

      if (cancelado) return

      const error = errorResumen ?? errorCuotas
      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setResumen(resumenData)
      setCuotas(cuotasData ?? [])
      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
  }, [terceroId])

  const filas: FilaCuota[] = cuotas
    .filter(esReclamable)
    .map((c) => ({
      // La vista tipa todas las columnas como nullable; cuota_id viene de
      // cuota.id, que es PK.
      cuota_id: c.cuota_id!,
      cuotaLabel: c.cuota_numero != null ? `Cuota ${c.cuota_numero}` : 'Cuota',
      torneo: c.torneo,
      vence_at: c.vence_at,
      saldo: c.saldo,
      diasAtrasoLabel: `${c.dias_atraso ?? 0} días`,
    }))
    .sort((a, b) => (a.vence_at ?? '').localeCompare(b.vence_at ?? ''))

  const texto = resumen
    ? armarTexto(resumen.equipo ?? 'el equipo', resumen.deuda_vencida ?? 0, filas)
    : ''

  async function copiarTexto() {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  // El 404 es del recurso, no un estado más de la pantalla: se resuelve acá,
  // durante el render, para que lo capture el not-found más cercano.
  if (!cargando && !errorCarga && !resumen) {
    notFound()
  }

  return (
    <div className="pb-10">
      <Link href="/reclamos" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a reclamos
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Armar reclamo</h1>
        <p className="mt-1 text-[12px] text-muted">
          Texto para copiar y enviar. No se manda ni se registra desde acá.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && resumen && (
        <>
          <Card title="Equipo" icon="alerta" className="mb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Equipo
                </div>
                <div className="text-[11.5px] text-ink">{resumen.equipo ?? '—'}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Email
                </div>
                <div className="text-[11.5px] text-ink">{resumen.email ?? '—'}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Deuda vencida
                </div>
                <div className="text-[11.5px] font-bold text-ink">
                  {formatMoney(resumen.deuda_vencida ?? 0)}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Vence desde: {formatDate(resumen.vencimiento_mas_antiguo)}
            </p>
          </Card>

          <div className="mb-4">
            <DataTable
              columns={COLUMNAS}
              rows={filas}
              rowKey="cuota_id"
              maxHeight={320}
              emptyMessage="No hay cuotas vencidas para reclamar."
            />
          </div>

          {filas.length > 0 && (
            <>
              <Card title="Texto del reclamo" icon="comprobante" className="mb-3">
                <textarea
                  readOnly
                  value={texto}
                  rows={8}
                  className="w-full resize-none rounded-sm border border-line bg-bg px-2.5 py-2 text-[11.5px] text-ink"
                />
              </Card>

              <Button icon={copiado ? 'check' : 'documento'} onClick={copiarTexto}>
                {copiado ? '¡Copiado!' : 'Copiar texto'}
              </Button>

              <p className="mt-3 text-[10.5px] text-muted">
                Este texto es para copiar y enviar por WhatsApp o mail. El envío y registro
                automático se agregarán más adelante.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}