"use client"

import { useState } from 'react'
import Input from './Input'

/**
 * Input de DINERO con separador de miles mientras se escribe (es-AR):
 * tipear 5000000 muestra 5.000.000. El valor que viaja al estado —y a la
 * base— sigue siendo el número limpio: esto es visualización, nada más.
 *
 * Reemplaza a <Input type="number"> en TODOS los campos de plata. Es texto
 * con inputMode numérico: el type="number" nativo no admite separadores.
 */
export default function InputMonto({
  value,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: number
  onChange: (monto: number) => void
}) {
  // El texto local permite estados intermedios ("5.000.") sin pelear con el
  // número de afuera; se resincroniza cuando el valor externo cambia.
  const [texto, setTexto] = useState(value ? value.toLocaleString('es-AR') : '')
  const [ultimo, setUltimo] = useState(value)
  if (value !== ultimo) {
    setUltimo(value)
    setTexto(value ? value.toLocaleString('es-AR') : '')
  }

  return (
    <Input
      inputMode="numeric"
      value={texto}
      onChange={(e) => {
        const limpio = e.target.value.replace(/[^\d]/g, '')
        const n = limpio === '' ? 0 : Number(limpio)
        setUltimo(n)
        setTexto(limpio === '' ? '' : n.toLocaleString('es-AR'))
        onChange(n)
      }}
      {...props}
    />
  )
}
