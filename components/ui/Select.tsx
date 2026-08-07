"use client"

import { useCampo } from './Field'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Agrega una opción vacía inicial. Sin esto, no se agrega ninguna. */
  placeholder?: string
  children: React.ReactNode
}

/**
 * El desplegable.
 *
 * Las opciones van por `children` y no por una prop `options`. Un select cuyas
 * opciones salen de un `.map()` ya devuelve `<option>`: envolverlo en otra
 * forma de lista no gana nada, y perdería `<optgroup>`, que hace falta apenas
 * haya que agrupar (el tarifario por categoría, por ejemplo). Además las
 * pantallas que ya existen se portan tal cual, sin traducir sus opciones.
 *
 * Conserva la flecha nativa del sistema operativo: dibujar una propia obliga a
 * `appearance-none`, que en móviles se lleva puesto el comportamiento nativo
 * del desplegable. La caja sí lleva los tokens.
 */
export default function Select({ placeholder, className, id, children, ...props }: SelectProps) {
  const campo = useCampo()

  return (
    <select
      id={id ?? campo?.id}
      aria-invalid={campo?.invalido || undefined}
      aria-describedby={campo?.describedBy}
      className={[
        // Mismos 34px que Input: si difieren, la fila queda descolgada.
        'h-[34px] w-full rounded-sm border bg-white px-2 text-[11.5px] text-ink',
        'transition-colors',
        campo?.invalido ? 'border-err' : 'border-line hover:border-regale',
        'disabled:cursor-not-allowed disabled:bg-bg disabled:text-disabled',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {children}
    </select>
  )
}
