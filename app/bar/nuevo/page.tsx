"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatDate } from '@/lib/format'
import { Button, Card, Field, Input, Money, Select } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type DiaBar = Database['public']['Views']['v_dia_cancha_bar']['Row']
type Predio = Database['public']['Tables']['predio']['Row']

/**
 * De dónde sale el dia_cancha del cierre.
 *
 * El cierre CUELGA de dia_cancha, así que antes de registrar hay que tener uno.
 * Casi siempre ya existe —el día tuvo fútbol— y sólo hay que elegirlo. Pero la
 * decisión 56 permite un dia_cancha sin jornada, o sea un día en que abrió el
 * bar y no se jugó, y ese día no está en ninguna lista todavía.
 *
 * Por eso dos modos y no uno:
 *
 *  · 'existente' — el caso normal, un Select de los días que todavía no tienen
 *    cierre vigente. Es la rama que se usa el 95% de las veces.
 *  · 'nuevo' — fecha + predio, y la pantalla llama a `crear_dia_cancha` antes
 *    de registrar. Es el día de solo bar.
 *
 * El modo 'nuevo' no se ofrece como "creá un día": se ofrece como "el día no
 * está en la lista". Que por dentro cree un dia_cancha es un detalle de
 * implementación que al que carga no le dice nada.
 */
type ModoDia = 'existente' | 'nuevo'

export default function NuevoCierreBarPage() {
  const router = useRouter()

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [dias, setDias] = useState<DiaBar[]>([])
  const [predios, setPredios] = useState<Predio[]>([])

  const [modo, setModo] = useState<ModoDia>('existente')
  const [diaCanchaId, setDiaCanchaId] = useState<string | null>(null)
  const [fechaNueva, setFechaNueva] = useState('')
  const [predioNuevo, setPredioNuevo] = useState<string | null>(null)

  const [efectivo, setEfectivo] = useState(0)
  const [tarjeta, setTarjeta] = useState(0)
  const [mp, setMp] = useState(0)
  const [observaciones, setObservaciones] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setErrorCarga(null)

      // Se traen TODOS los días, no sólo los libres: el modo 'nuevo' necesita
      // los ocupados para poder avisar antes de que la base rechace.
      const [{ data: diaData, error: errDia }, { data: predioData, error: errPredio }] =
        await Promise.all([
          supabase.from('v_dia_cancha_bar').select('*').order('fecha', { ascending: false }),
          supabase.from('predio').select('*').order('nombre'),
        ])

      if (cancelado) return

      if (errDia ?? errPredio) {
        setErrorCarga((errDia ?? errPredio)!.message)
        setCargando(false)
        return
      }

      setDias(diaData ?? [])
      setPredios(predioData ?? [])
      setCargando(false)
    }

    cargar()
    return () => {
      cancelado = true
    }
  }, [])

  const diasLibres = useMemo(() => dias.filter((d) => d.venta_bar_id === null), [dias])

  // Cálculo de UI para feedback inmediato, mismo criterio que la `diferencia`
  // de /arqueo/nuevo: son tres valores que se están tipeando y todavía no
  // existen en la base, así que ninguna vista puede darlos. El total REAL es la
  // columna generada de venta_bar, y es el que muestra la lista.
  const total = efectivo + tarjeta + mp

  /**
   * El choque de día, avisado ANTES de mandar.
   *
   * `registrar_venta_bar` ya lo rechaza —el índice parcial es la garantía de
   * verdad— pero el mensaje crudo aparece después de apretar. Detectarlo acá
   * convierte un error en una advertencia, que es la diferencia entre corregir
   * y descubrir.
   *
   * Sólo aplica al modo 'nuevo': el Select del modo 'existente' ya ofrece
   * únicamente días libres, así que ahí el choque no se puede armar.
   */
  const diaOcupado = useMemo(() => {
    if (modo !== 'nuevo' || !fechaNueva || !predioNuevo) return null
    return dias.find((d) => d.fecha === fechaNueva && d.predio_id === predioNuevo) ?? null
  }, [modo, fechaNueva, predioNuevo, dias])

  const chocaConCierre = diaOcupado != null && diaOcupado.venta_bar_id !== null

  const diaListo =
    modo === 'existente' ? diaCanchaId !== null : fechaNueva !== '' && predioNuevo !== null

  // Al menos un medio > 0: la misma regla que valida la función. Acá deshabilita
  // el botón en vez de dejar apretar para recibir un error.
  const puedeRegistrar = !enviando && diaListo && total > 0 && !chocaConCierre

  const predioElegido =
    modo === 'existente'
      ? (dias.find((d) => d.dia_cancha_id === diaCanchaId)?.predio_nombre ?? null)
      : (predios.find((p) => p.id === predioNuevo)?.nombre ?? null)

  async function registrar() {
    setEnviando(true)
    setError(null)
    setExito(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setEnviando(false)
      setError('Sesión vencida. Volvé a entrar para registrar el cierre.')
      return
    }

    let idDia = diaCanchaId

    // El día de solo bar se crea recién acá, al confirmar — no al tipear la
    // fecha. Crearlo antes dejaría dia_cancha huérfanos cada vez que alguien
    // abre el formulario, cambia de idea y se va.
    if (modo === 'nuevo') {
      // Si el día ya existía y está libre, se reusa en vez de crearlo: llamar a
      // crear_dia_cancha reventaría contra unique (fecha, predio_id).
      if (diaOcupado) {
        idDia = diaOcupado.dia_cancha_id
      } else {
        const { data: nuevoId, error: errDia } = await supabase.rpc('crear_dia_cancha', {
          p_fecha: fechaNueva,
          p_predio_id: predioNuevo!,
        })

        if (errDia) {
          setEnviando(false)
          setError(errDia.message)
          return
        }
        idDia = nuevoId
      }
    }

    const { error: errRpc } = await supabase.rpc('registrar_venta_bar', {
      p_dia_cancha_id: idDia!,
      p_efectivo: efectivo,
      p_tarjeta: tarjeta,
      p_mp: mp,
      p_observaciones: observaciones.trim() || undefined,
      p_created_by: user.id,
    })

    setEnviando(false)

    if (errRpc) {
      setError(errRpc.message)
      return
    }

    setExito('Cierre registrado.')
    setDiaCanchaId(null)
    setFechaNueva('')
    setPredioNuevo(null)
    setEfectivo(0)
    setTarjeta(0)
    setMp(0)
    setObservaciones('')
    router.refresh()
  }

  return (
    <div className="pb-10">
      <Link href="/bar" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver al bar
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Registrar cierre de bar</h1>
        <p className="mt-1 text-[12px] text-muted">
          Lo que vendió el bar en un día, por medio de cobro. Un cierre por día y predio.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && (
        <>
          <Card title="El día" icon="calendario" className="mb-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <Button
                size="pill"
                variant={modo === 'existente' ? 'secondary' : 'tertiary'}
                onClick={() => setModo('existente')}
              >
                Elegir un día
              </Button>
              <Button
                size="pill"
                variant={modo === 'nuevo' ? 'secondary' : 'tertiary'}
                onClick={() => setModo('nuevo')}
              >
                El día no está en la lista
              </Button>
            </div>

            {modo === 'existente' ? (
              diasLibres.length === 0 ? (
                <p className="rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
                  Todos los días registrados ya tienen su cierre de bar. Si el bar abrió un día en
                  que no se jugó, usá <strong>El día no está en la lista</strong>.
                </p>
              ) : (
                <Field label="Día de cancha" required>
                  <Select
                    placeholder="Elegir día…"
                    value={diaCanchaId ?? ''}
                    onChange={(e) => setDiaCanchaId(e.target.value || null)}
                  >
                    {diasLibres.map((d) => (
                      <option key={d.dia_cancha_id} value={d.dia_cancha_id!}>
                        {formatDate(d.fecha)} · {d.predio_nombre ?? d.predio}
                      </option>
                    ))}
                  </Select>
                </Field>
              )
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Fecha" required>
                    <Input
                      type="date"
                      value={fechaNueva}
                      onChange={(e) => setFechaNueva(e.target.value)}
                    />
                  </Field>
                  <Field label="Predio" required>
                    <Select
                      placeholder="Elegir predio…"
                      value={predioNuevo ?? ''}
                      onChange={(e) => setPredioNuevo(e.target.value || null)}
                    >
                      {predios.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                {chocaConCierre && (
                  <p className="mt-3 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
                    Ese día ya tiene un cierre de bar cargado. Si está mal, anulalo desde la lista y
                    volvé a cargarlo.
                  </p>
                )}

                {diaOcupado && !chocaConCierre && (
                  <p className="mt-3 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">
                    Ese día ya existe y no tiene cierre: se usa el que hay.
                  </p>
                )}

                {!diaOcupado && fechaNueva && predioNuevo && (
                  <p className="mt-3 text-[11px] text-muted">
                    Ese día no existe todavía. Se crea al confirmar — un día de bar no necesita que
                    se haya jugado.
                  </p>
                )}
              </>
            )}
          </Card>

          <Card title="Lo que se vendió" icon="monedas" className="mb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Efectivo" hint="Al cajón del bar.">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={efectivo || ''}
                  onChange={(e) => setEfectivo(parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Tarjeta">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tarjeta || ''}
                  onChange={(e) => setTarjeta(parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Mercado Pago">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mp || ''}
                  onChange={(e) => setMp(parseFloat(e.target.value) || 0)}
                />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Observaciones" hint="Opcional.">
                <Input
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Ej: se vendió solo en el entretiempo"
                />
              </Field>
            </div>

            <p className="mt-3 text-[11px] text-muted">
              Total del cierre: <Money value={total} className="font-bold text-ink" />
            </p>

            {total === 0 && (
              <p className="mt-1 text-[11px] text-muted">
                Un día sin ventas no se cierra: no se carga. Cargá al menos un medio.
              </p>
            )}

            <p className="mt-3 text-[11px] text-muted">
              Se registra lo que <strong>entró</strong>. La comisión de tarjeta y Mercado Pago no se
              descuenta acá.
            </p>
          </Card>

          {/* El asiento, antes de apretar.
              Mismo criterio que el resto del sistema: quien carga tiene que ver
              qué se va a escribir en el diario, no enterarse después. Sólo las
              líneas con monto, igual que arma la función.

              NO se usa <AsientoPreview>: ese componente exige `totalDebe` /
              `totalHaber` venidos de una función de preview, y su contrato dice
              explícitamente que sumarlos en el front sería el error que existe
              para evitar. Acá no hay preview en base —el cierre todavía no se
              escribió— así que se muestran las líneas y ningún total propio:
              el único total en pantalla es el de la tarjeta de arriba, que es
              feedback de lo que se está tipeando. */}
          {total > 0 && (
            <div className="mb-4 rounded-md border border-line bg-white px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[.06em] text-muted">
                Lo que se va a asentar
              </p>
              <ul className="mt-2 grid gap-1">
                {efectivo > 0 && (
                  <li className="flex justify-between gap-4 text-[11.5px]">
                    <span className="text-ink">
                      Bar Efectivo{predioElegido ? ` · ${predioElegido}` : ''}
                    </span>
                    <Money value={efectivo} className="font-bold text-ink" />
                  </li>
                )}
                {tarjeta > 0 && (
                  <li className="flex justify-between gap-4 text-[11.5px]">
                    <span className="text-ink">Tarjeta</span>
                    <Money value={tarjeta} className="font-bold text-ink" />
                  </li>
                )}
                {mp > 0 && (
                  <li className="flex justify-between gap-4 text-[11.5px]">
                    <span className="text-ink">Mercado Pago</span>
                    <Money value={mp} className="font-bold text-ink" />
                  </li>
                )}
                <li className="mt-1 flex justify-between gap-4 border-t border-line pt-1.5 text-[11.5px]">
                  <span className="text-muted">Ingresos bar (al haber)</span>
                  <Money value={total} className="font-bold text-ink" />
                </li>
              </ul>
            </div>
          )}

          {error && (
            <p className="mb-4 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
              {error}
            </p>
          )}

          {exito && (
            <p className="mb-4 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">
              {exito}{' '}
              <Link href="/bar" className="font-bold underline">
                Ver los cierres
              </Link>
            </p>
          )}

          <Button icon="check" loading={enviando} disabled={!puedeRegistrar} onClick={registrar}>
            Registrar cierre
          </Button>
        </>
      )}
    </div>
  )
}
