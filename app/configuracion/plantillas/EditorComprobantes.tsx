"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/db/client'
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui'
import { envolver } from '@/lib/mail/sobre'
import {
  aplicar,
  PLACEHOLDERS_COMPROBANTE,
  placeholdersFaltantes,
  type PlaceholderComprobante,
} from '@/lib/reclamo/plantilla'
import { guardarPlantilla } from '../acciones'

/**
 * El texto de los mails de comprobante.
 *
 * ── Qué se edita acá y qué NO ─────────────────────────────────────────────
 *
 * Se edita **el mensaje**: el asunto y los párrafos. El DISEÑO —el encabezado
 * navy, la tarjeta con el número y el total, el pie con el CUIT— vive en
 * `lib/mail/sobre.ts` y no se toca desde ninguna pantalla.
 *
 * No es sobreprotección. El layout de un mail es HTML viejo y frágil —tablas,
 * estilos inline, cosas que Outlook rompe de maneras que no se ven hasta que
 * alguien lo abre—. Si viviera en el campo editable, una etiqueta sin cerrar
 * dejaría el mail roto **para todos los envíos que vengan**, y el error
 * aparecería en la casilla de un equipo, no acá. Separados, el peor error
 * posible al editar es una frase fea.
 *
 * Por la misma razón el monto, el número y la fecha NO se escriben en el texto:
 * salen de la fila del comprobante y los pone el sobre. Un número tipeado a
 * mano en una plantilla se desincroniza del comprobante sin que nadie lo note.
 *
 * ── El preview es el mail de verdad ───────────────────────────────────────
 *
 * Se arma con `aplicar()` + `envolver()`, las MISMAS dos funciones del envío
 * real, y se muestra en un `<iframe>` para que el CSS del mail no se mezcle con
 * el de la app. Con un preview propio se podría ver algo distinto de lo que
 * sale — que es justo el problema que ya tuvimos entre los dos canales del
 * reclamo.
 */

const PLANTILLAS = [
  { clave: 'recibo_pago', label: 'Recibo de pago', esRecibo: true },
  { clave: 'factura_emitida', label: 'Factura', esRecibo: false },
] as const

type Clave = (typeof PLANTILLAS)[number]['clave']

/** Valores de muestra para el preview. Espejan una fila real. */
const EJEMPLO: Record<PlaceholderComprobante, string> = {
  saludo: 'Hola Acme,',
  numero: '0010-00000018',
  monto: '$525.000',
  detalle: 'Cuota 3, Cuota 4',
  fecha: '18/08/2026',
}

interface Fila {
  clave: string
  asunto: string
  cuerpo: string
  cuerpo_texto: string | null
}

export default function EditorComprobantes({ puedeEditar }: { puedeEditar: boolean }) {
  const [clave, setClave] = useState<Clave>('recibo_pago')
  const [filas, setFilas] = useState<Fila[]>([])
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [cuerpoTexto, setCuerpoTexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (cual: Clave) => {
    setCargando(true)
    const { data } = await createClient()
      .from('plantilla_mail')
      .select('clave, asunto, cuerpo, cuerpo_texto')
      .in('clave', ['recibo_pago', 'factura_emitida'])
    setFilas(data ?? [])
    const f = (data ?? []).find((x) => x.clave === cual)
    if (f) {
      setAsunto(f.asunto)
      setCuerpo(f.cuerpo)
      setCuerpoTexto(f.cuerpo_texto ?? '')
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar(clave)
    setAviso(null)
    setError(null)
  }, [clave, cargar])

  const actual = PLANTILLAS.find((p) => p.clave === clave)!

  // El preview: las mismas funciones que el envío.
  const { asunto: asuntoResuelto, html: mensaje } = aplicar(
    { asunto, cuerpo, cuerpo_texto: cuerpoTexto || null },
    EJEMPLO,
  )
  const previewHtml = envolver({
    cuerpoHtml: mensaje,
    destacados: [
      { rotulo: actual.esRecibo ? 'Recibo N°' : 'Factura N°', valor: EJEMPLO.numero },
      { rotulo: 'Fecha', valor: EJEMPLO.fecha },
      { rotulo: 'Total', valor: EJEMPLO.monto },
    ],
    emisor: { razonSocial: 'CAMPA SRL', cuit: '30-71550267-0' },
  })

  // Un placeholder que el envío no sabe resolver sale LITERAL en el mail del
  // equipo. Se avisa antes de guardar, no después.
  const conocidos = Object.keys(PLACEHOLDERS_COMPROBANTE)
  const desconocidos = placeholdersFaltantes(`${asunto} ${cuerpo} ${cuerpoTexto}`).filter(
    (p) => !conocidos.includes(p),
  )

  async function guardar() {
    setGuardando(true)
    setAviso(null)
    setError(null)
    const r = await guardarPlantilla(clave, {
      asunto,
      cuerpo,
      cuerpo_texto: cuerpoTexto || null,
    })
    setGuardando(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo guardar.')
    setAviso(`Texto guardado. Los próximos envíos de ${actual.label.toLowerCase()} lo usan.`)
    cargar(clave)
  }

  return (
    <Card className="mt-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-[13px] font-extrabold text-ink">Mails de comprobante</h2>
        <Badge estado="info">Solo texto</Badge>
      </div>
      <p className="mb-4 text-[11px] leading-snug text-muted">
        Acá se edita <strong>el mensaje</strong>: el asunto y los párrafos. El diseño —el encabezado,
        la tarjeta con el número y el total, el pie— está fijo y no se puede romper desde acá. El
        número, el monto y la fecha tampoco se escriben: salen del comprobante.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Plantilla">
            <Select value={clave} onChange={(e) => setClave(e.target.value as Clave)}>
              {PLANTILLAS.map((p) => (
                <option key={p.clave} value={p.clave}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Asunto" required>
            <Input
              value={asunto}
              readOnly={!puedeEditar}
              onChange={(e) => setAsunto(e.target.value)}
            />
          </Field>

          <Field label="Mensaje" hint="Un párrafo por línea, entre <p>…</p>.">
            <textarea
              value={cuerpo}
              readOnly={!puedeEditar}
              onChange={(e) => setCuerpo(e.target.value)}
              rows={9}
              className="w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-ink outline-none focus:border-blue"
            />
          </Field>

          <Field label="Versión en texto plano" hint="La que ven los clientes que no muestran HTML.">
            <textarea
              value={cuerpoTexto}
              readOnly={!puedeEditar}
              onChange={(e) => setCuerpoTexto(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-ink outline-none focus:border-blue"
            />
          </Field>

          <div className="rounded-md bg-panel px-3 py-2">
            <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted">
              Lo que se puede insertar
            </p>
            {(Object.entries(PLACEHOLDERS_COMPROBANTE) as [PlaceholderComprobante, string][]).map(
              ([c, que]) => (
                <div key={c} className="flex gap-2 py-0.5">
                  <code className="shrink-0 font-mono text-[10.5px] font-bold text-blue-d">
                    {`{{${c}}}`}
                  </code>
                  <span className="text-[10.5px] leading-snug text-muted">{que}</span>
                </div>
              ),
            )}
          </div>

          {desconocidos.length > 0 && (
            <p className="rounded-md bg-warnbg px-3 py-2 text-[11px] text-warntx">
              {desconocidos.map((d) => `{{${d}}}`).join(', ')} no se resuelve — va a salir tal cual
              en el mail.
            </p>
          )}

          {puedeEditar && (
            <div className="flex flex-wrap gap-2">
              <Button
                icon="check"
                loading={guardando}
                disabled={guardando || cargando || !asunto.trim()}
                onClick={guardar}
              >
                Guardar el texto
              </Button>
            </div>
          )}

          {aviso && <p className="rounded-md bg-okbg px-3 py-2 text-[11px] text-oktx">{aviso}</p>}
          {error && <p className="rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">{error}</p>}
        </div>

        <div>
          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-muted">
            Así se ve · asunto: {asuntoResuelto}
          </p>
          {/* En un iframe para que el CSS del mail no se cruce con el de la app,
              y al revés — el sobre trae su propio <html> completo. */}
          <iframe
            title="Vista previa del mail"
            srcDoc={previewHtml}
            className="h-[560px] w-full rounded-md border border-line bg-white"
          />
        </div>
      </div>

      {!puedeEditar && (
        <p className="mt-4 rounded-md bg-panel px-4 py-3 text-[11px] text-muted">
          Estás viendo los textos en modo lectura. Editarlos es de administración o finanzas.
        </p>
      )}
    </Card>
  )
}
