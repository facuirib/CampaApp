"use client"

import { useEffect, useRef, useState } from 'react'
import { Badge, Icon, Money, type EstadoBadge } from '@/components/ui'
import DetalleSemana from './DetalleSemana'

export interface FilaPeriodoProps {
  periodoLabel: string
  tramo: { estado: EstadoBadge; label: string }
  entradas: number | null
  salidas: number | null
  flujoNeto: number | null
  saldoProyectado: number | null
  /** Rango del período para el detalle: `desde` inclusive, `hasta` exclusiva. */
  desde: string
  hasta: string
  /** Viene de `?abrir=` — esta fila arranca desplegada y se scrollea a la
   *  vista, para que un link compartido a un período específico siga
   *  funcionando (reemplaza lo que hacía `/proyeccion/[periodo]` como ruta
   *  propia). */
  abiertoInicial: boolean
}

/**
 * Una fila de la tabla de períodos, con su desplegable.
 *
 * `DataTable` no tiene manera de insertar una fila extra condicional —no fue
 * diseñada para eso—, así que esta tabla es una hecha a mano, mismo patrón
 * `Fragment` + fila condicional que ya usa `PlanesPago.tsx`.
 *
 * `DetalleSemana` se MONTA la primera vez que se abre y sigue montado
 * después, oculto con `hidden` en vez de desmontarse: así cerrar y volver a
 * abrir no dispara una segunda consulta — el fetch ya quedó cacheado en su
 * propio estado.
 */
export default function FilaPeriodo({
  periodoLabel,
  tramo,
  entradas,
  salidas,
  flujoNeto,
  saldoProyectado,
  desde,
  hasta,
  abiertoInicial,
}: FilaPeriodoProps) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  // Una vez que se abrió una vez, DetalleSemana queda montado para siempre
  // (oculto si se vuelve a cerrar) — es lo que le permite no repetir el fetch.
  const [tocado, setTocado] = useState(abiertoInicial)
  const filaRef = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    if (abiertoInicial) filaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // Sólo al montar: es el efecto de "llegué acá por un link compartido",
    // no algo que deba repetirse en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle() {
    setAbierto((v) => !v)
    setTocado(true)
  }

  return (
    <>
      <tr ref={filaRef} className="border-t border-line2">
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={abierto}
            aria-label={abierto ? 'Ocultar detalle del período' : 'Ver detalle del período'}
            className="rounded-sm p-1 text-muted hover:bg-row-hover hover:text-ink"
          >
            <Icon
              name="chevronDerecha"
              size={11}
              className={`transition-transform ${abierto ? 'rotate-90' : ''}`}
            />
          </button>
        </td>
        <td className="px-3 py-2.5 font-semibold text-ink">{periodoLabel}</td>
        <td className="px-3 py-2.5">
          <Badge estado={tramo.estado}>{tramo.label}</Badge>
        </td>
        <td className="cifra px-3 py-2.5 text-right">
          {entradas != null ? <Money value={entradas} /> : '—'}
        </td>
        <td className="cifra px-3 py-2.5 text-right">
          {salidas != null ? <Money value={salidas} /> : '—'}
        </td>
        <td className="cifra px-3 py-2.5 text-right">
          {flujoNeto != null ? <Money value={flujoNeto} /> : '—'}
        </td>
        <td className="cifra px-3 py-2.5 text-right font-bold">
          {saldoProyectado != null ? <Money value={saldoProyectado} /> : '—'}
        </td>
      </tr>
      {tocado && (
        <tr className={`border-t border-line2 bg-panel ${abierto ? '' : 'hidden'}`}>
          <td colSpan={7} className="p-0">
            <DetalleSemana desde={desde} hasta={hasta} />
          </td>
        </tr>
      )}
    </>
  )
}
