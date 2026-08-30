'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { enviarMail } from '@/lib/mail/send'
import { aplicar } from '@/lib/reclamo/plantilla'
import { formatDate, formatMoney } from '@/lib/format'
import { envolver } from '@/lib/mail/sobre'
import { exigirRol } from '@/lib/rol-actual'
import { PERMISOS } from '@/lib/permisos'
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

/**
 * El PDF de un comprobante, armado una sola vez para los dos que lo necesitan:
 * la descarga y el envío por mail.
 *
 * Estaba adentro de `descargarPdf`. Se extrae ahora, no antes, porque hasta que
 * apareció el segundo consumidor no había nada que compartir — y un helper con
 * un solo llamador es más difícil de leer que el código donde vive.
 *
 * **No autoriza**: no mira roles. Lo hace a propósito — cada acción exige el
 * suyo, que no son los mismos (bajarlo lo puede hacer `lectura`; mandarlo, no).
 * Si esta función chequeara, habría dos lugares decidiendo y el más laxo
 * ganaría sin que se note.
 */
async function armarPdf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  comprobanteId: string,
): Promise<
  | { ok: false; error: string }
  | { ok: true; nombre: string; bytes: Uint8Array; fila: Record<string, unknown> }
> {
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

  const desc = (id: number | null) => condiciones?.find((x) => x.id === id)?.descripcion ?? ''

  const datosEmisor = {
    razonSocial: emisor.razon_social,
    cuit: emisor.cuit,
    condicionIva: desc(emisor.condicion_iva_id),
    ingresosBrutos: emisor.ingresos_brutos,
    inicioActividades: emisor.inicio_actividades,
  }

  const esRecibo = c.tipo_comprobante === 0
  const bytes = esRecibo
    ? await generarReciboPDF(datosReciboDesdeFila(c, datosEmisor, desc(c.condicion_iva_receptor_id)))
    : await generarFacturaPDF(
        datosFacturaDesdeFila(c, datosEmisor, desc(c.condicion_iva_receptor_id)),
      )

  const nombre = `${esRecibo ? 'recibo' : 'factura'}-${String(c.punto_venta).padStart(4, '0')}-${String(
    c.numero,
  ).padStart(8, '0')}.pdf`

  return { ok: true, nombre, bytes, fila: c as unknown as Record<string, unknown> }
}

export async function descargarPdf(comprobanteId: string): Promise<Resultado> {
  // Verlo es de oficina; bajarlo, también. La Server Action esquiva el gateo de
  // pantalla, así que el rol se vuelve a exigir acá.
  // `exigirRol` devuelve un objeto, no el rol: `if (!permiso)` sería siempre
  // falso y la guarda no denegaría nunca. Se chequea `.ok`.
  const permiso = await exigirRol(['admin', 'operador', 'read-only', 'finanzas'])
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const supabase = await createClient()
  const pdf = await armarPdf(supabase, comprobanteId)
  if (!pdf.ok) return { ok: false, error: pdf.error }

  return { ok: true, nombre: pdf.nombre, base64: Buffer.from(pdf.bytes).toString('base64') }
}

/**
 * Manda el comprobante por mail, con el PDF adjunto.
 *
 * ── El orden: se manda primero y se registra después ──────────────────────
 *
 * Es el mismo criterio que `enviarReclamoMail`, y por la misma razón: registrar
 * antes dejaría una fila que dice «enviado» cuando el mail falló. Un mail
 * enviado sin registro se arregla mirando la casilla; un registro que miente no
 * se detecta nunca. **El registro no puede ser la condición del envío.**
 *
 * ── El PDF sale de la misma función que la descarga ───────────────────────
 *
 * `armarPdf` decide recibo o factura por `tipo_comprobante` y aplica el mismo
 * mapeo congelado. Que el adjunto y la descarga salgan del mismo lugar es lo
 * que garantiza que el papel que recibe el equipo sea **idéntico** al que ve la
 * oficina — si fueran dos caminos, un día divergen y nadie se entera.
 *
 * ── La guarda ─────────────────────────────────────────────────────────────
 *
 * Mandar un mail no pasa por ninguna policy: Resend no sabe de RLS. Así que
 * este `exigirRol` **es** la autorización, no un refuerzo. Va antes de tocar
 * nada, porque una vez que el mail salió no se puede volver atrás.
 *
 * `lectura` puede bajar el PDF pero NO mandarlo: mirar y escribirle a un
 * tercero son cosas distintas.
 */
export async function enviarComprobanteMail(
  comprobanteId: string,
  destinatario: string,
  guardarEnTercero: boolean,
): Promise<{ ok: boolean; error?: string; dryRun?: boolean; avisoGuardado?: string }> {
  const permiso = await exigirRol(['admin', 'operador', 'finanzas'])
  if (!permiso.ok) {
    return { ok: false, error: `Enviar comprobantes por mail no está a tu alcance. ${permiso.error}` }
  }

  const destino = destinatario.trim()
  // Validación mínima y a propósito: alcanza para atajar el dedazo evidente.
  // Un regex exhaustivo de mail rechaza direcciones válidas y raras, y acá el
  // que sabe de verdad si existe es el servidor del otro lado.
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(destino)) {
    return { ok: false, error: 'Esa dirección de mail no parece válida.' }
  }

  const supabase = await createClient()

  const pdf = await armarPdf(supabase, comprobanteId)
  if (!pdf.ok) return { ok: false, error: pdf.error }

  const fila = pdf.fila as {
    tipo_comprobante: number
    receptor_nombre: string | null
    monto: number
    punto_venta: number
    numero: number
    fecha_emision: string
    detalle: string | null
  }
  const esRecibo = fila.tipo_comprobante === 0

  const numeroFormateado = `${String(fila.punto_venta).padStart(4, '0')}-${String(
    fila.numero,
  ).padStart(8, '0')}`

  // ── El saludo se arma acá, no en la plantilla ───────────────────────────
  //
  // Con `<p>Hola {{equipo}},</p>` y un receptor vacío sale «Hola ,», y con el
  // receptor que pone el circuito cuando el cliente no tiene datos sale «Hola
  // Consumidor Final,», que es peor: le habla a una categoría fiscal como si
  // fuera el nombre de alguien. Hoy es el caso de casi todos —304 de 307
  // clientes están sin datos—, así que no es un borde.
  //
  // Por eso el placeholder es `{{saludo}}` y no `{{equipo}}`: la coma va
  // adentro del valor, y quien edita el texto no puede equivocarse con esto.
  const nombreReal =
    fila.receptor_nombre && fila.receptor_nombre.trim() !== '' &&
    fila.receptor_nombre.trim().toLowerCase() !== 'consumidor final'
      ? fila.receptor_nombre.trim()
      : null
  const saludo = nombreReal ? `Hola ${nombreReal},` : 'Hola,'

  const { data: plantilla } = await supabase
    .from('plantilla_mail')
    .select('asunto, cuerpo, cuerpo_texto')
    .eq('clave', esRecibo ? 'recibo_pago' : 'factura_emitida')
    .maybeSingle()

  if (!plantilla) {
    return {
      ok: false,
      error: `Falta la plantilla «${esRecibo ? 'recibo_pago' : 'factura_emitida'}» en plantilla_mail.`,
    }
  }

  // El mismo motor de plantillas que el reclamo, con los placeholders del
  // comprobante (`PLACEHOLDERS_COMPROBANTE`).
  const { asunto, html: mensaje } = aplicar(plantilla, {
    saludo,
    numero: numeroFormateado,
    monto: formatMoney(Number(fila.monto)),
    detalle: fila.detalle ?? '',
    fecha: formatDate(fila.fecha_emision),
  })

  // ── El sobre ────────────────────────────────────────────────────────────
  //
  // El mensaje que salió de la plantilla se envuelve en el diseño, que vive en
  // código. Los DESTACADOS no salen de la plantilla a propósito: son números, y
  // un número en un texto editable se puede desincronizar del comprobante sin
  // que nadie lo note. Salen de la fila, igual que el PDF.
  const { data: emisorMail } = await supabase
    .from('emisor')
    .select('razon_social, cuit')
    .eq('id', true)
    .single()

  const sobre = envolver({
    cuerpoHtml: mensaje,
    destacados: [
      { rotulo: esRecibo ? 'Recibo N°' : 'Factura N°', valor: numeroFormateado },
      { rotulo: 'Fecha', valor: formatDate(fila.fecha_emision) },
      { rotulo: 'Total', valor: formatMoney(Number(fila.monto)) },
    ],
    emisor: {
      razonSocial: emisorMail?.razon_social ?? 'Campa Fútbol',
      cuit: emisorMail?.cuit ?? '',
    },
  })

  const envio = await enviarMail({
    to: destino,
    subject: asunto,
    html: sobre.html,
    // El PDF primero —es el adjunto que la gente ve y baja— y después los
    // inline que pide el diseño, que no aparecen en la lista de adjuntos.
    adjuntos: [
      { nombre: pdf.nombre, contenido: Buffer.from(pdf.bytes).toString('base64') },
      ...sobre.inline,
    ],
  })

  if (!envio.ok) return { ok: false, error: envio.error ?? 'No se pudo enviar el mail.' }

  // ── Recién ahora se registra ────────────────────────────────────────────
  //
  // En `envio`, que ya existía sin usarse, y no en una columna `enviado_at` del
  // comprobante: reenviar es normal —«no me llegó»— y una columna sólo guardaría
  // el último. Acá queda la historia entera, que es lo que se quiere mirar.
  const { data: { user } } = await supabase.auth.getUser()
  const terceroId = (pdf.fila as { tercero_id?: string | null }).tercero_id ?? null

  // `envio.tercero_id` es NOT NULL —un envío siempre es A alguien— así que si
  // el comprobante no tiene tercero (los `sin_origen`, cargados a mano) el
  // registro no se intenta: fallaría por el FK y el mensaje hablaría de una
  // restricción en vez de decir qué pasó.
  const { error: errorRegistro } = terceroId
    ? await supabase.from('envio').insert({
    tercero_id: terceroId,
    plantilla: esRecibo ? 'recibo_pago' : 'factura_emitida',
    destinatario: destino,
    payload: { comprobante_id: comprobanteId, archivo: pdf.nombre, resend_id: envio.id ?? null },
    enviado_por: user?.id ?? null,
      })
    : { error: null }

  let avisoGuardado: string | undefined
  if (!terceroId) {
    avisoGuardado =
      'El mail salió. No quedó registrado en el historial porque este comprobante no cuelga de ningún tercero.'
  } else if (errorRegistro) {
    // No se devuelve `ok: false`: el mail YA salió. Decir que falló mandaría a
    // reenviarlo, o sea a mandarlo dos veces por un problema de registro.
    avisoGuardado = `El mail salió, pero no se pudo registrar el envío: ${errorRegistro.message}`
  }

  if (guardarEnTercero) {
    if (terceroId) {
      // Allowlist de UNA columna: RLS decide qué FILAS se tocan, no qué campos.
      const { error } = await supabase
        .from('tercero')
        .update({ email: destino })
        .eq('id', terceroId)
        .select('id')
      if (error) avisoGuardado = `El mail salió, pero no se pudo guardar la dirección: ${error.message}`
    }
  }

  revalidatePath(`/comprobantes/${comprobanteId}`)
  return { ok: true, dryRun: envio.dryRun, avisoGuardado }
}

/**
 * Guarda el teléfono en la ficha del tercero.
 *
 * Existe suelta —y no adentro de un «avisar por WhatsApp»— porque **avisar por
 * WhatsApp no es una acción del servidor**: es abrir un link. El sistema no
 * manda nada y no puede saber si el operador apretó enviar, así que no hay nada
 * que registrar y no hay Server Action que envuelva el aviso.
 *
 * Lo único que sí toca la base es esto: dejar cargado el número para la próxima
 * vez, que es la misma casilla que ya tiene el envío por mail. Con 1 contacto
 * cargado de 307 terceros, es lo que hace que el dato se junte solo en vez de
 * esperar una carga masiva.
 *
 * Mismo rol que el envío: es el mismo acto —comunicarle el comprobante a un
 * tercero— por otro medio.
 */
export async function guardarContactoTercero(
  terceroId: string,
  contacto: string,
): Promise<{ ok: boolean; error?: string }> {
  const permiso = await exigirRol(PERMISOS['comprobante.enviar'].roles)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const valor = contacto.trim()
  if (!valor) return { ok: false, error: 'El teléfono está vacío.' }

  const supabase = await createClient()

  // Allowlist de UNA columna, igual que al guardar el mail: RLS decide qué
  // FILAS se tocan, no qué campos.
  const { data, error } = await supabase
    .from('tercero')
    .update({ contacto: valor })
    .eq('id', terceroId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  // RLS deniega el UPDATE en silencio: sin mirar las filas, esto diría que
  // guardó cuando no guardó nada.
  if (!data?.length) return { ok: false, error: 'No se guardó: no tenés permiso sobre esa ficha.' }

  revalidatePath(`/comprobantes`)
  return { ok: true }
}
