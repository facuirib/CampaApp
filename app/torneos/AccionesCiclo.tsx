"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Badge, Button, Card, Field, Input } from '@/components/ui'
import { formatMoney } from '@/lib/format'

export interface DeudaTorneo {
  saldo: number
  cuotas: number
  equipos: number
}

export interface AccionesCicloProps {
  torneoId: string
  nombre: string
  estado: string
  /** El nombre del que ya está en curso, si hay otro. Deshabilita «Iniciar». */
  otroEnCurso: string | null
  fichas: number
  /** Lo impago de ESTE torneo, para el aviso al cerrar. */
  deuda: DeudaTorneo
}

/**
 * Iniciar, cerrar y reabrir un torneo.
 *
 * ── El aviso al cerrar es el punto de esta pantalla ───────────────────────
 *
 * Cerrar un torneo con deuda impaga es normal —siempre queda alguno que no
 * pagó— y por eso NO se bloquea: bloquearlo dejaría torneos abiertos para
 * siempre y el estado dejaría de significar nada.
 *
 * Lo que sí hay que decir es qué NO pasa al cerrar. La intuición es que cerrar
 * un torneo cierra sus cuentas, y no: la deuda sigue exigible y sigue
 * apareciendo en las colas de cobranza, que no miran el torneo. El diálogo lo
 * dice con el número delante, porque «quedan $4.470.000» se lee y «puede quedar
 * deuda» no.
 */
export default function AccionesCiclo({
  torneoId,
  nombre,
  estado,
  otroEnCurso,
  fichas,
  deuda,
}: AccionesCicloProps) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<null | 'cerrar' | 'reabrir'>(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function llamar(fn: 'iniciar_torneo' | 'cerrar_torneo' | 'reabrir_torneo') {
    setOcupado(true)
    setError(null)
    const supabase = createClient()
    // La puerta es la función: valida el rol, el estado y —en iniciar— que haya
    // fichas. La pantalla deshabilita para no ofrecer lo que va a fallar, pero
    // quien decide es la base.
    const { error: e } =
      fn === 'iniciar_torneo'
        ? await supabase.rpc(fn, { p_torneo_id: torneoId })
        : fn === 'cerrar_torneo'
          ? await supabase.rpc(fn, { p_torneo_id: torneoId, p_motivo: motivo || undefined })
          : await supabase.rpc(fn, { p_torneo_id: torneoId, p_motivo: motivo })
    setOcupado(false)
    if (e) return setError(e.message)
    setAbierto(null)
    setMotivo('')
    router.refresh()
  }

  if (estado === 'planificado') {
    const sinFichas = fichas === 0
    const frenado = otroEnCurso ?? (sinFichas ? 'sin fichas' : null)
    return (
      <div className="space-y-2">
        <Button
          size="pill"
          loading={ocupado}
          disabled={ocupado || !!frenado}
          onClick={() => llamar('iniciar_torneo')}
          // El motivo va en el title Y abajo: un botón gris sin explicación no
          // es accionable.
          title={
            otroEnCurso
              ? `Ya hay un torneo en curso: ${otroEnCurso}`
              : sinFichas
                ? 'Cargá los equipos antes de iniciarlo'
                : undefined
          }
        >
          Iniciar torneo
        </Button>
        {frenado && (
          <p className="text-[10.5px] leading-snug text-muted">
            {otroEnCurso
              ? `Hay que cerrar «${otroEnCurso}» antes.`
              : 'Todavía no tiene equipos cargados.'}
          </p>
        )}
        {error && <p className="text-[10.5px] text-errtx">{error}</p>}
      </div>
    )
  }

  if (estado === 'en_curso') {
    return (
      <div className="space-y-2">
        <Button size="pill" variant="secondary" onClick={() => setAbierto('cerrar')}>
          Cerrar torneo
        </Button>

        {abierto === 'cerrar' && (
          <Card className="mt-2">
            <h3 className="mb-2 text-[12px] font-extrabold text-ink">Cerrar «{nombre}»</h3>

            {deuda.cuotas > 0 ? (
              <div className="mb-3 rounded-md bg-warnbg px-3 py-2.5 text-[11px] leading-relaxed text-warntx">
                Quedan <strong className="font-bold">{formatMoney(deuda.saldo)}</strong> impagos en{' '}
                {deuda.cuotas} {deuda.cuotas === 1 ? 'cuota' : 'cuotas'} de {deuda.equipos}{' '}
                {deuda.equipos === 1 ? 'equipo' : 'equipos'}.
                <br />
                <strong className="font-bold">Cerrar el torneo no cancela esa deuda:</strong> sigue
                exigible y sigue apareciendo en las colas de cobranza. Se cierra la competencia, no
                la cuenta.
              </div>
            ) : (
              <p className="mb-3 text-[11px] text-muted">No queda deuda impaga en este torneo.</p>
            )}

            <Field label="Motivo" hint="Opcional. Queda para entender el cierre más adelante.">
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Field>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="pill" loading={ocupado} disabled={ocupado} onClick={() => llamar('cerrar_torneo')}>
                Cerrar el torneo
              </Button>
              <Button size="pill" variant="tertiary" onClick={() => setAbierto(null)}>
                Cancelar
              </Button>
            </div>
            {error && <p className="mt-2 text-[10.5px] text-errtx">{error}</p>}
          </Card>
        )}
      </div>
    )
  }

  if (estado === 'cerrado') {
    return (
      <div className="space-y-2">
        {/* Discreto: reabrir es deshacer, no una acción del día a día. */}
        <button
          type="button"
          onClick={() => setAbierto(abierto === 'reabrir' ? null : 'reabrir')}
          className="text-[10.5px] font-semibold text-muted underline hover:text-ink"
        >
          Reabrir
        </button>

        {abierto === 'reabrir' && (
          <Card className="mt-2">
            <h3 className="mb-1 text-[12px] font-extrabold text-ink">Reabrir «{nombre}»</h3>
            <p className="mb-3 text-[11px] leading-snug text-muted">
              Vuelve a ser el torneo en curso.{' '}
              {otroEnCurso
                ? `Hay que cerrar «${otroEnCurso}» antes: sólo puede haber uno.`
                : 'No hay ningún otro en curso, así que se puede.'}
            </p>
            <Field label="Motivo" required hint="Obligatorio: reabrir es deshacer algo.">
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Field>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="pill"
                loading={ocupado}
                disabled={ocupado || !motivo.trim() || !!otroEnCurso}
                onClick={() => llamar('reabrir_torneo')}
              >
                Reabrir
              </Button>
              <Button size="pill" variant="tertiary" onClick={() => setAbierto(null)}>
                Cancelar
              </Button>
            </div>
            {error && <p className="mt-2 text-[10.5px] text-errtx">{error}</p>}
          </Card>
        )}
      </div>
    )
  }

  return <Badge estado="neutro">—</Badge>
}
