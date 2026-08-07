"use client"

import { useCampo } from './Field'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /**
   * `tabular-nums` mientras se tipea, para que los dígitos no bailen.
   *
   * Default: `true` cuando `type="number"`. Un monto es un número, y pedir la
   * bandera aparte garantiza que alguien la olvide.
   */
  cifra?: boolean
}

/**
 * El control de texto, número y fecha.
 *
 * Extiende `InputHTMLAttributes`, así que acepta exactamente lo mismo que un
 * `<input>`: cambiar uno por otro no toca ni el `value` ni el `onChange`.
 *
 * Hereda el `id` y el estado de error del `Field` que lo envuelve. Suelto
 * también funciona — pierde la asociación con el label, nada más.
 */
export default function Input({ cifra, className, id, type, ...props }: InputProps) {
  const campo = useCampo()
  const tabular = cifra ?? type === 'number'

  return (
    <input
      id={id ?? campo?.id}
      type={type}
      aria-invalid={campo?.invalido || undefined}
      aria-describedby={campo?.describedBy}
      className={[
        // 34px parejos con Select: es lo que endereza una fila de campos.
        'h-[34px] w-full rounded-sm border bg-white px-2.5 text-[11.5px] text-ink',
        'transition-colors placeholder:text-muted',
        campo?.invalido ? 'border-err' : 'border-line hover:border-regale',
        'disabled:cursor-not-allowed disabled:bg-bg disabled:text-disabled',
        tabular ? 'cifra' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}
