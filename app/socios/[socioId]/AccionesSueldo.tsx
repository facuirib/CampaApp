"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui'
import { formatMoney } from '@/lib/format'
import { ajustarSueldoDelMes, cambiarSueldoAcordado } from './acciones'

/** Un mes elegible para el ajuste, con lo que impide elegirlo si lo hay. */
export interface OpcionMes {
  periodo_id: string
  etiqueta: string
  /** Si ya se devengó, el monto. Ese mes no admite excepción (regla 4). */
  devengado: number | null
  /** Si ya tiene una excepción cargada, su monto. */
  excepcion: number | null
  cerrado: boolean
}

export interface AccionesSueldoProps {
  socioId: string
  socio: string
  sueldoVigente: number | null
  meses: OpcionMes[]
  /**
   * Si el rol puede escribir. Baja RESUELTO desde la Server Page: quién puede
   * qué se decidió en `lib/permisos` y está verificado contra las policies.
   */
  puedeEditar: boolean
}

type Abierto = null | 'acordado' | 'mes'

/**
 * Las dos acciones sobre el sueldo de un socio.
 *
 * ── Están separadas en la pantalla porque son distintas de verdad ──────────
 *
 * Los dos formularios piden un monto contra un socio. Lo que los distingue no
 * es lo que se escribe, es **hasta cuándo dura**:
 *
 *   Cambiar el sueldo acordado  →  rige de acá en adelante, para siempre
 *   Ajustar un mes puntual      →  un mes, y el acuerdo queda como estaba
 *
 * Una sola pantalla con una casilla «sólo por este mes» sería más corta y
 * bastante peor: el tilde que se olvida convierte «este mes le pagamos menos»
 * en «le bajamos el sueldo», los dos caminos muestran el mismo cartel de éxito,
 * y el error recién aparece el mes que viene en la proyección. Dos botones con
 * nombre propio y un solo formulario abierto por vez cuestan un clic más y no
 * dejan lugar a esa confusión.
 *
 * Cada uno abre con una línea que dice qué va a pasar —no qué campo llenar— y
 * el botón de confirmar repite la consecuencia, no la acción.
 */
export default function AccionesSueldo({
  socioId,
  socio,
  sueldoVigente,
  meses,
  puedeEditar,
}: AccionesSueldoProps) {
  const router = useRouter()

  const [abierto, setAbierto] = useState<Abierto>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hoy = new Date().toISOString().slice(0, 10)
  const [monto, setMonto] = useState('')
  const [desde, setDesde] = useState(hoy)
  const [periodoId, setPeriodoId] = useState('')
  const [motivo, setMotivo] = useState('')

  const elegido = meses.find((m) => m.periodo_id === periodoId) ?? null
  // El mes ya devengado no se puede ajustar: el asiento ya movió el saldo, y la
  // excepción encima no lo corregiría (regla 4). Se dice acá y lo vuelve a
  // frenar el trigger, con el mismo mensaje.
  const mesBloqueado = elegido?.devengado != null || elegido?.cerrado === true

  function abrir(cual: Exclude<Abierto, null>) {
    setAbierto(abierto === cual ? null : cual)
    setAviso(null)
    setError(null)
    setMonto('')
    setMotivo('')
    setPeriodoId('')
    setDesde(hoy)
  }

  async function correr(accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
    setOcupado(true)
    setAviso(null)
    setError(null)
    const r = await accion()
    setOcupado(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo guardar.')
    setAbierto(null)
    setAviso(exito)
    router.refresh()
  }

  const montoNum = Number(monto)
  const montoOk = monto.trim() !== '' && Number.isFinite(montoNum) && montoNum >= 0

  if (!puedeEditar) {
    return (
      <p className="mb-6 rounded-md bg-panel px-4 py-3 text-[11px] text-muted">
        Estás viendo el sueldo en modo lectura. Cambiarlo —o ajustar un mes puntual— es de
        administrador o finanzas.
      </p>
    )
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={abierto === 'acordado' ? 'primary' : 'secondary'}
          icon="editar"
          onClick={() => abrir('acordado')}
        >
          Cambiar el sueldo acordado
        </Button>
        <Button
          variant={abierto === 'mes' ? 'primary' : 'secondary'}
          icon="plus"
          onClick={() => abrir('mes')}
        >
          Ajustar un mes puntual
        </Button>
      </div>

      {abierto === 'acordado' && (
        <Card>
          <h2 className="text-[13px] font-extrabold text-ink">Cambiar el sueldo acordado</h2>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Cambia el acuerdo <strong>de acá en adelante</strong>: rige desde la fecha que pongas y
            para todos los meses siguientes, hasta que alguien lo vuelva a cambiar.{' '}
            {sueldoVigente == null
              ? `${socio} no tiene sueldo acordado todavía.`
              : `Hoy son ${formatMoney(sueldoVigente)} por mes.`}{' '}
            La vigencia anterior no se borra: queda en el historial, que es lo que permite
            recalcular un mes viejo con el sueldo que regía entonces.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Sueldo mensual" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </Field>
            <Field label="Rige desde" required hint="Los meses anteriores no se tocan.">
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              icon="check"
              loading={ocupado}
              disabled={ocupado || !montoOk || !desde}
              onClick={() =>
                correr(
                  () => cambiarSueldoAcordado(socioId, montoNum, desde),
                  `El sueldo acordado de ${socio} pasa a ${formatMoney(montoNum)} por mes.`,
                )
              }
            >
              {montoOk ? `Fijar ${formatMoney(montoNum)} por mes de acá en adelante` : 'Fijar el sueldo nuevo'}
            </Button>
            <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {abierto === 'mes' && (
        <Card>
          <h2 className="text-[13px] font-extrabold text-ink">Ajustar un mes puntual</h2>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Vale <strong>sólo para el mes que elijas</strong>. El sueldo acordado queda como está y
            los demás meses siguen cobrando lo de siempre. Es para el mes que se acordó distinto por
            algo puntual, no para un cambio de sueldo.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Mes" required>
              <Select
                placeholder="Elegí el mes"
                value={periodoId}
                onChange={(e) => setPeriodoId(e.target.value)}
              >
                {meses.map((m) => (
                  <option key={m.periodo_id} value={m.periodo_id}>
                    {m.etiqueta}
                    {m.cerrado
                      ? ' — período cerrado'
                      : m.devengado != null
                        ? ` — ya devengado por ${formatMoney(m.devengado)}`
                        : m.excepcion != null
                          ? ` — ya ajustado a ${formatMoney(m.excepcion)}`
                          : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sueldo de ese mes" required hint="Cero significa que ese mes no cobra.">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </Field>
            <Field
              label="Motivo"
              required
              className="sm:col-span-2"
              hint="Es lo único que va a distinguir esto de un error de tipeo dentro de seis meses."
            >
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Noviembre sin torneo: se acordó pagar de menos."
              />
            </Field>
          </div>

          {mesBloqueado && (
            <p className="mt-3 rounded-md bg-warnbg px-3 py-2 text-[11px] text-warntx">
              {elegido?.cerrado
                ? 'Ese período está cerrado.'
                : `Ese mes ya se devengó por ${formatMoney(elegido!.devengado!)}. Para corregirlo hay que anular ese devengo y volver a correrlo.`}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              icon="check"
              loading={ocupado}
              disabled={ocupado || !montoOk || !periodoId || !motivo.trim() || mesBloqueado}
              onClick={() =>
                correr(
                  () => ajustarSueldoDelMes(socioId, periodoId, montoNum, motivo),
                  `${elegido?.etiqueta ?? 'El mes'} queda en ${formatMoney(montoNum)} para ${socio}. El sueldo acordado no cambió.`,
                )
              }
            >
              {montoOk && elegido
                ? `Ajustar sólo ${elegido.etiqueta} a ${formatMoney(montoNum)}`
                : 'Ajustar sólo ese mes'}
            </Button>
            <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {aviso && (
        <p className="rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">
          <Badge estado="ok">Listo</Badge> <span className="ml-1">{aviso}</span>
        </p>
      )}
      {error && <p className="rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error}</p>}
    </div>
  )
}
