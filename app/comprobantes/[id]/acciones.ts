'use server'

import { createClient } from '@/lib/db/server'
import { exigirRol } from '@/lib/rol-actual'
import { generarFacturaPDF } from '@/lib/pdf/factura'
import { generarReciboPDF } from '@/lib/pdf/recibo'
import { datosFacturaDesdeFila, datosReciboDesdeFila } from '@/lib/pdf/desde-fila'

/**
 * Devuelve el PDF de un comprobante.
 *
 * ── Por qué Server Action y no un `route.ts` ──────────────────────────────
 *
 * Es la convención del proyecto —«nunca API routes»— y para un botón
 * «Descargar» alcanza: el cliente recibe los bytes, arma un Blob y dispara la
 * bajada. Un Route Handler sería más natural para abrir el PDF en una pestaña o
 * compartir el link, y el día que haga falta eso se agrega; hoy no hace falta y
 * no vale estrenar una excepción a una regla escrita.
 *
 * ── El PDF no se guarda ───────────────────────────────────────────────────
 *
 * Se genera cada vez, y está bien: es un render de la fila congelada. Guardarlo
 * sería una segunda copia del mismo documento que podría desincronizarse de su
 * origen — y como la fila no cambia, regenerarlo da siempre lo mismo.
 */

interface Resultado {
  ok: boolean
  error?: string
  nombre?: string
  /** El PDF en base64: lo que cruza la frontera del servidor sin problemas. */
  base64?: string
}

export async function descargarPdf(comprobanteId: string): Promise<Resultado> {
  // Verlo es de oficina; bajarlo, también. La Server Action esquiva el gateo de
  // pantalla, así que el rol se vuelve a exigir acá.
  // `exigirRol` devuelve un objeto, no el rol: `if (!permiso)` sería siempre
  // falso y la guarda no denegaría nunca. Se chequea `.ok`.
  const permiso = await exigirRol(['admin', 'operador', 'read-only', 'finanzas'])
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const supabase = await createClient()

  const { data: c, error } = await supabase
    .from('comprobante')
    .select('*')
    .eq('id', comprobanteId)
    .single()
  if (error || !c) return { ok: false, error: 'No encontré ese comprobante.' }

  // La red del lado del servidor: sin CAE no hay documento que imprimir. La
  // pantalla ya no ofrece el botón, pero la acción es un endpoint y tiene que
  // sostener la regla por su cuenta.
  if (c.tipo_comprobante !== 0 && c.estado !== 'emitida') {
    return {
      ok: false,
      error:
        `Este comprobante está en «${c.estado}» y no tiene CAE. ` +
        'Un PDF sin CAE parecería una factura sin serlo.',
    }
  }

  const [{ data: emisor }, { data: condiciones }] = await Promise.all([
    supabase.from('emisor').select('*').eq('id', true).single(),
    supabase.from('condicion_iva_receptor').select('id, descripcion'),
  ])
  if (!emisor) return { ok: false, error: 'No hay emisor configurado.' }

  const desc = (id: number | null) =>
    condiciones?.find((x) => x.id === id)?.descripcion ?? ''

  const datosEmisor = {
    razonSocial: emisor.razon_social,
    cuit: emisor.cuit,
    condicionIva: desc(emisor.condicion_iva_id),
    ingresosBrutos: emisor.ingresos_brutos,
    inicioActividades: emisor.inicio_actividades,
  }

  const esRecibo = c.tipo_comprobante === 0
  const bytes = esRecibo
    ? await generarReciboPDF(
        datosReciboDesdeFila(c, datosEmisor, desc(c.condicion_iva_receptor_id)),
      )
    : await generarFacturaPDF(
        datosFacturaDesdeFila(c, datosEmisor, desc(c.condicion_iva_receptor_id)),
      )

  const nombre = `${esRecibo ? 'recibo' : 'factura'}-${String(c.punto_venta).padStart(4, '0')}-${String(
    c.numero,
  ).padStart(8, '0')}.pdf`

  return { ok: true, nombre, base64: Buffer.from(bytes).toString('base64') }
}
