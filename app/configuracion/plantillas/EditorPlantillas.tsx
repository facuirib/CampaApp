"use client"

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import {
  PLACEHOLDERS,
  aplicar,
  obligatoriosPorCuerpo,
  placeholdersDesconocidos,
  type Placeholder,
} from '@/lib/reclamo/plantilla'
import { VALORES_EJEMPLO } from '@/lib/reclamo/valores'
import { guardarPlantilla } from '../acciones'
import { formatDateTime } from '@/lib/format'
import { Badge, Button, Card, Field, Input } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type PlantillaRow = Database['public']['Tables']['plantilla_mail']['Row']

/**
 * La única que el código manda hoy.
 *
 * Las otras tres están sembradas pero ninguna función las lee: editarlas sería
 * pedirle a alguien que escriba un texto que no llega a ningún lado. Se
 * muestran para que se sepa que existen, en sólo lectura.
 */
const EDITABLE = 'reclamo_vencida'

type Vista = 'mail' | 'whatsapp'

/**
 * El editor de la plantilla de reclamos.
 *
 * Era la página entera, y se partió en dos: un `page.tsx` server que lee el rol
 * y este componente, que recibe el permiso ya resuelto. **Refactor de forma, no
 * de lógica** — no cambió una línea de lo que hace.
 *
 * Se partió y no se protegió la ruta a propósito. Esta pantalla es MIXTA: leer
 * la plantilla —ver qué texto se le manda a los equipos— es información que
 * `read-only` tiene que conservar. Meter la ruta en `RUTAS_PROTEGIDAS` habría
 * sido una línea, y le habría sacado la lectura junto con la escritura.
 */
export default function EditorPlantillas({ puedeEditar }: { puedeEditar: boolean }) {
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [plantillas, setPlantillas] = useState<PlantillaRow[]>([])

  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [cuerpoTexto, setCuerpoTexto] = useState('')
  const [vista, setVista] = useState<Vista>('mail')

  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)

  /** Cuándo y quién, o null si la fila es la que sembró la migración. */
  const [ultima, setUltima] = useState<{ at: string; por: string | null } | null>(null)

  /**
   * Quién editó, resuelto por `email_usuario()`.
   *
   * La fila guarda un uuid, y un uuid no le dice nada a nadie. Resolverlo pide
   * una función de la base porque `authenticated` no puede leer `auth.users`
   * —la misma pared que hace que /auditoria muestre ocho caracteres de uuid—.
   */
  async function traerUltima(fila: PlantillaRow) {
    if (!fila.updated_at) return setUltima(null)

    if (!fila.updated_by) return setUltima({ at: fila.updated_at, por: null })

    const { data } = await createClient().rpc('email_usuario', {
      p_usuario_id: fila.updated_by,
    })
    setUltima({ at: fila.updated_at, por: data ?? null })
  }

  const cargar = useCallback(async (primeraVez: boolean) => {
    const { data, error } = await createClient().from('plantilla_mail').select('*').order('clave')

    if (error) {
      setErrorCarga(error.message)
      setCargando(false)
      return
    }

    setPlantillas(data ?? [])
    const editable = (data ?? []).find((p) => p.clave === EDITABLE)

    if (editable) {
      // Los campos SÓLO en la carga inicial. Refrescándolos después de guardar
      // se pisaría lo que la persona esté escribiendo si sigue editando.
      if (primeraVez) {
        setAsunto(editable.asunto)
        setCuerpo(editable.cuerpo)
        setCuerpoTexto(editable.cuerpo_texto ?? '')
      }
      await traerUltima(editable)
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar(true)
  }, [cargar])

  // El preview usa `aplicar()`, LA MISMA función que resuelve el envío real.
  // Con un resolvedor propio, el preview podría mostrar algo que no es lo que
  // sale — que es exactamente el problema que tuvimos entre los dos canales.
  const resuelto = aplicar({ asunto, cuerpo, cuerpo_texto: cuerpoTexto || null }, VALORES_EJEMPLO)

  // Cuerpo por cuerpo, no los dos concatenados: son dos mensajes que salen por
  // dos canales y cada uno tiene que estar completo por su cuenta. Juntos, el
  // `{{detalle}}` del texto de WhatsApp tapa su ausencia en el HTML del mail —
  // y se guarda un mail que no dice qué cuotas se deben.
  const faltan = obligatoriosPorCuerpo({ cuerpo, cuerpo_texto: cuerpoTexto })
  const avisos: { donde: string; que: Placeholder[] }[] = [
    { donde: 'el cuerpo del mail', que: faltan.cuerpo },
    { donde: 'el cuerpo de WhatsApp', que: faltan.cuerpo_texto },
  ].filter((a) => a.que.length > 0)

  // "Qué no se está usando" sí mira los dos juntos: un placeholder que aparece
  // en un canal está usado, aunque el otro lo omita.
  const textoCompleto = `${cuerpo} ${cuerpoTexto}`
  const desconocidos = placeholdersDesconocidos(textoCompleto)
  const sinUsar = (Object.keys(PLACEHOLDERS) as Placeholder[]).filter(
    (p) => !textoCompleto.includes(`{{${p}}}`),
  )

  const puedeGuardar = !guardando && avisos.length === 0 && asunto.trim().length > 0

  async function guardar() {
    setGuardando(true)
    setAviso(null)
    setErrorGuardar(null)

    const r = await guardarPlantilla(EDITABLE, {
      asunto,
      cuerpo,
      cuerpo_texto: cuerpoTexto || null,
    })

    setGuardando(false)
    if (!r.ok) {
      setErrorGuardar(r.error ?? 'No se pudo guardar.')
      return
    }
    setAviso('Plantilla guardada. Los próximos reclamos usan este texto.')
    // Para que "Última edición" pase a decir lo que acaba de pasar, sin recargar.
    await cargar(false)
  }

  return (
    <div className="pb-10">
      <Link href="/configuracion" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a configuración
      </Link>

      <header className="mb-4 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Plantillas de mensaje</h1>
        <p className="mt-1 text-[12px] text-muted">
          El texto que se manda a los equipos. Lo que ves en la previsualización es exactamente lo
          que sale.
        </p>
      </header>

      <p className="mb-5 rounded-md bg-infobg px-4 py-2.5 text-[11px] text-blue-d">
        Hoy cualquier usuario con sesión puede editar. Cuando existan roles, esto va a ser sólo de
        administración.
      </p>

      {errorCarga && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{errorCarga}</p>
      )}
      {cargando && <p className="text-[11px] text-muted">Cargando…</p>}

      {!cargando && !errorCarga && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* ── Editor ─────────────────────────────────────────────── */}
            <div>
              {/* Quién tocó por última vez el texto que sale firmado como
                  CAMPA. Sin ediciones se dice, no se esconde: el silencio
                  podría leerse como "no se pudo averiguar". */}
              <p className="mb-2 text-[10.5px] text-muted">
                {ultima
                  ? `Última edición: ${formatDateTime(ultima.at)}${
                      ultima.por ? ` por ${ultima.por}` : ''
                    }`
                  : 'Sin ediciones: es el texto original del sistema.'}
              </p>

              <Card title="Reclamo por cuota vencida" icon="editar" className="mb-3">
                <Field label="Asunto del mail" required className="mb-3">
                  <Input
                    value={asunto}
                    readOnly={!puedeEditar}
                    onChange={(e) => setAsunto(e.target.value)}
                  />
                </Field>

                <Field label="Cuerpo del mail (HTML)" className="mb-3">
                  <textarea
                    value={cuerpo}
                    readOnly={!puedeEditar}
                    onChange={(e) => setCuerpo(e.target.value)}
                    rows={9}
                    className="w-full resize-y rounded-sm border border-line bg-white px-2.5 py-2 font-mono text-[10.5px] text-ink"
                  />
                </Field>

                <Field label="Cuerpo de WhatsApp (texto plano)">
                  <textarea
                    value={cuerpoTexto}
                    readOnly={!puedeEditar}
                    onChange={(e) => setCuerpoTexto(e.target.value)}
                    rows={9}
                    className="w-full resize-y rounded-sm border border-line bg-white px-2.5 py-2 text-[11px] text-ink"
                  />
                </Field>
              </Card>

              {/* ── Validación ──────────────────────────────────────── */}
              {avisos.map((a) => (
                <p
                  key={a.donde}
                  className="mb-2 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx"
                >
                  <strong className="font-bold">
                    Falta {a.que.map((f) => `{{${f}}}`).join(', ')} en {a.donde}.
                  </strong>{' '}
                  Sin eso el mensaje no dice qué cuotas se deben: no se puede guardar.
                </p>
              ))}
              {desconocidos.length > 0 && (
                <p className="mb-2 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
                  {desconocidos.map((d) => `{{${d}}}`).join(', ')} no existe. Va a salir tal cual en
                  el mensaje.
                </p>
              )}
              {avisos.length === 0 && sinUsar.length > 0 && (
                <p className="mb-2 rounded-md bg-line2 px-4 py-3 text-[11px] text-neutrotx">
                  Sin usar: {sinUsar.map((p) => `{{${p}}}`).join(', ')}. El mensaje funciona igual.
                </p>
              )}

              <Card title="Datos disponibles" icon="documento" className="mb-3">
                <dl className="grid gap-1.5">
                  {(Object.entries(PLACEHOLDERS) as [Placeholder, string][]).map(([clave, qué]) => (
                    <div key={clave} className="flex gap-2">
                      <dt className="shrink-0 font-mono text-[10.5px] font-bold text-blue-d">
                        {`{{${clave}}}`}
                      </dt>
                      <dd className="text-[10.5px] leading-snug text-muted">{qué}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              {puedeEditar ? (
                <Button icon="check" loading={guardando} disabled={!puedeGuardar} onClick={guardar}>
                  Guardar plantilla
                </Button>
              ) : (
                /* Sin permiso los campos quedan de sólo lectura y el botón no
                   está. Decirlo es parte del trabajo: un formulario que se
                   deja tipear y no se puede mandar es peor que uno cerrado. */
                <p className="rounded-md bg-panel px-4 py-3 text-[11px] text-muted">
                  Estás viendo la plantilla en modo lectura. Editarla es de
                  administrador u operador.
                </p>
              )}

              {aviso && (
                <p className="mt-3 rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">{aviso}</p>
              )}
              {errorGuardar && (
                <p className="mt-3 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
                  {errorGuardar}
                </p>
              )}
            </div>

            {/* ── Preview ────────────────────────────────────────────── */}
            <div>
              <div className="mb-3 inline-flex gap-1 rounded-md bg-line2 p-1">
                {(['mail', 'whatsapp'] as Vista[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVista(v)}
                    className={[
                      'rounded-sm px-3 py-1 text-[11px] font-bold transition-colors',
                      vista === v ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
                    ].join(' ')}
                  >
                    {v === 'mail' ? 'Mail' : 'WhatsApp'}
                  </button>
                ))}
              </div>

              <p className="mb-2 text-[10.5px] text-muted">
                Con datos de ejemplo: Equipo Ejemplo, 3 cuotas, $1.240.000.
              </p>

              {vista === 'mail' ? (
                <div className="rounded-md border border-line bg-white p-3">
                  <p className="mb-2 border-b border-line pb-2 text-[11px] text-muted">
                    <span className="font-bold text-ink">Asunto:</span> {resuelto.asunto}
                  </p>
                  {/* En un iframe y no con dangerouslySetInnerHTML: el HTML de
                      la plantilla trae sus propios estilos y, inyectado en la
                      página, los mezcla con los del sistema. Es un mail, no un
                      componente — se muestra aislado, como lo va a ver quien lo
                      reciba. */}
                  <iframe
                    title="Vista previa del mail"
                    srcDoc={resuelto.html}
                    sandbox=""
                    className="h-[420px] w-full rounded-sm border border-line2 bg-white"
                  />
                </div>
              ) : (
                <div className="rounded-md border border-line bg-white p-3">
                  <div className="rounded-md bg-[#dcf8c6] px-3 py-2.5">
                    <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink">
                      {resuelto.texto || 'Sin texto plano: WhatsApp no tendría qué mandar.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Las que no se usan ───────────────────────────────────── */}
          <h2 className="mb-2 mt-8 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            Otras plantillas
          </h2>
          <p className="mb-3 text-[11px] text-muted">
            Están sembradas pero ninguna función las manda todavía. Se van a poder editar cuando
            exista el envío que las use.
          </p>
          <div className="grid gap-2">
            {plantillas
              .filter((p) => p.clave !== EDITABLE)
              .map((p) => (
                <div
                  key={p.clave}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-white/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] font-bold text-disabled">{p.clave}</p>
                    <p className="text-[11px] text-disabled">{p.asunto}</p>
                  </div>
                  <Badge estado="neutro">No está en uso</Badge>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
