'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { exigirRol } from '@/lib/rol-actual'
import { emitirFacturaCompleta } from '@/lib/arca-fecaesolicitar'

/**
 * Emitir la factura fiscal de un cobro que ya tiene su recibo.
 *
 * **Cobrar y facturar son dos actos distintos.** El recibo nace solo en
 * `registrar_cobro`; la factura es posterior, la pide el equipo, y la hace
 * alguien de finanzas eligiendo el punto de venta. Por eso esto vive acá y no
 * adentro del cobro.
 *
 * Toda la orquestación —autenticar contra ARCA, preguntar el último número,
 * reservar, emitir, cerrar— la hace `emitirFacturaCompleta`. Acá se resuelven
 * los datos y se decide la letra.
 */

/** Responsable Inscripto: el único que recibe Factura A. */
const CONDICION_RI = 1
/** Consumidor Final, el fallback cuando el cliente no declaró su condición. */
const CONDICION_CONSUMIDOR_FINAL = 5
/** Doc «sin identificar» de ARCA, para el consumidor final anónimo. */
const DOC_SIN_IDENTIFICAR = { tipo: 99, nro: '0' }

/**
 * A qué ARCA se le habla.
 *
 * **El default es homologación, y es deliberado.** Olvidarse de la variable
 * tiene que llevar al lado que no hace daño: lo caro es lo contrario, descubrir
 * que se estaba en producción por una factura real que nadie quería emitir.
 * Sólo el string exacto `'true'` enciende producción.
 */
const esProduccion = () => process.env.ARCA_PRODUCCION === 'true'

export interface ResultadoEmision {
  ok: boolean
  /** Falló antes de tocar ARCA: no se emitió nada y no se consumió número. */
  error?: string
  /** ARCA contestó que no. El número queda liberado para el reintento. */
  rechazo?: string
  /** Se reservó el número y ARCA no llegó a contestar. Queda para reconciliar. */
  pendiente?: boolean
  comprobanteId?: string
  numero?: number
  puntoVenta?: number
  cae?: string | null
  caeVencimiento?: string | null
  letra?: 'A' | 'B'
  produccion?: boolean
}

export async function emitirFacturaDeCobro(
  comprobanteId: string,
  puntoVenta: number,
): Promise<ResultadoEmision> {
  // `exigirRol` devuelve un OBJETO {ok, ...}, no el rol: `if (!permiso)` sería
  // siempre falso y la guarda no denegaría nunca.
  const permiso = await exigirRol(['admin', 'finanzas'])
  if (!permiso.ok) return { ok: false, error: permiso.error }

  if (puntoVenta !== 10 && puntoVenta !== 11) {
    // No es paranoia: el punto llega del cliente y decide el domicilio, que
    // decide Comercio e Industria. La puerta de la base lo valida igual.
    return { ok: false, error: 'Elegí un punto de venta habilitado.' }
  }

  const supabase = await createClient()

  const { data: recibo } = await supabase
    .from('v_comprobante')
    .select('*')
    .eq('id', comprobanteId)
    .single()

  if (!recibo) return { ok: false, error: 'No encontré ese comprobante.' }
  if (recibo.es_factura) return { ok: false, error: 'Esto ya es una factura, no un cobro.' }
  if (!recibo.pago_id) return { ok: false, error: 'Este comprobante no cuelga de un cobro.' }
  if (recibo.ya_facturado) return { ok: false, error: 'Este cobro ya tiene su factura.' }

  const { data: emisor } = await supabase.from('emisor').select('cuit').eq('id', true).single()
  if (!emisor) return { ok: false, error: 'No hay emisor configurado.' }

  // ── El receptor y la letra ───────────────────────────────────────────────
  //
  // La letra NO se elige: se deriva de la condición del cliente. Sólo el
  // Responsable Inscripto recibe A, y sólo si tiene los datos que la A exige.
  const { data: cliente } = await supabase
    .from('v_cliente')
    .select('*')
    .eq('tercero_id', recibo.tercero_id!)
    .single()

  const esRI = cliente?.condicion_iva_id === CONDICION_RI

  if (esRI && !cliente?.facturable) {
    return {
      ok: false,
      error:
        `Para emitir una Factura A faltan datos del cliente: ${cliente?.falta_texto}. ` +
        'Completalos en su ficha y volvé.',
    }
  }

  const datos = {
    cuit: emisor.cuit.replace(/[^0-9]/g, ''),
    montoConIva: Number(recibo.monto),
    // Sin condición declarada se factura como consumidor final. Es lo que
    // corresponde y lo que la pantalla avisa antes de llegar acá.
    condicionIvaReceptorId: cliente?.condicion_iva_id ?? CONDICION_CONSUMIDOR_FINAL,
    receptorNombre: cliente?.razon_social ?? cliente?.nombre ?? 'Consumidor Final',
    receptorDocTipo: cliente?.doc_tipo ?? DOC_SIN_IDENTIFICAR.tipo,
    receptorDocNro: cliente?.doc_nro ?? DOC_SIN_IDENTIFICAR.nro,
    pagoId: recibo.pago_id,
  }

  try {
    const r = await emitirFacturaCompleta(supabase, datos, puntoVenta, esProduccion())

    revalidatePath('/comprobantes')
    revalidatePath(`/comprobantes/${comprobanteId}`)

    if (!r.aprobado) {
      // ARCA rechazó. La fila quedó en `error` y su número se liberó: los tres
      // únicos de comprobante excluyen las filas en error justamente para que
      // el reintento pueda volver a pedirlo.
      return {
        ok: false,
        rechazo: r.errorMensaje ?? r.observaciones.join(' · ') ?? 'ARCA rechazó el comprobante.',
        comprobanteId: r.comprobanteId,
        numero: r.numero,
        puntoVenta,
      }
    }

    return {
      ok: true,
      comprobanteId: r.comprobanteId,
      numero: r.numero,
      puntoVenta,
      cae: r.cae,
      caeVencimiento: r.caeVencimiento,
      letra: esRI ? 'A' : 'B',
      produccion: esProduccion(),
    }
  } catch (e) {
    revalidatePath('/comprobantes')

    // ── Qué pasó realmente: se mira, no se supone ──────────────────────────
    //
    // Una excepción puede venir de dos momentos muy distintos, y confundirlos
    // es caro. Si falló ANTES de reservar —no hay certificado, ARCA no
    // responde el login— no se consumió ningún número y no quedó rastro. Si
    // falló DESPUÉS, hay una fila en «pendiente» y hace falta reconciliarla.
    //
    // La primera versión daba todo por «pendiente». Medido: sin certificado,
    // decía «se reservó el número» cuando no se había creado ninguna fila —
    // mandaba a reconciliar algo que no existía. La diferencia la sabe la
    // base, así que se le pregunta.
    const { data: reserva } = await supabase
      .from('comprobante')
      .select('id, punto_venta, numero')
      .eq('pago_id', recibo.pago_id)
      .neq('tipo_comprobante', 0)
      .eq('estado', 'pendiente')
      .maybeSingle()

    const mensaje = e instanceof Error ? e.message : 'Se cortó la comunicación con ARCA.'

    if (!reserva) return { ok: false, error: mensaje }

    return {
      ok: false,
      pendiente: true,
      error: mensaje,
      comprobanteId: reserva.id,
      numero: reserva.numero,
      puntoVenta: reserva.punto_venta,
    }
  }
}

/** Lo que el modal necesita para armar los pasos, resuelto en el servidor. */
export interface ContextoEmision {
  clienteNombre: string
  condicionIva: string | null
  letra: 'A' | 'B'
  puedeEmitir: boolean
  falta: string | null
  sinCondicion: boolean
  terceroId: string
  produccion: boolean
  puntos: { numero: number; nombre: string; domicilio: string }[]
}

export async function contextoEmision(comprobanteId: string): Promise<ContextoEmision | null> {
  const permiso = await exigirRol(['admin', 'finanzas'])
  if (!permiso.ok) return null

  const supabase = await createClient()
  const { data: recibo } = await supabase
    .from('v_comprobante')
    .select('tercero_id')
    .eq('id', comprobanteId)
    .single()
  if (!recibo?.tercero_id) return null

  const [{ data: cliente }, { data: puntos }] = await Promise.all([
    supabase.from('v_cliente').select('*').eq('tercero_id', recibo.tercero_id).single(),
    supabase.from('punto_venta').select('numero, nombre, domicilio').eq('activo', true).order('numero'),
  ])

  const esRI = cliente?.condicion_iva_id === CONDICION_RI
  const sinCondicion = !cliente?.condicion_iva_id

  return {
    clienteNombre: cliente?.razon_social ?? cliente?.nombre ?? '—',
    condicionIva: cliente?.condicion_iva ?? null,
    letra: esRI ? 'A' : 'B',
    // Sólo la A exige datos completos. Al consumidor final se le factura B
    // aunque no haya declarado nada, que es el caso de casi todos hoy.
    puedeEmitir: esRI ? !!cliente?.facturable : true,
    falta: esRI && !cliente?.facturable ? (cliente?.falta_texto ?? null) : null,
    sinCondicion,
    terceroId: recibo.tercero_id,
    produccion: esProduccion(),
    puntos: puntos ?? [],
  }
}
