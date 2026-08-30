"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Button, Field, Input } from '@/components/ui'
import { enviarComprobanteMail } from './acciones'

export interface EnvioPrevio {
  destinatario: string
  enviado_at: string
}

export interface BotonMailProps {
  comprobanteId: string
  /** El mail del tercero, si lo tiene. Precarga el campo. */
  emailTercero: string | null
  /** Si el comprobante cuelga de un tercero al que se le pueda guardar el mail. */
  tieneTercero: boolean
  /** Los envíos anteriores, más nuevo primero. */
  envios: EnvioPrevio[]
}

/**
 * Mandar el comprobante por mail.
 *
 * ── La dirección es un campo, no un botón deshabilitado ───────────────────
 *
 * Es la decisión que define esta pantalla. Hoy **2 de 304 equipos** tienen mail
 * cargado: un botón que se apaga cuando falta el dato estaría apagado casi
 * siempre, y la respuesta —«cargá primero el mail en la ficha»— manda a otra
 * pantalla a hacer un trabajo que se puede hacer acá, con el dato a la vista.
 *
 * Así que el campo viene **precargado si el tercero tiene mail** y editable si
 * no. Y con la casilla de guardarlo en la ficha, el módulo se llena solo: cada
 * envío deja cargada la dirección para el próximo, en vez de esperar una carga
 * masiva que nadie va a hacer.
 *
 * ── El historial avisa, no bloquea ────────────────────────────────────────
 *
 * Si ya se mandó, el botón dice «Reenviar» y arriba se ve cuándo y a quién.
 * Reenviar es un caso legítimo —«no me llegó», «mandámelo a esta otra»— así que
 * la pantalla lo informa y deja decidir. Bloquearlo obligaría a un rodeo para
 * algo normal.
 */
export default function BotonMail({
  comprobanteId,
  emailTercero,
  tieneTercero,
  envios,
}: BotonMailProps) {
  const router = useRouter()

  const [abierto, setAbierto] = useState(false)
  const [destino, setDestino] = useState(emailTercero ?? '')
  const [guardar, setGuardar] = useState(!emailTercero)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const yaSeMando = envios.length > 0
  const ultimo = envios[0]

  async function enviar() {
    setEnviando(true)
    setError(null)
    setAviso(null)
    const r = await enviarComprobanteMail(comprobanteId, destino, guardar && tieneTercero)
    setEnviando(false)

    if (!r.ok) return setError(r.error ?? 'No se pudo enviar.')

    setAbierto(false)
    setAviso(
      (r.dryRun
        ? `Modo prueba: no se envió nada (falta la API key). Iría a ${destino}.`
        : `Enviado a ${destino}.`) + (r.avisoGuardado ? ` ${r.avisoGuardado}` : ''),
    )
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={abierto ? 'primary' : 'secondary'}
          icon="externo"
          onClick={() => {
            setAbierto(!abierto)
            setError(null)
            setAviso(null)
          }}
        >
          {yaSeMando ? 'Reenviar por mail' : 'Enviar por mail'}
        </Button>

        {yaSeMando && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <Badge estado="ok">Enviado</Badge>
            {new Date(ultimo.enviado_at).toLocaleDateString('es-AR')} a {ultimo.destinatario}
            {envios.length > 1 && ` · ${envios.length} envíos`}
          </span>
        )}
      </div>

      {abierto && (
        <div className="rounded-md border border-line bg-white p-4">
          <Field
            label="Enviar a"
            required
            hint={
              emailTercero
                ? 'Es el mail que tiene cargado. Se puede cambiar para este envío.'
                : 'Este cliente no tiene mail cargado. Escribilo acá.'
            }
          >
            <Input
              type="email"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="nombre@dominio.com"
            />
          </Field>

          {tieneTercero && destino.trim() !== '' && destino.trim() !== emailTercero && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-ink">
              <input
                type="checkbox"
                checked={guardar}
                onChange={(e) => setGuardar(e.target.checked)}
                className="size-3.5 accent-blue"
              />
              Guardar esta dirección en la ficha del cliente
            </label>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              icon="check"
              loading={enviando}
              disabled={enviando || !destino.trim()}
              onClick={enviar}
            >
              {yaSeMando ? 'Reenviar con el PDF adjunto' : 'Enviar con el PDF adjunto'}
            </Button>
            <Button variant="tertiary" disabled={enviando} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {aviso && <p className="rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">{aviso}</p>}
      {error && <p className="rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error}</p>}
    </div>
  )
}
