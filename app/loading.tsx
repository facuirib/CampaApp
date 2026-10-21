import EsqueletoPagina from '@/components/EsqueletoPagina'

/**
 * El esqueleto por defecto de TODA la app: cubre el inicio (este segmento)
 * y cualquier ruta que no tenga un loading.tsx propio. Las pesadas
 * (cobranza, equipos, resultados, comprobantes) tienen el suyo, calibrado.
 */
export default function Loading() {
  return <EsqueletoPagina kpis={4} filas={8} />
}
