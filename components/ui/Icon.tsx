import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconArrowDown,
  IconArrowUp,
  IconBuildingBank,
  IconBuildingStore,
  IconCalculator,
  IconCalendar,
  IconCash,
  IconTool,
  IconChartBar,
  IconChartLine,
  IconCheck,
  IconClipboardList,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconCoins,
  IconCurrencyDollar,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconFilter,
  IconHome,
  IconPencil,
  IconPlus,
  IconReceipt,
  IconRefresh,
  IconSearch,
  IconSend,
  IconSettings,
  IconShieldCheck,
  IconTag,
  IconTrash,
  IconUserHeart,
  IconUsers,
  IconX,
  type IconProps as TablerIconProps,
} from '@tabler/icons-react'

/**
 * Registro de íconos Tabler.
 *
 * El sistema expone los íconos por NOMBRE y no por componente, así que una
 * pantalla se escribe `<Button icon="plus">` sin importar nada. El registro es
 * explícito —y no un `import * as`— por dos razones:
 *
 *   · TypeScript conoce los nombres válidos, así que `icon="plux"` no compila
 *     y el editor autocompleta la lista.
 *   · el bundle se lleva solo los íconos que están acá, no los ~5800 del
 *     paquete.
 *
 * Sumar uno es una línea en el import y otra en el mapa.
 */
const ICONOS = {
  alerta: IconAlertTriangle,
  reclamos: IconSend,
  inscripciones: IconClipboardList,
  inicio: IconHome,
  cobranza: IconCash,
  tarifario: IconTag,
  arqueo: IconCalculator,
  proyeccion: IconChartLine,
  resultados: IconChartBar,
  movimientos: IconArrowsExchange,
  auditoria: IconShieldCheck,
  configuracion: IconSettings,
  socios: IconUserHeart,
  sponsors: IconBuildingStore,
  usd: IconCurrencyDollar,
  arribaFlecha: IconArrowUp,
  abajoFlecha: IconArrowDown,
  banco: IconBuildingBank,
  calendario: IconCalendar,
  caja: IconCash,
  activos: IconTool,
  check: IconCheck,
  chevronAbajo: IconChevronDown,
  chevronDerecha: IconChevronRight,
  reloj: IconClock,
  monedas: IconCoins,
  descargar: IconDownload,
  externo: IconExternalLink,
  ver: IconEye,
  documento: IconFileText,
  filtro: IconFilter,
  editar: IconPencil,
  plus: IconPlus,
  comprobante: IconReceipt,
  refrescar: IconRefresh,
  buscar: IconSearch,
  borrar: IconTrash,
  equipos: IconUsers,
  cerrar: IconX,
} as const

export type NombreIcono = keyof typeof ICONOS

export interface IconProps extends Omit<TablerIconProps, 'ref'> {
  /** Nombre del ícono en el registro. El editor autocompleta los válidos. */
  name: NombreIcono
}

/**
 * Los íconos del sistema acompañan a un texto que ya dice lo mismo (el label
 * del botón, el título de la card), así que van ocultos para el lector de
 * pantalla: repetirlos sería ruido. Un ícono que sea la ÚNICA información
 * necesita su propio texto accesible al lado.
 */
export default function Icon({ name, size = 16, stroke = 2, ...props }: IconProps) {
  const Glifo = ICONOS[name]
  return <Glifo size={size} stroke={stroke} aria-hidden focusable={false} {...props} />
}
