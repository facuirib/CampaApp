import Link from 'next/link'
import Icon, { type NombreIcono } from './Icon'
import type { TamanoBoton, VarianteBoton } from './Button'

/**
 * Un link con la ropa del botón.
 *
 * Cierra el patrón `<Link><Button/></Link>` que había en 13 pantallas: un
 * `<a>` conteniendo un `<button>` es HTML inválido (contenido interactivo
 * anidado) y es exactamente lo que hacía inalcanzables los controles dentro
 * de las tablas con link de fila. Esto es UN elemento — un `<a>` que se ve
 * como botón — así que no hay dos targets peleándose el click.
 *
 * Mismos tokens y tamaños que `Button`. Sin `loading`/`disabled`: un link no
 * tiene estado en curso — si la acción los necesita, es un botón de verdad.
 */

const VARIANTES: Record<VarianteBoton, string> = {
  primary: 'bg-blue text-white hover:bg-blue-d',
  secondary: 'bg-blue-tint text-blue-d hover:bg-infobg',
  tertiary: 'bg-transparent text-muted underline hover:text-ink',
}

const TAMANOS: Record<TamanoBoton, string> = {
  default: 'text-[11px] px-4 py-2 rounded-md',
  pill: 'text-[10.5px] px-[15px] py-[7px] rounded-pill',
  touch: 'text-[13px] px-5 py-3 rounded-md min-h-[44px]',
}

export interface LinkButtonProps {
  href: string
  variant?: VarianteBoton
  size?: TamanoBoton
  icon?: NombreIcono
  className?: string
  children: React.ReactNode
}

export default function LinkButton({
  href,
  variant = 'primary',
  size = 'default',
  icon,
  className,
  children,
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={[
        'inline-flex items-center justify-center gap-1.5 font-bold',
        VARIANTES[variant],
        TAMANOS[size],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon && <Icon name={icon} size={size === 'touch' ? 16 : 13} />}
      {children}
    </Link>
  )
}
