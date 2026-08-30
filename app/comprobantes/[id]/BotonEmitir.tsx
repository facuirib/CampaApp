'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'
import { contextoEmision, type ContextoEmision } from './emitir'
import ModalEmitir from './ModalEmitir'

/**
 * Abre el modal de emisión.
 *
 * El contexto —cliente, letra derivada, qué le falta, los puntos de venta— se
 * pide al abrir y no al pintar la página: son datos que sólo importan si alguien
 * va a facturar, y traerlos siempre encarecería cada visita al detalle de un
 * recibo para el caso más común, que es mirarlo.
 */
export default function BotonEmitir(props: {
  comprobanteId: string
  monto: number
  detalle: string | null
  fecha: string
}) {
  const [contexto, setContexto] = useState<ContextoEmision | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function abrir() {
    setAbriendo(true)
    setError(null)
    const c = await contextoEmision(props.comprobanteId)
    setAbriendo(false)
    if (!c) return setError('No se pudo abrir la emisión.')
    setContexto(c)
  }

  // Se pide de nuevo después de editar el cliente desde adentro del modal de
  // emisión, para que el paso 2 refleje los datos nuevos sin cerrar y reabrir
  // todo el flujo. Si el refetch falla, se queda con el contexto que ya tenía
  // — no tiene sentido tirar abajo un modal que el usuario recién usó con
  // éxito por un error de red al refrescar.
  async function refrescarContexto() {
    const c = await contextoEmision(props.comprobanteId)
    if (c) setContexto(c)
  }

  return (
    <>
      <Button icon="comprobante" loading={abriendo} disabled={abriendo} onClick={abrir}>
        Emitir factura
      </Button>
      {error && <p className="mt-2 text-[11px] text-errtx">{error}</p>}
      {contexto && (
        <ModalEmitir
          {...props}
          contexto={contexto}
          onCerrar={() => setContexto(null)}
          onContextoActualizado={refrescarContexto}
        />
      )}
    </>
  )
}
