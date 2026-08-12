/**
 * Primitivas del sistema de diseño.
 *
 *   import { Button, Money, Badge, Card } from '@/components/ui'
 *
 * Todo lo visual sale de los tokens de app/globals.css. Ningún componente de
 * pantalla debería escribir un color, un radio ni una sombra a mano: si algo
 * no se puede expresar con estas piezas, falta una pieza.
 *
 * ── Dos familias ───────────────────────────────────────────────────────────
 *
 * PRESENTACIÓN PURA — Card, Badge, Money, DataTable, KpiCard, KpiHero,
 * AsientoPreview, ChartArea, Waterfall, Icon, Button. Reciben datos y dibujan.
 * Son server-renderable: una pantalla que ya tiene sus números del lado del
 * servidor los muestra sin mandar un byte de JavaScript. Ninguno lleva
 * `"use client"`, y donde hizo falta interacción se resolvió sin estado — el
 * plegado de AsientoPreview usa `<details>` nativo por eso.
 *
 * FORMULARIO — Field, Input, Select. Llevan `"use client"`, y no es una
 * excepción suelta: un control con `value` y `onChange` es cliente por
 * definición, y Field necesita `useId` y contexto para cablear el label. Toda
 * pantalla con formulario ya es cliente, así que no cuesta nada.
 *
 * La distinción es la misma clase de matiz que la regla 4 del proyecto —
 * vistas que listan contra vistas que suman: dos comportamientos con razón,
 * no una regla con una excepción.
 */
export {
  default as AsientoPreview,
  type AsientoPreviewProps,
  type LineaAsiento,
} from './AsientoPreview'
export { default as Badge, type BadgeProps, type EstadoBadge } from './Badge'
export { default as Button, type ButtonProps, type TamanoBoton, type VarianteBoton } from './Button'
export { default as Card, type CardProps } from './Card'
export { default as ChartArea, type ChartAreaProps, type PuntoSerie } from './ChartArea'
export {
  default as BarrasComposicion,
  type BarrasComposicionProps,
  type ItemComposicion,
} from './BarrasComposicion'
export {
  default as DataTable,
  type AlineacionCelda,
  type CeldaBadge,
  type ColumnDef,
  type DataTableProps,
  type DensidadTabla,
  type FormatoCelda,
  type ValorCelda,
} from './DataTable'
export { default as Field, type FieldProps } from './Field'
export { default as Icon, type IconProps, type NombreIcono } from './Icon'
export { default as Input, type InputProps } from './Input'
export {
  default as KpiCard,
  type FormatoKpi,
  type KpiCardProps,
  type TonoKpi,
  type ValorKpi,
  type VariacionKpi,
} from './KpiCard'
export { default as KpiHero, type KpiHeroProps } from './KpiHero'
export { default as Money, type MoneyProps } from './Money'
export { default as Select, type SelectProps } from './Select'
export {
  default as Waterfall,
  type PasoWaterfall,
  type RolPaso,
  type WaterfallProps,
} from './Waterfall'
