"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { formatDate } from '@/lib/format'
import { Button, Card, Field, Input, Money, Select } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type DiaSinArquear = Database['public']['Views']['v_saldo_efectivo_dia_cancha']['Row']

export default function NuevoArqueoPage() {
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [dias, setDias] = useState<DiaSinArquear[]>([])

  const [diaCanchaId, setDiaCanchaId] = useState<string | null>(null)
  const [saldoContado, setSaldoContado] = useState(0)

  const [registrando, setRegistrando] = useState(false)
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)
  const [resultadoExito, setResultadoExito] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setErrorCarga(null)

      const { data, error } = await supabase
        .from('v_saldo_efectivo_dia_cancha')
        .select('*')
        .is('arqueo_id', null)
        .order('fecha', { ascending: false })

      if (cancelado) return

      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setDias(data ?? [])

      // ?dia=<uuid>, desde la lista de arqueo. Se lee del location en vez de
      // con useSearchParams para no forzar un boundary de Suspense en una
      // página que no necesita nada del lado del servidor.
      const preseleccionado = new URLSearchParams(window.location.search).get('dia')
      if (preseleccionado) setDiaCanchaId(preseleccionado)

      setCargando(false)
    }

    cargar()

    return () => {
      cancelado = true
    }
  }, [])

  const diaElegido = dias.find((d) => d.dia_cancha_id === diaCanchaId) ?? null

  // Cálculo de UI para feedback inmediato — el registro real, y su
  // `diferencia` (columna generada), los hace crear_arqueo en base.
  const diferencia =
    diaCanchaId && diaElegido?.saldo_sistema != null ? saldoContado - diaElegido.saldo_sistema : null

  const puedeConfirmar = !registrando && !!diaCanchaId && saldoContado >= 0

  async function confirmar() {
    if (!diaCanchaId) return

    setRegistrando(true)
    setErrorRegistro(null)
    setResultadoExito(null)

    const supabase = createClient()

    const { error } = await supabase.rpc('crear_arqueo', {
      p_dia_cancha_id: diaCanchaId,
      p_saldo_contado: saldoContado,
      // p_responsable_id: transitorio hasta que exista auth (bloque 10, Roles
      // y RLS). Se omite y queda a cargo de auth.uid() en el backend — mismo
      // patrón que /gastos/nuevo y p_responsable_id en registrar_cobro (B2).
    })

    setRegistrando(false)

    if (error) {
      setErrorRegistro(error.message)
      return
    }

    setResultadoExito('Arqueo registrado.')
    setDiaCanchaId(null)
    setSaldoContado(0)
  }

  return (
    <div className="pb-10">
      <Link href="/arqueo" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a arqueo
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Registrar arqueo</h1>
        <p className="mt-1 text-[12px] text-muted">
          Contá el efectivo de la caja y comparalo con el sistema. No mueve plata.
        </p>
      </header>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}

      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && dias.length === 0 && (
        <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-[11px] text-muted">
          No hay cajas pendientes de arquear.
        </div>
      )}

      {!cargando && !errorCarga && dias.length > 0 && (
        <>
          <Card title="Datos del arqueo" icon="caja" className="mb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Día de cancha" required className="lg:col-span-2">
                <Select
                  placeholder="Elegir día…"
                  value={diaCanchaId ?? ''}
                  onChange={(e) => setDiaCanchaId(e.target.value || null)}
                >
                  {dias.map((d) => (
                    // La vista tipa todas sus columnas como nullable, que es
                    // lo que hace Supabase con cualquier vista. dia_cancha_id
                    // viene de dia_cancha.id, que es PK.
                    <option key={d.dia_cancha_id} value={d.dia_cancha_id!}>
                      {formatDate(d.fecha)} · {d.predio_nombre ?? d.predio}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Saldo contado" required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={saldoContado || ''}
                  onChange={(e) => setSaldoContado(parseFloat(e.target.value) || 0)}
                />
              </Field>
            </div>

            {diaElegido && (
              <p className="mt-3 text-[11px] text-muted">
                El sistema espera:{' '}
                <Money value={diaElegido.saldo_sistema ?? 0} className="font-bold text-ink" />
              </p>
            )}
          </Card>

          {diaCanchaId && saldoContado > 0 && diferencia !== null && (
            <p className="mb-4 text-[11px]">
              {diferencia === 0 ? (
                <span className="text-muted">Cuadra exacto.</span>
              ) : diferencia > 0 ? (
                <span className="font-bold text-oktx">
                  Sobrante: <Money value={diferencia} />
                </span>
              ) : (
                <span className="font-bold text-errtx">
                  Faltante: <Money value={Math.abs(diferencia)} />
                </span>
              )}
            </p>
          )}

          {errorRegistro && (
            <p className="mb-4 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
              {errorRegistro}
            </p>
          )}

          {resultadoExito && (
            <p className="mb-4 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">
              {resultadoExito}{' '}
              <Link href="/arqueo" className="font-bold underline">
                Volver a arqueo
              </Link>
            </p>
          )}

          <Button
            icon="check"
            loading={registrando}
            disabled={!puedeConfirmar}
            onClick={confirmar}
          >
            Registrar arqueo
          </Button>
        </>
      )}
    </div>
  )
}