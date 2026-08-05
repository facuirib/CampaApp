import Icon, { type NombreIcono } from './Icon'

export type VarianteBoton = 'primary' | 'secondary' | 'tertiary'
export type TamanoBoton = 'default' | 'pill'

/**
 * Los tres niveles de jerarquía. Ninguno lleva borde gris.
 *
 * El secundario escribe en --blue-d y no en --blue: sobre el tint el azul
 * pleno daba 4.35:1, apenas por debajo del 4.5:1 que pide WCAG AA para texto
 * de 11px, aunque sea bold. Con --blue-d da 5.99:1. El fondo no cambia, y el
 * color no es nuevo: es el mismo que ya usa el primario en hover.
 */
const VARIANTES: Record<VarianteBoton, string> = {
  primary: 'bg-blue text-white shadow-blue hover:bg-blue-d',
  secondary: 'bg-blue-tint text-blue-d hover:bg-infobg',
  tertiary: 'bg-transparent text-muted underline hover:text-ink',
}

/**
 * Mientras carga: el spinner y el click bloqueado son los que comunican, y el
 * hover deja de responder.
 *
 * Solo el primario desaturra el fondo, que es lo que pedía el diseño. En el
 * secundario y el terciario el color se mantiene: desaturarlos dejaba el texto
 * en 1.8:1 de contraste —ilegible— y no aportaba nada que el spinner no dijera
 * ya.
 */
const CARGANDO: Record<VarianteBoton, string> = {
  primary: 'bg-blue-soft text-white',
  secondary: 'bg-blue-tint text-blue-d',
  tertiary: 'bg-transparent text-muted underline',
}

/** Deshabilitado es igual para los tres: el botón deja de ser un botón. */
const DESHABILITADO = 'bg-bg text-disabled'

const TAMANOS: Record<TamanoBoton, string> = {
  default: 'text-[11px] px-4 py-2 rounded-md',
  pill: 'text-[10.5px] px-[15px] py-[7px] rounded-pill',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Jerarquía de la acción. `primary` es una sola por pantalla. */
  variant?: VarianteBoton
  /** `pill` es la forma compacta, para barras con varias acciones en fila. */
  size?: TamanoBoton
  /** Ícono del registro Tabler. Siempre se dibuja a la izquierda del label. */
  icon?: NombreIcono
  /** En curso: muestra el spinner y no acepta clicks. */
  loading?: boolean
  children: React.ReactNode
}

/**
 * El botón del sistema.
 *
 * `type` es "button" por default y no "submit", que es el default de HTML. Un
 * botón que envía un formulario sin que nadie lo haya pedido escribe datos por
 * accidente y no se nota; uno que no envía se nota al primer click. Para
 * enviar, `type="submit"` explícito.
 *
 * Las clases de estado REEMPLAZAN a las de la variante en vez de superponerse:
 * así no hay que apagar el hover con `disabled:hover:` ni depender del orden
 * en que Tailwind emite los modificadores.
 */
export default function Button({
  variant = 'primary',
  size = 'default',
  icon,
  loading = false,
  disabled = false,
  type = 'button',
  className,
  children,
  ...props
}: ButtonProps) {
  const inactivo = disabled || loading

  const estado = disabled ? DESHABILITADO : loading ? CARGANDO[variant] : VARIANTES[variant]

  const cursor = disabled ? 'cursor-not-allowed' : loading ? 'cursor-wait' : 'cursor-pointer'

  const clases = [
    'inline-flex items-center justify-center gap-1.5 font-bold whitespace-nowrap',
    'border-0 transition-colors',
    TAMANOS[size],
    estado,
    cursor,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={clases} disabled={inactivo} aria-busy={loading} {...props}>
      {loading ? (
        <span
          className="girando inline-block size-3 shrink-0 rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        icon && <Icon name={icon} size={14} className="shrink-0" />
      )}
      {children}
    </button>
  )
}
