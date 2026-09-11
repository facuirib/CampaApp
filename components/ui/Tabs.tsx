"use client"

import Link from 'next/link'

/**
 * El toggle de pestañas del sistema.
 *
 * Es el patrón que ya vivía copiado en tres pantallas (cobranza, plantillas,
 * torneos/nuevo), una de las cuales había divergido a colores propios. Dos
 * modos, porque los tres usos reales son dos casos distintos:
 *
 *   · con `href` en cada pestaña: links — la pestaña activa vive en la URL,
 *     anda con clic del medio y con «atrás». Es el modo preferido.
 *   · con `onSelect`: botones — para un toggle de estado local (el modo del
 *     formulario de torneo nuevo), donde una URL por pestaña no significa nada.
 *
 * `"use client"` por el `onSelect`; en modo links el componente no usa estado
 * y se sirve igual desde un Server Component.
 */

export interface Pestana {
  clave: string
  label: string
  /** Modo link. Si falta, la pestaña necesita `onSelect` del contenedor. */
  href?: string
}

export interface TabsProps {
  pestanas: readonly Pestana[]
  activa: string
  /** Modo estado local: recibe la clave elegida. Ignorado si la pestaña trae href. */
  onSelect?: (clave: string) => void
  className?: string
}

const BASE = 'rounded-sm px-3 py-1 text-[11px] font-bold transition-colors'
const ACTIVA = 'bg-white text-ink shadow-sm'
const INACTIVA = 'text-muted hover:text-ink'

export default function Tabs({ pestanas, activa, onSelect, className }: TabsProps) {
  return (
    <div
      className={['inline-flex gap-1 rounded-md bg-line2 p-1', className ?? ''].join(' ')}
      role="tablist"
    >
      {pestanas.map((p) => {
        const esActiva = p.clave === activa
        const clases = [BASE, esActiva ? ACTIVA : INACTIVA].join(' ')
        return p.href ? (
          <Link key={p.clave} href={p.href} role="tab" aria-selected={esActiva} className={clases}>
            {p.label}
          </Link>
        ) : (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={esActiva}
            onClick={() => onSelect?.(p.clave)}
            className={clases}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
