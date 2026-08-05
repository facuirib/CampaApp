/**
 * Estados del dominio, no colores.
 *
 * La pantalla dice qué ES la cosa —una cuota en mora, un equipo al día— y el
 * badge decide cómo se ve. Si mañana la mora deja de ser roja, cambia acá y no
 * en las quince pantallas que la muestran.
 *
 * `alDia`/`ok` y `mora`/`vencido` son sinónimos a propósito: una ficha está al
 * día, una cuota está ok; un equipo está en mora, una cuota está vencida. Cada
 * pantalla usa la palabra que se dice en voz alta ahí.
 */
export type EstadoBadge = 'alDia' | 'ok' | 'mora' | 'vencido' | 'porVencer' | 'info' | 'neutro'

const TONOS: Record<EstadoBadge, string> = {
  alDia: 'bg-okbg text-oktx',
  ok: 'bg-okbg text-oktx',
  mora: 'bg-errbg text-errtx',
  vencido: 'bg-errbg text-errtx',
  porVencer: 'bg-warnbg text-warntx',
  info: 'bg-infobg text-blue-d',
  neutro: 'bg-line2 text-neutrotx',
}

export interface BadgeProps {
  /** El estado del dominio. De acá sale el color, la pantalla no lo elige. */
  estado: EstadoBadge
  /** El texto va en mayúscula sostenida. Útil en tablas densas. */
  mayuscula?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Etiqueta de estado, en forma de píldora.
 *
 *   <Badge estado="mora">Vencido</Badge>
 *
 * Lleva un punto del mismo color que el texto, como en el mockup. No es
 * decoración: es la única marca que distingue un estado de otro cuando el
 * color no se percibe —daltonismo, impresión en blanco y negro— junto con el
 * texto, que siempre está.
 */
export default function Badge({ estado, mayuscula = false, className, children }: BadgeProps) {
  const clases = [
    'inline-flex items-center gap-1 rounded-pill px-2.5 py-[3px] text-[9px] font-bold',
    TONOS[estado],
    mayuscula ? 'uppercase tracking-[.04em]' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={clases}>
      <span className="size-[5px] shrink-0 rounded-full bg-current opacity-70" aria-hidden />
      {children}
    </span>
  )
}
