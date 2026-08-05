/**
 * Primitivas del sistema de diseño.
 *
 *   import { Button, Money, Badge, Card } from '@/components/ui'
 *
 * Todo lo visual sale de los tokens de app/globals.css. Ningún componente de
 * pantalla debería escribir un color, un radio ni una sombra a mano: si algo
 * no se puede expresar con estas piezas, falta una pieza.
 */
export { default as Badge, type BadgeProps, type EstadoBadge } from './Badge'
export { default as Button, type ButtonProps, type TamanoBoton, type VarianteBoton } from './Button'
export { default as Card, type CardProps } from './Card'
export { default as Icon, type IconProps, type NombreIcono } from './Icon'
export { default as Money, type MoneyProps } from './Money'
