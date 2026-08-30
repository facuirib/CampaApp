"use client"

import { useState } from 'react'
import { Badge, Button, Card, Field, Input } from '@/components/ui'
import { guardarConfigCobranza } from '../acciones'

export interface Ventanas {
  dias_por_vencer: number
  dias_recordatorio: number
  dias_firme: number
}

/**
 * Las ventanas de la gestión de cobranza.
 *
 * Tres números que deciden en qué cola cae cada equipo. Están acá y no
 * escritos en la vista porque son política del club y cambian con el torneo:
 * un torneo con cuotas semanales no se reclama con las ventanas de uno mensual.
 *
 * ── Por qué el orden importa y se valida dos veces ────────────────────────
 *
 * Con el firme ANTES que el recordatorio, la etapa del medio no se alcanza
 * nunca y esa cola queda vacía para siempre — sin que nada falle ni nadie
 * entienda por qué. Lo frena un check en la base y se avisa acá antes de
 * mandar, porque el mensaje de Postgres habla de un constraint.
 */
export default function EditorVentanas({
  inicial,
  puedeEditar,
}: {
  inicial: Ventanas
  puedeEditar: boolean
}) {
  const [v, setV] = useState<Ventanas>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ordenMal = v.dias_firme <= v.dias_recordatorio

  const campo = (k: keyof Ventanas) => ({
    type: 'number' as const,
    min: 0,
    value: String(v[k]),
    readOnly: !puedeEditar,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setV({ ...v, [k]: Math.max(0, Number(e.target.value) || 0) })
      setAviso(null)
      setError(null)
    },
  })

  async function guardar() {
    setGuardando(true)
    setAviso(null)
    setError(null)
    const r = await guardarConfigCobranza(v)
    setGuardando(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo guardar.')
    setAviso('Ventanas guardadas. Las colas de cobranza ya las usan.')
  }

  return (
    <Card className="mt-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-[13px] font-extrabold text-ink">Ventanas de cobranza</h2>
        <Badge estado="neutro">Solo administrador</Badge>
      </div>
      <p className="mb-4 text-[11px] leading-snug text-muted">
        Deciden en qué cola cae cada equipo. Un equipo siempre aparece en{' '}
        <strong>una sola</strong>: la más severa que le corresponda.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Avisar antes de vencer" hint="Días antes del vencimiento.">
          <Input {...campo('dias_por_vencer')} />
        </Field>
        <Field label="Recordatorio desde" hint="Días de atraso.">
          <Input {...campo('dias_recordatorio')} />
        </Field>
        <Field
          label="Reclamo firme desde"
          hint="Días de atraso."
          error={ordenMal ? 'Tiene que ser mayor que el recordatorio.' : null}
        >
          <Input {...campo('dias_firme')} />
        </Field>
      </div>

      <p className="mt-3 rounded-md bg-panel px-3 py-2 text-[11px] leading-snug text-muted">
        Con estos valores: se avisa cuando falten <strong>{v.dias_por_vencer}</strong> días o menos;
        el recordatorio va entre los <strong>{v.dias_recordatorio}</strong> y los{' '}
        <strong>{Math.max(v.dias_firme - 1, v.dias_recordatorio)}</strong> días de atraso; el reclamo
        firme, desde los <strong>{v.dias_firme}</strong>.
      </p>

      {puedeEditar && (
        <div className="mt-4">
          <Button icon="check" loading={guardando} disabled={guardando || ordenMal} onClick={guardar}>
            Guardar las ventanas
          </Button>
        </div>
      )}

      {aviso && <p className="mt-3 rounded-md bg-okbg px-3 py-2 text-[11px] text-oktx">{aviso}</p>}
      {error && <p className="mt-3 rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">{error}</p>}

      {!puedeEditar && (
        <p className="mt-4 rounded-md bg-panel px-4 py-3 text-[11px] text-muted">
          Estás viendo las ventanas en modo lectura. Cambiarlas es de administrador: mueven a quién
          se le manda qué mensaje, para toda la cartera de una vez.
        </p>
      )}
    </Card>
  )
}
