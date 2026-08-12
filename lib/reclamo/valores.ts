import { formatDate, formatMoney } from '@/lib/format'
import type { Placeholder } from './plantilla'

/**
 * Los datos que la plantilla necesita, armados una sola vez.
 *
 * La pantalla NO redacta el mensaje: sólo calcula estos cuatro valores y se los
 * da a la plantilla. El saludo, el cuerpo y el cierre viven en la fila de
 * `plantilla_mail`, que es lo que se puede editar sin un deploy.
 *
 * Antes cada canal armaba su propio texto —la pantalla el de WhatsApp, la
 * plantilla el del mail— y eran dos redacciones para el mismo reclamo. Eso es
 * exactamente el drift que la tabla venía a evitar: la primera vez que alguien
 * ajustara una, los dos canales dirían cosas distintas.
 */

export interface CuotaReclamada {
  cuotaLabel: string
  torneo: string | null
  vence_at: string | null
  saldo: number | null
}

/**
 * Una línea por cuota: qué es, de qué torneo, cuándo venció y cuánto falta.
 *
 * Es la única parte del mensaje que la pantalla aporta, porque es la única que
 * depende de los datos y no de cómo se quiera decir las cosas.
 */
export function armarDetalle(cuotas: CuotaReclamada[]): string {
  return cuotas
    .map(
      (c) =>
        `- ${c.cuotaLabel} (${c.torneo ?? 'torneo'}) venció el ${formatDate(c.vence_at)} — ${formatMoney(c.saldo ?? 0)}`,
    )
    .join('\n')
}

/** «4 cuotas vencidas» / «1 cuota vencida». El plural se resuelve acá. */
export function armarCantidad(cantidad: number): string {
  return cantidad === 1 ? '1 cuota vencida' : `${cantidad} cuotas vencidas`
}

/** Los cuatro placeholders que resuelven las dos plantillas. */
export function armarValores(
  equipo: string,
  montoTotal: number,
  cuotas: CuotaReclamada[],
): Record<Placeholder, string> {
  return {
    equipo,
    cantidad: armarCantidad(cuotas.length),
    monto: formatMoney(montoTotal),
    detalle: armarDetalle(cuotas),
  }
}

/**
 * El equipo de muestra del preview de configuración.
 *
 * Fijo y no traído de la base: quien edita la plantilla tiene que ver siempre
 * lo mismo, para comparar antes y después de su cambio. Con datos reales, el
 * preview cambiaría solo cuando alguien cobra una cuota.
 */
export const VALORES_EJEMPLO: Record<Placeholder, string> = armarValores(
  'Equipo Ejemplo',
  1240000,
  [
    { cuotaLabel: 'Cuota 1', torneo: 'Clausura 2026', vence_at: '2026-07-10', saldo: 400000 },
    { cuotaLabel: 'Cuota 2', torneo: 'Clausura 2026', vence_at: '2026-08-01', saldo: 350000 },
    { cuotaLabel: 'Cuota 3', torneo: 'Clausura 2026', vence_at: '2026-08-08', saldo: 490000 },
  ],
)
