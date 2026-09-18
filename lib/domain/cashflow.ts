/**
 * El vocabulario de "origen" en el cashflow — de dónde sale cada monto.
 *
 * Conviven TRES taxonomías bajo la misma columna `origen`, según el nivel:
 *
 *   · comprometido (`v_cashflow_comprometido`): cuota_equipo, cuota_sponsor,
 *     gasto_impago, cheque_*, compromiso_*, sueldo_socio.
 *   · estimado (`v_cashflow_estimado`): presupuesto_partido,
 *     presupuesto_dia_cancha, presupuesto_mensual, presupuesto_unico.
 *   · real (`v_cashflow_real`): es `asiento.origen` — un vocabulario
 *     completamente distinto (pago_equipo, sponsor, socio, usd, amortizacion,
 *     arqueo, bar, fondo, gasto_devengo, gasto_pago, cheque), relevado
 *     recorriendo los `crear_asiento(...)` de cada función de negocio.
 *
 * Una sola tabla para las tres, porque las tres terminan mostrándose juntas
 * en el desplegable de `/proyeccion` — antes vivía como `ROTULO_ORIGEN`,
 * copiado a mano dentro de `app/calendario-pagos/page.tsx`, y sólo cubría la
 * primera. Un vocabulario del dominio tiene UNA tabla de presentación (ver
 * `cobranza.ts`), así que se mudó acá.
 *
 * Ante una clave desconocida se devuelve la clave cruda, no un "—": delata el
 * faltante en vez de esconderlo (mismo criterio que `etiquetaEtapa`).
 */
const ETIQUETAS_ORIGEN: Record<string, string> = {
  // ── comprometido ──────────────────────────────────────────────────────
  cuota_equipo: 'Cuota de equipo',
  cuota_sponsor: 'Cuota de sponsor',
  gasto_impago: 'Gasto impago',
  cheque_recibido: 'Cheque recibido',
  cheque_emitido: 'Cheque emitido',
  compromiso_factura: 'Factura',
  compromiso_cuota_plan: 'Cuota de plan',
  compromiso_cheque_emitido: 'Cheque emitido',
  compromiso_cheque_recibido: 'Cheque recibido',
  compromiso_otro: 'Compromiso',
  sueldo_socio: 'Sueldo de socio',
  // ── estimado ──────────────────────────────────────────────────────────
  presupuesto_partido: 'Presupuesto · por partido',
  presupuesto_dia_cancha: 'Presupuesto · día de cancha',
  presupuesto_mensual: 'Presupuesto · mensual',
  presupuesto_unico: 'Presupuesto · único',
  // ── real (asiento.origen) ────────────────────────────────────────────
  pago_equipo: 'Cobro a equipo',
  sponsor: 'Sponsor',
  socio: 'Socio',
  usd: 'Operación USD',
  amortizacion: 'Amortización',
  arqueo: 'Arqueo',
  bar: 'Bar',
  fondo: 'Fondo de inversión',
  gasto_devengo: 'Gasto (devengo)',
  gasto_pago: 'Gasto (pago)',
  cheque: 'Cheque',
}

export function etiquetaOrigen(origen: string | null | undefined): string {
  if (!origen) return '—'
  return ETIQUETAS_ORIGEN[origen] ?? origen
}

/**
 * Los orígenes que ofrece el filtro de `/calendario-pagos` — sólo el nivel
 * comprometido, en el mismo orden que tenía `ROTULO_ORIGEN` ahí. Los
 * `compromiso_*` quedan afuera del filtro a propósito (esa pantalla ya lo
 * hacía así): son la rama menos usada y duplican el rótulo de los otros
 * cuatro (`cheque_*`, etc.).
 */
export const ORIGENES_COMPROMETIDO_FILTRO: { valor: string; label: string }[] = [
  'cuota_equipo',
  'cuota_sponsor',
  'gasto_impago',
  'cheque_recibido',
  'cheque_emitido',
  'sueldo_socio',
].map((valor) => ({ valor, label: etiquetaOrigen(valor) }))

/**
 * A dónde lleva cada origen del nivel COMPROMETIDO — sólo ese nivel trae
 * `origen_id`/`tercero_id` (`v_cashflow_real` y `v_cashflow_estimado` no
 * tienen esas columnas). El destino lo decide `origen`, no si `tercero_id`
 * vino o no: un NULL ahí es "no se enlaza por tercero", no "no se puede
 * enlazar" (mismo criterio que ya usaba `app/calendario-pagos/page.tsx`).
 */
export function hrefOrigenComprometido(
  origen: string | null,
  terceroId: string | null,
  origenId: string | null,
): string | null {
  const o = origen ?? ''
  if (o === 'cuota_equipo') return terceroId ? `/equipos/${terceroId}` : '/equipos'
  if (o === 'cuota_sponsor') return terceroId ? `/sponsors/${terceroId}` : '/sponsors'
  if (o.startsWith('cheque_')) return origenId ? `/cheques/${origenId}` : '/cheques'
  if (o === 'gasto_impago') return '/gastos'
  if (o === 'sueldo_socio') return terceroId ? `/socios/${terceroId}` : '/socios'
  return null
}
