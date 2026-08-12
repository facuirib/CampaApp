"use client"

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { formatMoney, formatDate } from '@/lib/format'
import { Button, Card, DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'
import { linkWhatsApp, parsearTelefono } from '@/lib/reclamo/contacto'
import { aplicar } from '@/lib/reclamo/plantilla'
import { armarValores } from '@/lib/reclamo/valores'
import { enviarReclamoMail, registrarReclamo, type DatosReclamo } from '../acciones'
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

type ReclamoRow = Database['public']['Tables']['reclamo']['Row']

const CANALES: Record<string, CeldaBadge> = {
  mail: { estado: 'info', label: 'Mail' },
  whatsapp: { estado: 'ok', label: 'WhatsApp' },
  manual: { estado: 'neutro', label: 'Manual' },
}

function badgeCanal(canal: string | null): CeldaBadge {
  return CANALES[canal ?? ''] ?? { estado: 'neutro', label: canal ?? '—' }
}

interface FilaHistorial {
  id: string
  fecha: string | null
  canal: CeldaBadge
  monto_reclamado: number | null
  cuotas: number | null
  destino: string | null
}

const COL_HISTORIAL: ColumnDef<FilaHistorial>[] = [
  { key: 'fecha', label: 'Fecha', format: 'date', width: 108 },
  { key: 'canal', label: 'Canal', format: 'badge', width: 108 },
  { key: 'monto_reclamado', label: 'Monto reclamado', format: 'money', width: 150 },
  { key: 'cuotas', label: 'Cuotas', align: 'right', width: 76 },
  { key: 'destino', label: 'Destino' },
]

export default function ArmarReclamoPage({ params }: { params: Promise<{ terceroId: string }> }) {
  const { terceroId } = use(params)

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [resumen, setResumen] = useState<ResumenDeuda | null>(null)
  const [cuotas, setCuotas] = useState<CuotaDeuda[]>([])
  const [contacto, setContacto] = useState<string | null>(null)
  const [plantilla, setPlantilla] = useState<{
    asunto: string
    cuerpo: string
    cuerpo_texto: string | null
  } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [historial, setHistorial] = useState<ReclamoRow[]>([])
  const [enviando, setEnviando] = useState(false)
  const [marcando, setMarcando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setCargando(true)
      setErrorCarga(null)

      const [
        { data: resumenData, error: errorResumen },
        { data: cuotasData, error: errorCuotas },
        { data: contactoData },
        { data: historialData, error: errorHistorial },
        { data: plantillaData },
      ] = await Promise.all([
        supabase.from('v_deuda_equipo').select('*').eq('tercero_id', terceroId).maybeSingle(),
        supabase.from('v_deuda_detalle').select('*').eq('tercero_id', terceroId),
        // v_deuda_equipo trae el email pero no el contacto: el teléfono sale
        // de `tercero`, y de ahí lo parsea el módulo de reclamo.
        supabase.from('tercero').select('contacto').eq('id', terceroId).maybeSingle(),
        supabase
          .from('reclamo')
          .select('*')
          .eq('tercero_id', terceroId)
          .order('fecha', { ascending: false })
          .order('created_at', { ascending: false }),
        // La plantilla es la fuente de los DOS canales: lo que se ve en la
        // previsualización es exactamente lo que se manda.
        supabase
          .from('plantilla_mail')
          .select('asunto, cuerpo, cuerpo_texto')
          .eq('clave', 'reclamo_vencida')
          .maybeSingle(),
      ])

      if (cancelado) return

      const error = errorResumen ?? errorCuotas ?? errorHistorial
      if (error) {
        setErrorCarga(error.message)
        setCargando(false)
        return
      }

      setResumen(resumenData)
      setCuotas(cuotasData ?? [])
      setContacto(contactoData?.contacto ?? null)
      setHistorial(historialData ?? [])
      setPlantilla(plantillaData)
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

  // Los cuatro valores que la plantilla necesita. La pantalla aporta los DATOS;
  // el saludo, el cuerpo y el cierre los pone la fila de plantilla_mail.
  const valores = armarValores(resumen?.equipo ?? 'el equipo', resumen?.deuda_vencida ?? 0, filas)

  const resuelto = plantilla ? aplicar(plantilla, valores) : null

  // El plano es el que se previsualiza, el que va al wa.me y el que se guarda.
  // El HTML del mail sale de la misma fila, resuelto de nuevo en el servidor.
  const texto = resuelto?.texto ?? ''

  const telefono = parsearTelefono(contacto)
  const email = resumen?.email ?? null

  // Lo que se congela al registrar: el monto y las cuotas de HOY.
  const datos: DatosReclamo = {
    tercero_id: terceroId,
    // La deuda es del equipo, no del torneo: si las cuotas vencidas son de más
    // de un torneo, va null — que en esta tabla significa "varios".
    torneo_id: (() => {
      const torneos = [...new Set(cuotas.filter(esReclamable).map((c) => c.torneo_id))]
      return torneos.length === 1 ? (torneos[0] ?? null) : null
    })(),
    monto_reclamado: resumen?.deuda_vencida ?? 0,
    cuotas: filas.length,
    cuota_ids: filas.map((f) => f.cuota_id),
    valores,
  }

  async function conAccion(
    fn: () => Promise<{ ok: boolean; error?: string; dryRun?: boolean }>,
    exito: string,
    marcar: (v: boolean) => void,
  ) {
    marcar(true)
    setErrorAccion(null)
    setAviso(null)
    const r = await fn()
    marcar(false)
    if (!r.ok) {
      setErrorAccion(r.error ?? 'No se pudo completar la acción.')
      return
    }
    setAviso(r.dryRun ? `${exito} (modo prueba: el mail no salió, falta la key)` : exito)
    await recargarHistorial()
  }

  async function recargarHistorial() {
    const { data } = await createClient()
      .from('reclamo')
      .select('*')
      .eq('tercero_id', terceroId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setHistorial(data ?? [])
  }

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
          Revisá el texto, elegí el canal y queda registrado en el historial del equipo.
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

              <div className="flex flex-wrap items-center gap-2">
                <Button icon="documento" variant="secondary" onClick={copiarTexto}>
                  {copiado ? '¡Copiado!' : 'Copiar texto'}
                </Button>

                {/* Mail: el envío es una Server Action. La key de Resend vive
                    en el servidor y nunca baja al navegador. */}
                <Button
                  icon="externo"
                  loading={enviando}
                  disabled={!email}
                  onClick={() =>
                    conAccion(
                      () => enviarReclamoMail(datos, email!),
                      'Mail enviado y reclamo registrado.',
                      setEnviando,
                    )
                  }
                >
                  Enviar por mail
                </Button>

                {/* WhatsApp: el link abre el chat con el texto puesto, pero el
                    sistema NO puede saber si se mandó. Por eso el registro es
                    el botón de al lado, explícito. */}
                {telefono.numero ? (
                  <a
                    href={linkWhatsApp(telefono.numero, texto)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-pill bg-ok px-3.5 text-[11px] font-bold text-white hover:opacity-90"
                  >
                    Abrir WhatsApp
                  </a>
                ) : (
                  <Button icon="externo" disabled>
                    Abrir WhatsApp
                  </Button>
                )}

                {/* Siempre habilitado: es la salida cuando no hay contacto, y
                    hoy son 304 equipos de 304. Un reclamo por teléfono o en la
                    cancha también es un reclamo. */}
                <Button
                  variant="secondary"
                  icon="check"
                  loading={marcando}
                  onClick={() =>
                    conAccion(
                      () =>
                        registrarReclamo(
                          datos,
                          telefono.numero ? 'whatsapp' : 'manual',
                          telefono.numero ?? null,
                        ),
                      'Reclamo registrado.',
                      setMarcando,
                    )
                  }
                >
                  {telefono.numero ? 'Marcar como reclamado' : 'Marcar como reclamado (manual)'}
                </Button>
              </div>

              {/* Cada canal deshabilitado dice POR QUÉ. "Sin email cargado" y
                  el motivo del parser son accionables; un botón gris sin
                  explicación no. */}
              <p className="mt-2 text-[10.5px] text-muted">
                {!email && 'Sin email cargado. '}
                {!telefono.numero && `WhatsApp no disponible: ${telefono.motivo}. `}
                {email && telefono.numero && 'Los dos canales están disponibles.'}
              </p>

              {aviso && (
                <p className="mt-3 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">{aviso}</p>
              )}
              {errorAccion && (
                <p className="mt-3 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
                  {errorAccion}
                </p>
              )}

              <h2 className="mb-2 mt-8 text-[13px] font-extrabold tracking-[-.2px] text-ink">
                Reclamos anteriores
              </h2>
              <DataTable
                columns={COL_HISTORIAL}
                rows={historial.map((r) => ({
                  id: r.id,
                  fecha: r.fecha,
                  canal: badgeCanal(r.canal),
                  monto_reclamado: r.monto_reclamado,
                  cuotas: r.cuotas,
                  destino: r.destino,
                }))}
                rowKey="id"
                densidad="compacta"
                maxHeight={300}
                emptyMessage="A este equipo no se le reclamó todavía."
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
