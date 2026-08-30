import { redirect } from 'next/navigation'

/**
 * `/reclamos` se fusionó con `/cobranza`.
 *
 * Eran dos módulos sobre los MISMOS datos —los dos arrancaban de
 * `v_deuda_equipo`, y la cola de reclamos era esa lista con un
 * `.gt('deuda_vencida', 0)` encima— y sin un solo link entre ellos: el
 * operador que veía a un deudor en cobranza tenía que volver al menú y
 * buscarlo de nuevo acá para poder avisarle.
 *
 * Queda el redirect y no un 404 porque hay links viejos —mails, mensajes,
 * favoritos del navegador— y romperlos no le enseña a nadie dónde está ahora.
 */
export default function ReclamosRedirect() {
  redirect('/cobranza')
}
