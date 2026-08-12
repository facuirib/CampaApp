"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/db/client'
import { Button, Card, Field, Input, Select } from '@/components/ui'

// v_calendario_jornadas todavía no está en database.types.ts (migración sin
// aplicar) — tipado local, mismo patrón que el resto de /calendario.
interface JornadaCalendarioRow {
  jornada_id: string | null
  numero: number | null
  serie_id: string | null
  serie: string | null
  serie_completa: string | null
}

export default function NuevaJornadaPage() {
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [jornadas, setJornadas] = useState<JornadaCalendarioRow[]>([])

  const [serieId, setSerieId] = useState<string | null>(null)
  const [serieDesdeQuery, setSerieDesdeQuery] = useState(false)
  const [numero, setNumero] = useState(0)
  const [fecha, setFecha] = useState('')

  const [registrando, setRegistrando] = useState(false)
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)
  const [resultadoExito, setResultadoExito] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setErrorCarga(null)

      const { data, error } = (await supabase
        .from('v_calendario_jornadas' as never)
        .select('*')) as unknown as {
        data: JornadaCalendarioRow[] | null
        error: PostgrestError | null
      }

      if (cancelado) return

      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setJornadas(data ?? [])

      // ?serie=<uuid>, desde el calendario. Se lee del location y no con
      // useSearchParams, para no forzar un boundary de Suspense en una
      // página que no necesita nada del servidor — mismo patrón que
      // /arqueo/nuevo.
      const preseleccionada = new URLSearchParams(window.location.search).get('serie')
      if (preseleccionada) {
        setSerieId(preseleccionada)
        setSerieDesdeQuery(true)
      }

      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
  }, [])

  const series = [...new Map(jornadas.map((j) => [j.serie_id, j.serie_completa]))]
    .filter((par): par is [string, string] => !!par[0] && !!par[1])
    .map(([valor, label]) => ({ valor, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))

  const serieElegida = series.find((s) => s.valor === serieId)
  const jornadasDeLaSerie = serieId ? jornadas.filter((j) => j.serie_id === serieId) : []
  const numeroSugerido = jornadasDeLaSerie.reduce((max, j) => Math.max(max, j.numero ?? 0), 0) + 1

  // Sugiere el próximo número libre al elegir/llegar con una serie. El
  // operador lo puede pisar a mano después: es solo el default del input.
  useEffect(() => {
    if (!serieId || cargando) return
    setNumero(numeroSugerido)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serieId, cargando])

  const puedeConfirmar = !registrando && !!serieId && numero > 0

  async function confirmar() {
    if (!serieId) return

    setRegistrando(true)
    setErrorRegistro(null)
    setResultadoExito(null)

    const supabase = createClient()

    const { error } = await supabase.rpc('crear_jornada', {
      p_serie_id: serieId,
      p_numero: numero,
      p_fecha: fecha || undefined,
    })

    setRegistrando(false)

    if (error) {
      setErrorRegistro(error.message)
      return
    }

    setResultadoExito(`Jornada ${numero} creada en ${serieElegida?.label ?? 'la serie'}.`)
  }

  return (
    <div className="pb-10">
      <Link href="/calendario" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver al calendario
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Nueva jornada</h1>
        <p className="mt-1 text-[12px] text-muted">
          Alta manual de una fecha en una serie. No genera asiento.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && (
        <>
          <Card title="Datos de la jornada" icon="calendario" className="mb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {serieDesdeQuery ? (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                    Serie
                  </div>
                  <div className="text-[11.5px] text-ink">{serieElegida?.label ?? '—'}</div>
                </div>
              ) : (
                <Field label="Serie" required>
                  <Select
                    placeholder="Elegir serie…"
                    value={serieId ?? ''}
                    onChange={(e) => setSerieId(e.target.value || null)}
                  >
                    {series.map((s) => (
                      <option key={s.valor} value={s.valor}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <Field label="Número" required>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={numero || ''}
                  onChange={(e) => setNumero(parseInt(e.target.value, 10) || 0)}
                />
              </Field>

              <Field
                label="Fecha"
                hint="Podés crearla sin fecha y programarla después con Mover."
              >
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Field>
            </div>

            {serieElegida && (
              <p className="mt-3 text-[11px] text-muted">
                <span className="font-bold text-ink">{serieElegida.label}</span> tiene{' '}
                {jornadasDeLaSerie.length} jornada{jornadasDeLaSerie.length === 1 ? '' : 's'}, la
                próxima sería la {numeroSugerido}.
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
              <Link href="/calendario" className="font-bold underline">
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
            Crear jornada
          </Button>
        </>
      )}
    </div>
  )
}