"use client"

import { useState } from 'react'
import { Field, Input } from '@/components/ui'
import { linkWhatsApp, parsearTelefono } from '@/lib/reclamo/contacto'
import { guardarContactoTercero } from './acciones'

export interface BotonWhatsAppProps {
  /** El teléfono del tercero, si lo tiene. Precarga el campo. */
  contactoTercero: string | null
  terceroId: string | null
  esRecibo: boolean
  numeroFormateado: string
  monto: string
  /** El nombre real, o null si el receptor es «Consumidor Final» o está vacío. */
  nombre: string | null
}

/**
 * Avisar por WhatsApp que el comprobante ya salió por mail.
 *
 * ── Es un AVISO, no el comprobante ────────────────────────────────────────
 *
 * `wa.me` sólo transporta texto: **no permite adjuntar un archivo**. Así que
 * esto no manda el recibo — avisa que está en el mail. El texto lo dice dos
 * veces, y por eso el botón sólo aparece cuando el mail YA salió: ofrecerlo
 * antes sería avisar sobre algo que no pasó.
 *
 * ── Por qué NO se registra nada ───────────────────────────────────────────
 *
 * El link abre WhatsApp con el texto puesto y **la persona aprieta enviar**. El
 * sistema no manda nada y no tiene forma de saber si se mandó. Guardar una fila
 * «avisado por WhatsApp» cuando lo único que se sabe es que alguien abrió un
 * link sería un registro que miente, que es peor que no tener registro: uno se
 * arregla mirando, el otro no se detecta nunca.
 *
 * El envío por mail sí queda registrado, porque ése sí salió de verdad. Si
 * algún día hace falta saber que se avisó, la salida honesta es la de reclamos:
 * un botón explícito de «confirmar que avisé», que registra una afirmación de
 * la persona y no una inferencia del sistema.
 *
 * ── El preview del número ─────────────────────────────────────────────────
 *
 * `parsearTelefono` interpreta lo que se escribe —«0351 15 555-1234» sale
 * `5493515551234`— y **devuelve null ante la menor duda**. Se muestra cómo
 * quedó ANTES de abrir el chat: un número mal interpretado abre la conversación
 * de otra persona, y el operador se entera cuando ya mandó el mensaje.
 */
export default function BotonWhatsApp({
  contactoTercero,
  terceroId,
  esRecibo,
  numeroFormateado,
  monto,
  nombre,
}: BotonWhatsAppProps) {
  const [contacto, setContacto] = useState(contactoTercero ?? '')
  const [guardar, setGuardar] = useState(!contactoTercero)
  const [aviso, setAviso] = useState<string | null>(null)

  const telefono = parsearTelefono(contacto)

  const saludo = nombre ? `Hola ${nombre},` : 'Hola,'
  const texto =
    `${saludo} ya te mandamos por mail ${esRecibo ? 'el recibo' : 'la factura'} ` +
    `N° ${numeroFormateado} por ${monto}, con el comprobante en PDF adjunto. ` +
    'Si no lo ves, fijate en spam. — Campa Fútbol'

  async function abrir() {
    // Se guarda ANTES de abrir: en el teléfono, tocar el link cambia de app y
    // esta pantalla puede quedar suspendida a mitad de un fetch.
    if (guardar && terceroId && contacto.trim() && contacto.trim() !== contactoTercero) {
      const r = await guardarContactoTercero(terceroId, contacto)
      setAviso(r.ok ? 'Teléfono guardado en la ficha.' : (r.error ?? 'No se pudo guardar.'))
    }
  }

  return (
    <div className="space-y-3">
      <Field
        label="Avisar por WhatsApp"
        hint={
          contactoTercero
            ? 'Es el teléfono que tiene cargado. Se puede cambiar para este aviso.'
            : 'Este cliente no tiene teléfono cargado. Escribilo acá.'
        }
        error={contacto.trim() && !telefono.numero ? telefono.motivo : null}
      >
        <Input
          value={contacto}
          onChange={(e) => {
            setContacto(e.target.value)
            setAviso(null)
          }}
          placeholder="351 555-1234"
        />
      </Field>

      {/* El número como lo entendió el parser, antes de abrir nada. */}
      {telefono.numero && (
        <p className="text-[11px] text-muted">
          Se va a abrir el chat con{' '}
          <strong className="font-semibold text-ink">+{telefono.numero}</strong>
        </p>
      )}

      {terceroId && contacto.trim() !== '' && contacto.trim() !== contactoTercero && (
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink">
          <input
            type="checkbox"
            checked={guardar}
            onChange={(e) => setGuardar(e.target.checked)}
            className="size-3.5 accent-blue"
          />
          Guardar este teléfono en la ficha del cliente
        </label>
      )}

      {/* Un <a> y no un <Button>: es NAVEGACIÓN —abre otra app— y tiene que
          portarse como un link, con clic del medio y «copiar dirección». Es el
          mismo molde que el botón de WhatsApp de reclamos.

          Sin número interpretado no hay link: se dibuja el mismo botón en gris,
          para que se vea dónde va a estar y por qué todavía no. */}
      {telefono.numero ? (
        <a
          href={linkWhatsApp(telefono.numero, texto)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={abrir}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-pill bg-ok px-3.5 text-[11px] font-bold text-white hover:opacity-90"
        >
          Abrir WhatsApp
        </a>
      ) : (
        <span className="inline-flex h-[34px] cursor-not-allowed items-center gap-1.5 rounded-pill bg-line2 px-3.5 text-[11px] font-bold text-disabled">
          Abrir WhatsApp
        </span>
      )}

      {aviso && <p className="text-[11px] text-muted">{aviso}</p>}

      <p className="text-[10.5px] leading-snug text-muted">
        Abre WhatsApp con el mensaje escrito; enviarlo lo hacés vos. Por eso no queda registrado:
        el sistema no puede saber si se mandó. El comprobante va en el mail — WhatsApp no permite
        adjuntar archivos.
      </p>
    </div>
  )
}
