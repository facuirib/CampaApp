import { formatMoney } from '@/lib/format'

export interface MoneyProps {
  /** El importe, en pesos. Sale de una vista SQL, nunca de una suma del front. */
  value: number
  className?: string
}

/**
 * Un importe en pesos.
 *
 * El formateo NO vive acá: delega en `formatMoney()` (lib/format), que es el
 * único lugar donde se decide cómo se escribe la plata en toda la app. Este
 * componente aporta la otra mitad, que es tipográfica: `cifra` activa
 * `tabular-nums`, así todos los dígitos ocupan lo mismo y una columna de
 * importes queda alineada por los miles en vez de bailar fila a fila.
 *
 *   <Money value={1750000} />  →  $1.750.000
 *
 * Para alinear a la derecha en una tabla, el `className` lo resuelve la celda:
 * este componente no decide su posición.
 */
export default function Money({ value, className }: MoneyProps) {
  return <span className={className ? `cifra ${className}` : 'cifra'}>{formatMoney(value)}</span>
}
