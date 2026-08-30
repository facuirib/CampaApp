"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney, formatDate } from '@/lib/format'
import { Button, Card, DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'
import { linkWhatsApp, parsearTelefono } from '@/lib/reclamo/contacto'
import { aplicar, type EtapaCobranza } from '@/lib/reclamo/plantilla'
import { armarValores, armarValoresCobranza } from '@/lib/reclamo/valores'
import { enviarReclamoMail, registrarReclamo, type DatosReclamo } from '../acciones-aviso'
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

/** Solo cuotas vencidas, impagas y de jornada NO suspendida: eso es lo reclamable. */
function esReclamable(c: CuotaDeuda): boolean {
  if (c.jornada_suspendida) return false
  if ((c.saldo ?? 0) <= 0) return false
  return c.estado === 'vencida' || c.estado === 'parcial_vencida'
}

type ReclamoRow = Database['public']['Tables']['reclamo']['Row']

export interface ArmarReclamoProps {
  terceroId: string
  /**
   * Los datos, ya resueltos por la ficha.
   *
   * Antes este componente los pedía por su cuenta en un `useEffect`. Al entrar
   * dentro de `/cobranza/[terceroId]` eso pasaba a ser la TERCERA consulta de
   * `v_deuda_detalle` del mismo equipo en la misma pantalla —la ficha ya la
   * hace—, y encima en cascada: primero el server, después el cliente. Ahora
   * bajan por props, resueltas una sola vez del lado del servidor.
   */
  resumen: ResumenDeuda
  cuotas: CuotaDeuda[]
  contacto: string | null
  historial: ReclamoRow[]
  plantilla: { asunto: string; cuerpo: string; cuerpo_texto: string | null } | null
  /**
   * La etapa que le toca a este equipo hoy, o `null` si no está en ninguna cola.
   *
   * Viene de `v_cobranza_momento` y decide la plantilla Y lo que se guarda en
   * `reclamo.etapa`. Las dos de la misma fuente: si el texto saliera de una
   * etapa y el registro de otra, el candado taparía un aviso que nunca se
   * mandó.
   */
  etapa: EtapaCobranza | null
  /**
   * Las cuotas que cubre el aviso de hoy, tal como las calculó
   * `v_cobranza_momento`.
   *
   * 🔴 Tienen que ser EXACTAMENTE las mismas que se guardan en
   * `reclamo.cuota_ids`, porque el candado compara ese array contra el de la
   * vista con `@>`. Si la pantalla filtrara por su cuenta —«sólo las
   * vencidas»— y la vista incluyera además las que están por vencer, los dos
   * conjuntos nunca coincidirían y el equipo no saldría NUNCA de la cola: se le
   * avisaría todos los días.
   */
  cuotaIdsAviso: string[] | null
  /** Dejar registrado el reclamo (WhatsApp o a mano). Escribe en `reclamo`. */
  puedeRegistrar: boolean
  /**
   * Mandar el mail. Va aparte de `puedeRegistrar` porque en la base también
   * van aparte: el INSERT en `reclamo` lo cubre una policy, y el mail no lo
   * cubre nada —Resend no pasa por RLS—, así que lo frena el `exigirRol` de la
   * Server Action. Dos operaciones distintas en el mapa, dos props.
   */
  puedeMail: boolean
}

/**
 * Armar y mandar el reclamo de un equipo.
 *
 * Era la página entera; se partió en `page.tsx` server —que lee el rol— y este
 * componente. **Refactor de forma, no de lógica.**
 *
 * La lectura queda para todos, incluido `read-only`: la situación del equipo
 * —cuánto debe, qué cuotas, el historial de reclamos— es exactamente lo que un
 * perfil de control tiene que poder mirar. Lo que se esconde es mandar.
 */
/** Hoy en Córdoba, en ISO: para comparar contra `vence_at`, que es una fecha. */
function hoyISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function ArmarReclamo({
  terceroId,
  resumen,
  cuotas,
  contacto,
  historial,
  plantilla,
  etapa,
  cuotaIdsAviso,
  puedeRegistrar,
  puedeMail,
}: ArmarReclamoProps) {

  const router = useRouter()

  const [copiado, setCopiado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [marcando, setMarcando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  // Con etapa, las cuotas del aviso las decide la VISTA —incluye las que están
  // por vencer, que `esReclamable` deja afuera—. Sin etapa, el reclamo suelto
  // sigue siendo sólo lo vencido.
  const filas: FilaCuota[] = cuotas
    .filter((c) =>
      cuotaIdsAviso ? cuotaIdsAviso.includes(c.cuota_id ?? '') : esReclamable(c),
    )
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

  // Se suma acá y no en la vista sólo porque ya está filtrado por `cuotaIdsAviso`,
  // que ES lo que la vista decidió: es la misma cifra, contada sobre las mismas
  // filas. El número que se muestra en pantalla sigue saliendo de `resumen`.
  const totalAviso = etapa
    ? filas.reduce((t, f) => t + (f.saldo ?? 0), 0)
    : (resumen?.deuda_vencida ?? 0)

  // Los valores que la plantilla necesita. La pantalla aporta los DATOS; el
  // saludo, el cuerpo y el cierre los pone la fila de plantilla_mail.
  //
  // Con etapa van los de cobranza —que traen `{{saludo}}` y `{{vencimiento}}`—
  // y sin etapa los de siempre, porque la plantilla vieja usa `{{equipo}}`. Los
  // dos juegos y no uno solo: un placeholder que la plantilla no espera sale
  // LITERAL en el mail del equipo.
  const valores = etapa
    ? armarValoresCobranza(
        resumen?.equipo ?? null,
        // El total del AVISO, no la deuda vencida: con etapa `por_vencer` no
        // hay nada vencido y el mensaje diría $0.
        totalAviso,
        filas,
        // En el preventivo importa cuándo vence; en los otros dos, desde cuándo
        // está impago lo más viejo.
        etapa === 'por_vencer'
          ? (filas.find((f) => (f.vence_at ?? '') >= hoyISO())?.vence_at ?? null)
          : (resumen?.vencimiento_mas_antiguo ?? null),
      )
    : armarValores(resumen?.equipo ?? 'el equipo', resumen?.deuda_vencida ?? 0, filas)

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
    monto_reclamado: totalAviso,
    cuotas: filas.length,
    cuota_ids: filas.map((f) => f.cuota_id),
    valores,
    etapa,
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

  // El historial lo trae la ficha desde el servidor, así que refrescarlo es
  // pedirle a Next que la vuelva a renderizar — no una consulta nuestra.
  async function recargarHistorial() {
    router.refresh()
  }

  async function copiarTexto() {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  // Sin estados de carga ni 404: los datos llegan resueltos y el recurso ya lo
  // validó la ficha antes de renderizar esto.
  return (
    <div>
      {filas.length === 0 ? (
        <p className="text-[11px] text-muted">
          Este equipo no tiene cuotas vencidas para reclamar.
        </p>
      ) : (
        <>
          {/* Una línea, no otra tabla: la ficha ya lista TODAS las cuotas
              arriba. Repetir acá sólo las vencidas daría dos tablas de lo mismo
              en la misma pantalla, y quien las mire va a intentar cuadrar una
              contra la otra. Lo que hace falta acá es al saber qué se va a
              reclamar, no volver a mostrarlo. */}
          <p className="mb-3 text-[11.5px] text-ink">
            Se va a reclamar{' '}
            <strong className="font-bold">
              {filas.length === 1 ? '1 cuota vencida' : `${filas.length} cuotas vencidas`}
            </strong>{' '}
            por <strong className="font-bold">{formatMoney(resumen.deuda_vencida ?? 0)}</strong>
            {resumen.vencimiento_mas_antiguo
              ? ` · la más antigua venció el ${formatDate(resumen.vencimiento_mas_antiguo)}`
              : ''}
            .
          </p>

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
                {puedeMail && (
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
                )}

                {/* WhatsApp: el link abre el chat con el texto puesto, pero el
                    sistema NO puede saber si se mandó. Por eso el registro es
                    el botón de al lado, explícito. */}
                {!puedeRegistrar ? null : telefono.numero ? (
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
                {puedeRegistrar && (
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
                )}
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
        </>
      )}
    </div>
  )
}
