"use client"

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { notFound, useRouter } from 'next/navigation'
import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/db/client'
import { formatDate } from '@/lib/format'
import { Badge, Button, Card, Field, Input, type EstadoBadge } from '@/components/ui'

// v_calendario_jornadas todavía no está en database.types.ts (migración sin
// aplicar) — tipado local, mismo patrón que calendario/inscripciones.
interface JornadaCalendarioRow {
  jornada_id: string | null
  numero: number | null
  fecha: string | null
  estado: string | null
  serie: string | null
  serie_completa: string | null
  cuotas_atadas: number | null
}

function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Contempla los cuatro estados del dominio, igual que en /calendario. */
function estadoJornadaABadge(estado: string | null): { estado: EstadoBadge; label: string } {
  if (estado === 'suspendida') return { estado: 'vencido', label: 'Suspendida' }
  if (estado === 'reprogramada') return { estado: 'porVencer', label: 'Reprogramada' }
  if (estado === 'jugada') return { estado: 'ok', label: 'Jugada' }
  if (estado === 'programada') return { estado: 'neutro', label: 'Programada' }
  return { estado: 'neutro', label: estado ?? '—' }
}

export default function MoverJornadaPage({
  params,
}: {
  params: Promise<{ jornadaId: string }>
}) {
  const { jornadaId } = use(params)
  const router = useRouter()

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [jornada, setJornada] = useState<JornadaCalendarioRow | null>(null)
  const [cuotasAtadas, setCuotasAtadas] = useState(0)

  // Solo para reconstruir el «Volver al calendario» con el filtro puesto —
  // vienen de la URL (`page.tsx` los pasa en el rowHref), no de la jornada:
  // `serie` acá abajo es el NOMBRE de la serie, no su id.
  const [torneoId, setTorneoId] = useState<string | null>(null)
  const [serieId, setSerieId] = useState<string | null>(null)

  const [nuevaFecha, setNuevaFecha] = useState('')

  const [registrando, setRegistrando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null)
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)
  const [resultadoExito, setResultadoExito] = useState<string | null>(null)

  useEffect(() => {
    // ?serie=<uuid>&torneo=<uuid>, desde /calendario (ver su rowHref). Se lee
    // del location y no con useSearchParams, mismo motivo que /calendario/nueva:
    // no forzar un boundary de Suspense en una página que no necesita nada
    // del servidor.
    const qs = new URLSearchParams(window.location.search)
    setTorneoId(qs.get('torneo'))
    setSerieId(qs.get('serie'))
  }, [])

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setErrorCarga(null)

      const { data: jornadaData, error } = (await supabase
        .from('v_calendario_jornadas' as never)
        .select('*')
        .eq('jornada_id', jornadaId)
        .maybeSingle()) as unknown as {
        data: JornadaCalendarioRow | null
        error: PostgrestError | null
      }

      if (cancelado) return

      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setJornada(jornadaData)
      setCuotasAtadas(jornadaData?.cuotas_atadas ?? 0)
      setNuevaFecha(jornadaData?.fecha ?? hoyEnCordoba())
      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
  }, [jornadaId])

  const fechaPasada = !!nuevaFecha && nuevaFecha < hoyEnCordoba()
  const sinCambio = !!jornada?.fecha && nuevaFecha === jornada.fecha

  const puedeConfirmar = !registrando && !!nuevaFecha && !sinCambio

  // «Volver al calendario» con el mismo filtro puesto, no a la vista sin
  // filtrar — y de paso a /suspender, para que ESA pantalla lo tenga también.
  const paramsVolver = new URLSearchParams()
  if (torneoId) paramsVolver.set('torneo', torneoId)
  if (serieId) paramsVolver.set('serie', serieId)
  const qsVolver = paramsVolver.toString()
  const volverHref = qsVolver ? `/calendario?${qsVolver}` : '/calendario'
  const suspenderHref = `/calendario/${jornadaId}/suspender${qsVolver ? `?${qsVolver}` : ''}`

  async function borrar() {
    setBorrando(true)
    setErrorBorrado(null)
    const { error } = await createClient().rpc('borrar_jornada', {
      p_jornada_id: jornadaId,
    })
    setBorrando(false)
    if (error) {
      setErrorBorrado(error.message)
      return
    }
    // La jornada ya no existe: quedarse acá daría un 404.
    router.push(volverHref)
  }

  async function confirmar() {
    setRegistrando(true)
    setErrorRegistro(null)
    setResultadoExito(null)

    const supabase = createClient()

    const { data, error } = await supabase.rpc('mover_jornada', {
      p_jornada_id: jornadaId,
      p_nueva_fecha: nuevaFecha,
    })

    setRegistrando(false)

    if (error) {
      setErrorRegistro(error.message)
      return
    }

    // El mensaje sale de lo que la función HIZO, no de lo que se esperaba.
    // Este texto ya decía «N cuotas actualizadas» antes de que mover_jornada
    // tocara ninguna cuota — era la descripción de un comportamiento que no
    // existía. Ahora la función arrastra los vencimientos y devuelve el
    // resumen real: movidas e intactas vienen de ahí.
    const r = data as unknown as {
      cuotas_movidas: number
      cuotas_pagadas_intactas: number
      reprogramada: boolean
    } | null
    const movidas = r?.cuotas_movidas ?? 0
    const pagadas = r?.cuotas_pagadas_intactas ?? 0
    setResultadoExito(
      `Jornada movida al ${formatDate(nuevaFecha)}. ` +
        (movidas > 0
          ? `${movidas} cuota${movidas === 1 ? '' : 's'} impaga${movidas === 1 ? '' : 's'} ahora vence${movidas === 1 ? '' : 'n'} ese día.`
          : 'Sin cuotas impagas que mover.') +
        (pagadas > 0 ? ` Las ${pagadas} ya pagadas no se tocaron.` : ''),
    )
  }

  // El 404 es del recurso, no un estado más de la pantalla: se resuelve acá,
  // durante el render, para que lo capture el not-found más cercano.
  if (!cargando && !errorCarga && !jornada) {
    notFound()
  }

  return (
    <div className="pb-10">
      <Link href={volverHref} className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver al calendario
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Mover jornada</h1>
        <p className="mt-1 text-[12px] text-muted">
          Reprograma la fecha. No genera asiento — solo mueve el calendario.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && jornada && (
        <>
          <Card title="Jornada" icon="calendario" className="mb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Jornada
                </div>
                <div className="text-[11.5px] text-ink">
                  {jornada.numero != null ? `Fecha ${jornada.numero}` : '—'} ·{' '}
                  {jornada.serie_completa ?? jornada.serie ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Fecha actual
                </div>
                <div className="text-[11.5px] text-ink">{formatDate(jornada.fecha)}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Estado
                </div>
                <Badge estado={estadoJornadaABadge(jornada.estado).estado}>
                  {estadoJornadaABadge(jornada.estado).label}
                </Badge>
              </div>
            </div>
          </Card>

          <div
            className={`mb-4 rounded-md px-4 py-3 text-[11px] ${
              cuotasAtadas > 0 ? 'bg-warnbg text-warntx' : 'bg-line2 text-muted'
            }`}
          >
            {cuotasAtadas > 0 ? (
              <>
                Mover esta jornada cambiará el vencimiento de <strong>{cuotasAtadas}</strong> cuota
                {cuotasAtadas === 1 ? '' : 's'} de liga de los equipos de{' '}
                {jornada.serie_completa ?? jornada.serie ?? 'esta serie'}: las impagas pasan a
                vencer la fecha nueva. Las ya pagadas no se tocan.
              </>
            ) : (
              'No hay cuotas atadas a esta jornada todavía.'
            )}
          </div>

          <Card title="Nueva fecha" icon="calendario" className="mb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Nueva fecha" required>
                <Input
                  type="date"
                  value={nuevaFecha}
                  onChange={(e) => setNuevaFecha(e.target.value)}
                />
              </Field>
            </div>

            {fechaPasada && (
              <p className="mt-3 rounded-md bg-warnbg px-3 py-2 text-[11px] text-warntx">
                Estás moviendo la jornada a una fecha pasada. Verificá que sea correcto.
              </p>
            )}
          </Card>

          {errorRegistro && (
            <p className="mb-4 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
              {errorRegistro}
            </p>
          )}

          {resultadoExito && (
            <p className="mb-4 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">
              {resultadoExito}{' '}
              <Link href={volverHref} className="font-bold underline">
                Volver al calendario
              </Link>
            </p>
          )}

          <Button
            icon="check"
            loading={registrando}
            disabled={!puedeConfirmar}
            onClick={confirmar}
          >
            Mover jornada
          </Button>

          {jornada.estado !== 'suspendida' && (
            <div className="mt-3">
              <Link
                href={suspenderHref}
                className="text-[11px] font-semibold text-muted underline hover:text-ink"
              >
                ¿No se jugó? Suspender esta jornada
              </Link>
            </div>
          )}

          {/* ── Borrar, sólo para el error de carga ─────────────────────────
              La línea entre borrar y suspender es qué tocó el mundo: con
              cuotas atadas el botón NI APARECE — esa jornada es parte del
              compromiso de pago y su camino es suspender. Sin cuotas, es una
              fila que nada referencia, y la función igual re-verifica todo
              (asientos, pagos, gastos, reprogramaciones) antes de borrar. */}
          {cuotasAtadas === 0 && (
            <div className="mt-8 border-t border-line pt-4">
              <p className="mb-2 max-w-prose text-[11px] leading-snug text-muted">
                Esta jornada no tiene cuotas atadas. Si se creó por error —un número de más, la
                serie equivocada— se puede borrar: desaparece del calendario como si nunca hubiera
                existido. Para la jornada real que no se jugó, el camino es suspender.
              </p>
              {errorBorrado && (
                <p className="mb-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
                  {errorBorrado}
                </p>
              )}
              <Button
                size="pill"
                variant="tertiary"
                icon="borrar"
                loading={borrando}
                disabled={borrando || registrando}
                onClick={borrar}
              >
                Borrar esta jornada
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}