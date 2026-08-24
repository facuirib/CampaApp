"use client"

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate, formatMoney } from '@/lib/format'
import {
  AsientoPreview,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  type LineaAsiento,
} from '@/components/ui'

/**
 * Las acciones de un cheque pendiente.
 *
 * Sólo se monta cuando el cheque está pendiente: un cheque resuelto no admite
 * ninguna transición —`cambiar_estado_cheque` corta con «ya está en estado X»—
 * y la pantalla no ofrece lo que va a fallar. La copia de lectura del caso
 * resuelto queda en el Server Component, que no necesita JavaScript para eso.
 *
 * Las tres acciones son la MISMA función de base con distinto `nuevo_estado`.
 * Se separan acá porque son tres actos distintos para el que las usa: dos
 * mueven plata entre cuentas propias, y la tercera deshace un cobro.
 */

type Sentido = 'recibido' | 'emitido'
type Accion = 'acreditado' | 'debitado' | 'rechazado'

interface Caja {
  id: string
  nombre: string
  tipo: string
  cuenta_codigo: string
  cuenta_nombre: string
}

interface CuotaQueReabre {
  cuota_id: string
  numero: number | null
  vence_at: string | null
  imputado: number
}

export interface AccionesChequeProps {
  chequeId: string
  sentido: Sentido
  monto: number
  numero: string | null
  contraparte: string | null
  pagoId: string | null
  asientoAltaId: string | null
  /**
   * Acreditar y debitar: el curso normal del cheque. admin + operador.
   *
   * Los dos permisos bajan RESUELTOS desde la Server Page —booleanos, no el
   * rol— por dos motivos. Uno, el rol sólo se puede leer en el servidor. Dos,
   * si acá llegara el rol, esta isla tendría que volver a decidir *quién puede
   * qué*, y esa decisión ya está tomada en `lib/permisos` y verificada contra
   * las policies: repetirla es la forma más silenciosa de que las dos se
   * separen.
   */
  puedeMover: boolean
  /**
   * Rechazar: **solo admin**, y es el único lugar del sistema donde dos
   * botones vecinos tienen permisos distintos.
   *
   * No se puede resolver no renderizando la isla, como en el bar: el operador
   * necesita la isla para acreditar. Lo que desaparece es un botón de adentro.
   *
   * Del otro lado hay una guarda dentro de `cambiar_estado_cheque` —no una
   * policy, porque es la misma función y la misma tabla que acreditar—, así que
   * si este booleano se pusiera mal, la base igual lo frena. Pero frenarlo acá
   * es lo que evita ofrecer un botón que va a fallar.
   */
  puedeRechazar: boolean
}

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const CAJAS_VALIDAS_CHEQUE = ['CAJA_TRANSFERENCIA', 'CAJA_CENTRAL']

export default function AccionesCheque({
  chequeId,
  sentido,
  monto,
  numero,
  contraparte,
  pagoId,
  asientoAltaId,
  puedeMover,
  puedeRechazar,
}: AccionesChequeProps) {
  const router = useRouter()
  const esRecibido = sentido === 'recibido'

  const [accion, setAccion] = useState<Accion | null>(null)
  const [fecha, setFecha] = useState(hoyEnCordoba())

  const [cajas, setCajas] = useState<Caja[]>([])
  const [cajaId, setCajaId] = useState('')

  // Sólo para el rechazo: la reversa real y lo que vuelve a deberse.
  const [reversa, setReversa] = useState<LineaAsiento[] | null>(null)
  const [cuotas, setCuotas] = useState<CuotaQueReabre[]>([])
  const [entendido, setEntendido] = useState(false)

  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null)

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  // La lista blanca vive a nivel de módulo: adentro del componente se recrea
  // en cada render y useCallback la trata como dependencia cambiante.
  /**
   * Las cajas que se pueden elegir.
   *
   * `cambiar_estado_cheque` acepta cualquier caja, pero varias producirían datos
   * rotos. La lista es BLANCA y no negra, por lo que pasó el 21/08: el modelo de
   * bar agregó tres cajas —Bar Efectivo, Tarjeta, Mercado Pago— y el filtro por
   * exclusión que había acá las dejó pasar a todas sin que nadie las agregara.
   * Un cheque se podía acreditar en el cajón del bar.
   *
   * Con lista blanca, una caja nueva queda AFUERA hasta que alguien la piense.
   * Es la diferencia entre olvidarse de excluir —silencioso— y olvidarse de
   * incluir —visible, porque la caja no aparece.
   *
   * Las dos que entran, y por qué son las únicas:
   *
   *  · CAJA_TRANSFERENCIA — el cheque se deposita en el banco. Es el caso normal.
   *  · CAJA_CENTRAL — se cobra por ventanilla y el efectivo entra a la central,
   *    que no tiene predio.
   *
   * Lo que queda afuera y por qué: el EFECTIVO DE PREDIO, porque la función
   * llama a `crear_asiento` sin `predio_id` y un movimiento de efectivo sin
   * predio no se puede arquear (regla 9) — vale igual para BAR_EFECTIVO; USD,
   * porque el promedio ponderado se lleva en `comprar_usd` / `vender_usd` y
   * meter pesos por otro lado lo corre en silencio; TARJETA y MERCADO_PAGO,
   * porque un cheque no se cobra por esas vías.
   */

  const cargarCajas = useCallback(async () => {
    const supabase = createClient()
    const [{ data: cajaData, error: errCaja }, { data: cuentaData, error: errCuenta }] =
      await Promise.all([
        supabase.from('caja').select('id, nombre, tipo, predio_id, cuenta_id').eq('activo', true).order('nombre'),
        supabase.from('cuenta').select('id, codigo, nombre'),
      ])

    if (errCaja ?? errCuenta) {
      setErrorDetalle((errCaja ?? errCuenta)!.message)
      return
    }

    const porId = new Map((cuentaData ?? []).map((c) => [c.id, c]))

    setCajas(
      (cajaData ?? [])
        .map((c) => {
          const cuenta = c.cuenta_id ? porId.get(c.cuenta_id) : undefined
          return {
            id: c.id,
            nombre: c.nombre,
            tipo: c.tipo,
            cuenta_codigo: cuenta?.codigo ?? '',
            cuenta_nombre: cuenta?.nombre ?? '',
          }
        })
        .filter((c) => CAJAS_VALIDAS_CHEQUE.includes(c.cuenta_codigo)),
    )
  }, [])

  /**
   * Lo que el rechazo va a deshacer, leído de la base — no reconstruido.
   *
   * `anular_asiento` invierte las líneas del original, así que el contraasiento
   * se muestra dando vuelta el debe y el haber del asiento del cobro tal como
   * está escrito. Armarlo de memoria sería previsualizar un asiento distinto
   * del que se va a escribir.
   *
   * Las cuotas salen de `pago_imputacion`: son exactamente las filas que el
   * DELETE borra, y cada una vuelve a figurar impaga por su propio importe. No
   * se suma nada acá — cada monto es el de su fila.
   */
  const cargarRechazo = useCallback(async () => {
    if (!asientoAltaId) return

    setCargandoDetalle(true)
    setErrorDetalle(null)
    const supabase = createClient()

    const { data: lineas, error: errLineas } = await supabase
      .from('v_asiento_detalle')
      .select('cuenta_codigo, cuenta, debe, haber')
      .eq('asiento_id', asientoAltaId)

    if (errLineas) {
      setErrorDetalle(errLineas.message)
      setCargandoDetalle(false)
      return
    }

    setReversa(
      (lineas ?? [])
        .map((l) => ({
        cuenta: l.cuenta_codigo ?? '',
        nombre: l.cuenta,
        // El contraasiento invierte: lo que estaba al debe va al haber.
          debe: l.haber != null && Number(l.haber) !== 0 ? Number(l.haber) : null,
          haber: l.debe != null && Number(l.debe) !== 0 ? Number(l.debe) : null,
        }))
        // Debe primero: AsientoPreview indenta el haber DEBAJO del debe, como
        // se escribe un asiento a mano. `v_asiento_detalle` las devuelve en el
        // orden del original, que al invertirse queda al revés.
        .sort((a, b) => (a.debe != null ? 0 : 1) - (b.debe != null ? 0 : 1)),
    )

    if (pagoId) {
      const { data: imps, error: errImp } = await supabase
        .from('pago_imputacion')
        .select('cuota_id, monto')
        .eq('pago_id', pagoId)

      if (errImp) {
        setErrorDetalle(errImp.message)
        setCargandoDetalle(false)
        return
      }

      const ids = (imps ?? []).map((i) => i.cuota_id)
      const { data: det } = ids.length
        ? await supabase.from('v_estado_cuota').select('id, numero, vence_at').in('id', ids)
        : { data: [] }

      const porCuota = new Map((det ?? []).map((c) => [c.id, c]))

      setCuotas(
        (imps ?? []).map((i) => ({
          cuota_id: i.cuota_id,
          numero: porCuota.get(i.cuota_id)?.numero ?? null,
          vence_at: porCuota.get(i.cuota_id)?.vence_at ?? null,
          imputado: Number(i.monto),
        })),
      )
    }

    setCargandoDetalle(false)
  }, [asientoAltaId, pagoId])

  useEffect(() => {
    if (accion === 'acreditado' || accion === 'debitado') cargarCajas()
    if (accion === 'rechazado') cargarRechazo()
  }, [accion, cargarCajas, cargarRechazo])

  function elegir(a: Accion) {
    setAccion(a)
    setError(null)
    setErrorDetalle(null)
    setEntendido(false)
    setCajaId('')
  }

  function cancelar() {
    setAccion(null)
    setError(null)
    setEntendido(false)
    setCajaId('')
  }

  const caja = cajas.find((c) => c.id === cajaId)

  /**
   * El asiento de acreditación / débito.
   *
   * Espeja línea por línea lo que escribe `cambiar_estado_cheque`: contra la
   * cuenta de la caja elegida, y del otro lado la cuenta puente que el alta
   * había dejado abierta. Mismo patrón que /activos/amortizar — no hay una
   * `preview_cheque` en la base todavía, y mientras no la haya el espejo se
   * mantiene a mano.
   */
  const lineasMovimiento: LineaAsiento[] | null = !caja
    ? null
    : accion === 'acreditado'
      ? [
          { cuenta: caja.cuenta_codigo, nombre: caja.cuenta_nombre, debe: monto },
          { cuenta: 'VALORES_A_DEPOSITAR', nombre: 'Valores a depositar', haber: monto },
        ]
      : [
          { cuenta: 'CHEQUES_A_PAGAR', nombre: 'Cheques a pagar', debe: monto },
          { cuenta: caja.cuenta_codigo, nombre: caja.cuenta_nombre, haber: monto },
        ]

  const puedeConfirmar =
    !enviando &&
    !!fecha &&
    (accion === 'rechazado'
      ? entendido && !!reversa && !cargandoDetalle
      : !!cajaId && !!lineasMovimiento)

  async function confirmar() {
    if (!accion) return

    setEnviando(true)
    setError(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setEnviando(false)
      setError('Sesión vencida. Volvé a entrar para registrar el movimiento.')
      return
    }

    const { error: errRpc } = await supabase.rpc('cambiar_estado_cheque', {
      p_cheque_id: chequeId,
      p_nuevo_estado: accion,
      p_caja_id: accion === 'rechazado' ? undefined : cajaId,
      p_fecha: fecha,
      p_responsable_id: user.id,
    })

    setEnviando(false)

    if (errRpc) {
      setError(errRpc.message)
      return
    }

    setAccion(null)
    setExito(
      accion === 'acreditado'
        ? `Cheque acreditado en ${caja?.nombre ?? 'la caja elegida'}.`
        : accion === 'debitado'
          ? `Cheque debitado de ${caja?.nombre ?? 'la caja elegida'}.`
          : 'Cheque rechazado: el cobro quedó anulado y la deuda volvió a abrirse.',
    )
    // La pantalla es un Server Component: sin esto seguiría mostrando el cheque
    // pendiente y los KPIs viejos hasta una recarga completa.
    router.refresh()
  }

  if (exito) {
    return (
      <p className="rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">{exito}</p>
    )
  }

  // ── Nada elegido todavía: sólo las acciones válidas para este cheque ──────
  if (!accion) {
    return (
      <div className="rounded-md border border-line bg-white px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {esRecibido ? (
            <>
              {puedeMover && (
                <Button icon="check" onClick={() => elegir('acreditado')}>
                  Acreditar
                </Button>
              )}
              {puedeRechazar && (
                <Button variant="tertiary" icon="alerta" onClick={() => elegir('rechazado')}>
                  Rechazar
                </Button>
              )}
            </>
          ) : (
            puedeMover && (
              <Button icon="check" onClick={() => elegir('debitado')}>
                Debitar
              </Button>
            )
          )}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          {esRecibido ? (
            <>
              <strong className="font-semibold text-ink">Acreditar</strong> es el banco pagándolo:
              la plata pasa de <span className="cifra">Valores a depositar</span> a la caja.{' '}
              <strong className="font-semibold text-ink">Rechazar</strong> es lo contrario —
              deshace el cobro y vuelve a dejar la deuda abierta.
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink">Debitar</strong> es el banco pagándolo: se
              cancela <span className="cifra">Cheques a pagar</span> y la plata sale de la caja.
            </>
          )}
        </p>
      </div>
    )
  }

  // ── Rechazo ───────────────────────────────────────────────────────────────
  if (accion === 'rechazado') {
    return (
      <Card title="Rechazar el cheque" icon="alerta">
        <p className="text-[11.5px] text-ink">
          El banco no pagó este cheque. Rechazarlo{' '}
          <strong className="font-bold">no es un cambio de estado</strong>: deshace el cobro que le
          dio origen.
        </p>

        <ul className="mt-3 space-y-1.5 text-[11px] text-ink">
          <li>
            · Se <strong className="font-semibold">anula el asiento del cobro</strong> con un
            contraasiento. El original queda marcado, no se borra.
          </li>
          <li>
            · Se borran las imputaciones del pago, así que{' '}
            <strong className="font-semibold">
              {cuotas.length === 1 ? 'la cuota vuelve' : 'las cuotas vuelven'} a figurar
              {cuotas.length === 1 ? ' impaga' : ' impagas'}
            </strong>{' '}
            y {contraparte ? <strong className="font-semibold">{contraparte}</strong> : 'el equipo'}{' '}
            vuelve a deber esa plata.
          </li>
        </ul>

        {cargandoDetalle && <p className="mt-3 text-[11px] text-muted">Leyendo el cobro…</p>}

        {errorDetalle && (
          <p className="mt-3 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorDetalle}</p>
        )}

        {/* ── Lo que vuelve a deberse ────────────────────────────────────────
            Una fila por cuota, con SU importe imputado. No se suma nada: cada
            número es el de su fila, tal como está en `pago_imputacion`. */}
        {cuotas.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-md border border-errtx/25 bg-errbg/40">
            <p className="border-b border-errtx/20 px-3 py-2 text-[10px] font-bold uppercase tracking-[.05em] text-errtx">
              Vuelve a deberse
            </p>
            <table className="w-full text-[11px]">
              <tbody>
                {cuotas.map((c) => (
                  <tr key={c.cuota_id} className="border-b border-errtx/10 last:border-0">
                    <td className="px-3 py-2 text-ink">
                      Cuota {c.numero ?? '—'}
                      {c.vence_at && (
                        <span className="ml-1 text-muted">· vencía {formatDate(c.vence_at)}</span>
                      )}
                    </td>
                    <td className="cifra px-3 py-2 text-right font-bold text-errtx">
                      {formatMoney(c.imputado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cuotas.length === 0 && !cargandoDetalle && (
          <p className="mt-4 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
            Este cheque no tiene imputaciones asociadas, así que no hay cuotas que reabrir. Se anula
            el asiento igual: el activo en <span className="cifra">Valores a depositar</span> tiene
            que salir.
          </p>
        )}

        {/* El contraasiento se lee de la base y se muestra invertido: es
            exactamente lo que va a escribir `anular_asiento`. */}
        {reversa && (
          <div className="mt-4">
            <AsientoPreview
              lineas={reversa}
              totalDebe={monto}
              totalHaber={monto}
              balanceado
              descripcion={`Anulación del cobro · Cheque rechazado${numero ? ` · ${numero}` : ''}`}
              fecha={fecha}
            />
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Fecha del rechazo" required hint="Es la fecha del contraasiento.">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>

        {/* ── Irreversible ───────────────────────────────────────────────────
            `cambiar_estado_cheque` sólo actúa desde 'pendiente'. Una vez
            rechazado no hay transición de vuelta, y por eso la confirmación
            pide un acto aparte del click: el botón solo es demasiado barato
            para algo que reabre una deuda y no se deshace. */}
        <div className="mt-4 rounded-md bg-warnbg px-4 py-3">
          <p className="text-[11px] font-bold text-warntx">Esto no se puede deshacer.</p>
          <p className="mt-1 text-[11px] text-warntx">
            Un cheque sólo cambia de estado desde <em>pendiente</em>. Una vez rechazado queda
            rechazado: no hay «des-rechazar». Si después el equipo paga, se registra un cobro nuevo.
          </p>
          <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[11px] text-warntx">
            <input
              type="checkbox"
              checked={entendido}
              onChange={(e) => setEntendido(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-current"
            />
            <span>
              Entiendo que se anula el cobro,{' '}
              {cuotas.length === 1 ? 'la cuota vuelve' : 'las cuotas vuelven'} a figurar
              {cuotas.length === 1 ? ' impaga' : ' impagas'}, y que la acción es definitiva.
            </span>
          </label>
        </div>

        {error && (
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon="alerta"
            loading={enviando}
            disabled={!puedeConfirmar}
            onClick={confirmar}
          >
            Rechazar el cheque
          </Button>
          <Button variant="tertiary" disabled={enviando} onClick={cancelar}>
            Cancelar
          </Button>
        </div>
      </Card>
    )
  }

  // ── Acreditar / debitar ───────────────────────────────────────────────────
  const esAcreditar = accion === 'acreditado'

  return (
    <Card title={esAcreditar ? 'Acreditar el cheque' : 'Debitar el cheque'} icon="banco">
      <p className="text-[11.5px] text-muted">
        {esAcreditar ? (
          <>
            El banco pagó el cheque. Entran{' '}
            <span className="cifra font-bold text-ink">{formatMoney(monto)}</span> a la caja que
            elijas, y <span className="cifra">Valores a depositar</span> se cancela.
          </>
        ) : (
          <>
            El banco debitó el cheque. Salen{' '}
            <span className="cifra font-bold text-ink">{formatMoney(monto)}</span> de la caja que
            elijas, y <span className="cifra">Cheques a pagar</span> se cancela.
          </>
        )}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field
          label={esAcreditar ? 'Caja donde entra' : 'Caja de donde sale'}
          required
          hint="La función necesita saber a qué caja va: no hay una por defecto."
        >
          <Select
            placeholder="Elegir caja…"
            value={cajaId}
            onChange={(e) => setCajaId(e.target.value)}
          >
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fecha" required hint="Es la fecha del asiento.">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
      </div>

      <p className="mt-2 text-[10.5px] text-muted">
        No figuran las cajas de efectivo de predio —el asiento saldría sin predio y no se podría
        arquear— ni la de dólares.
      </p>

      {errorDetalle && (
        <p className="mt-3 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorDetalle}</p>
      )}

      {lineasMovimiento && (
        <div className="mt-4">
          <AsientoPreview
            lineas={lineasMovimiento}
            totalDebe={monto}
            totalHaber={monto}
            balanceado
            descripcion={`Cheque ${sentido} · ${esAcreditar ? 'acreditado' : 'debitado'}`}
            fecha={fecha}
          />
        </div>
      )}

      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button icon="check" loading={enviando} disabled={!puedeConfirmar} onClick={confirmar}>
          {esAcreditar ? 'Acreditar' : 'Debitar'} {formatMoney(monto)}
        </Button>
        <Button variant="tertiary" disabled={enviando} onClick={cancelar}>
          Cancelar
        </Button>
        {!cajaId && <Badge estado="neutro">Falta elegir la caja</Badge>}
      </div>
    </Card>
  )
}
