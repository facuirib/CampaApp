"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { Button, Field, Input } from '@/components/ui'

interface FilaCuota {
  fecha: string
  monto: number
}

/**
 * Crear un contrato de patrocinio, con su cronograma de cobro.
 *
 * La pieza que dejaba al módulo cojo: se podía crear el SPONSOR pero no su
 * CONTRATO — que es donde vive la plata. `crear_contrato_sponsor` firma el
 * contrato y asienta el compromiso completo (DEUDORES_SPONSORS contra
 * INGRESO_DIFERIDO — el ingreso se devenga mes a mes después), y
 * `cargar_cuotas_sponsor` exige que el cronograma cubra el total exacto:
 * si no, el cashflow proyecta mal y los deudores no cierran.
 *
 * La suma de las cuotas se muestra mientras se carga — es la guía para llegar
 * al total — pero la que MANDA es la validación de la base: esta pantalla
 * muestra números tipeados, no inventa un total de negocio.
 */
export default function NuevoContrato({ sponsorId }: { sponsorId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [monto, setMonto] = useState(0)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [firma, setFirma] = useState('')
  const [cuotas, setCuotas] = useState<FilaCuota[]>([{ fecha: '', monto: 0 }])
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sumaCuotas = cuotas.reduce((s, c) => s + (c.monto || 0), 0)
  const cuotasCompletas = cuotas.every((c) => c.fecha && c.monto > 0)

  async function crear() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('crear_contrato_sponsor', {
      p_sponsor_id: sponsorId,
      p_monto_total: monto,
      p_vigente_desde: desde,
      p_vigente_hasta: hasta,
      p_cuotas: cuotas.map((c) => ({ fecha: c.fecha, monto: c.monto })),
      ...(firma ? { p_fecha_firma: firma } : {}),
    })
    setOcupado(false)
    if (err) return setError(err.message)
    setAbierto(false)
    router.refresh()
  }

  if (!abierto) {
    return (
      <Button variant="secondary" icon="plus" onClick={() => setAbierto(true)}>
        Nuevo contrato
      </Button>
    )
  }

  return (
    <div className="w-full rounded-md border border-line bg-white p-4">
      <h2 className="mb-1 text-[13px] font-extrabold text-ink">Nuevo contrato</h2>
      <p className="mb-3 max-w-prose text-[11px] leading-snug text-muted">
        La firma asienta el compromiso completo. El ingreso NO se reconoce acá: se devenga mes a
        mes con «Devengar el mes» — y la plata entra cuando se cobra cada cuota.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Monto total" required>
          <Input type="number" value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))} />
        </Field>
        <Field label="Vigente desde" required>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Vigente hasta" required>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>
        <Field label="Fecha de firma" hint="Si no, se usa el inicio de vigencia.">
          <Input type="date" value={firma} onChange={(e) => setFirma(e.target.value)} />
        </Field>
      </div>

      <p className="mb-1 mt-4 text-[10px] font-bold uppercase tracking-[.06em] text-muted">
        Cronograma de cobro
      </p>
      <p className="mb-2 text-[10.5px] leading-snug text-muted">
        Las cuotas tienen que cubrir el total exacto — lo valida la base. Van
        <span className="cifra font-bold text-ink"> {formatMoney(sumaCuotas)}</span>
        {monto > 0 && <> de <span className="cifra font-bold text-ink">{formatMoney(monto)}</span></>}.
      </p>

      <div className="space-y-2">
        {cuotas.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              className="w-40"
              value={c.fecha}
              onChange={(e) => {
                const copia = [...cuotas]
                copia[i] = { ...c, fecha: e.target.value }
                setCuotas(copia)
              }}
            />
            <Input
              type="number"
              className="w-40"
              placeholder="Monto"
              value={c.monto || ''}
              onChange={(e) => {
                const copia = [...cuotas]
                copia[i] = { ...c, monto: Number(e.target.value) }
                setCuotas(copia)
              }}
            />
            {cuotas.length > 1 && (
              <Button
                size="pill"
                variant="tertiary"
                onClick={() => setCuotas(cuotas.filter((_, j) => j !== i))}
              >
                Sacar
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2">
        <Button
          size="pill"
          variant="tertiary"
          icon="plus"
          onClick={() => setCuotas([...cuotas, { fecha: '', monto: 0 }])}
        >
          Agregar cuota
        </Button>
      </div>

      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          icon="check"
          loading={ocupado}
          disabled={ocupado || !monto || !desde || !hasta || !cuotasCompletas}
          onClick={crear}
        >
          Crear contrato
        </Button>
        <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
