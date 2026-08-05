import Icon, { type NombreIcono } from './Icon'

export interface CardProps {
  /** Título del bloque. Si falta y tampoco hay `action`, no se dibuja header. */
  title?: React.ReactNode
  /** Ícono del título, en azul, a su izquierda. */
  icon?: NombreIcono
  /** Acción del bloque, alineada a la derecha del título: un link o un Button. */
  action?: React.ReactNode
  /** Para cuando adentro va una tabla que tiene que llegar a los bordes. */
  noPadding?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * El contenedor blanco del sistema.
 *
 * `noPadding` agrega `overflow-hidden`, y esa es la parte que importa: sin él,
 * una tabla que llega al borde se dibuja por encima de las esquinas
 * redondeadas y la última fila queda con las puntas cuadradas, cortada. Con él,
 * el radio de la card recorta la tabla y el bloque cierra.
 *
 * El header conserva su padding aunque el cuerpo no lo tenga, así que el
 * título nunca queda pegado al borde.
 */
export default function Card({
  title,
  icon,
  action,
  noPadding = false,
  className,
  children,
}: CardProps) {
  const hayHeader = title != null || action != null

  const clases = [
    'bg-white border border-line rounded-md shadow-sm',
    noPadding ? 'overflow-hidden' : 'p-4',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={clases}>
      {hayHeader && (
        <div
          className={[
            'flex items-center justify-between gap-2',
            noPadding ? 'px-4 pt-4 pb-3' : 'mb-[13px]',
          ].join(' ')}
        >
          {title != null && (
            <h2 className="flex items-center gap-1.5 text-[12.5px] font-extrabold tracking-[-.2px] text-ink">
              {icon && <Icon name={icon} size={14} className="text-blue" />}
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
