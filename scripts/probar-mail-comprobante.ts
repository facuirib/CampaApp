// Manda UN mail de prueba con un comprobante adjunto.
//
// ⚠️ ENVÍA DE VERDAD. Desde que hay RESEND_API_KEY, el dry-run de
// `enviarMail` se apaga solo: no hay modo ensayo. Por eso el destinatario se
// pasa por argumento y no tiene default — para que no se mande "sin querer" a
// una dirección que estaba escrita en el archivo.
//
// Qué prueba: que el adjunto viaje, que el remitente sea el del dominio
// verificado, y que el PDF que llega sea el mismo que genera la descarga.
// Qué NO prueba: la guarda de rol ni el registro en `envio` — eso vive en la
// Server Action, que necesita sesión de navegador.
//
//   npx tsx --env-file=.env.local scripts/probar-mail-comprobante.ts <mail> [nº recibo]

import { createClient } from '@supabase/supabase-js'
import { enviarMail } from '../lib/mail/send.ts'
import { envolver } from '../lib/mail/sobre.ts'
import { aplicar } from '../lib/reclamo/plantilla.ts'
import { generarReciboPDF } from '../lib/pdf/recibo.ts'
import { generarFacturaPDF } from '../lib/pdf/factura.ts'
import { datosReciboDesdeFila, datosFacturaDesdeFila } from '../lib/pdf/desde-fila.ts'

async function main() {
  const destino = process.argv[2]
  const numero = Number(process.argv[3] ?? 18)
  if (!destino) throw new Error('Falta el destinatario: npx tsx ... <mail> [nº]')

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: c } = await admin.from('comprobante').select('*').eq('numero', numero).single()
  if (!c) throw new Error(`No encontré el comprobante nº${numero}`)

  const [{ data: emisor }, { data: condiciones }] = await Promise.all([
    admin.from('emisor').select('*').eq('id', true).single(),
    admin.from('condicion_iva_receptor').select('id, descripcion'),
  ])
  const desc = (id: number | null) => condiciones?.find((x) => x.id === id)?.descripcion ?? ''
  const datosEmisor = {
    razonSocial: emisor!.razon_social,
    cuit: emisor!.cuit,
    condicionIva: desc(emisor!.condicion_iva_id),
    ingresosBrutos: emisor!.ingresos_brutos,
    inicioActividades: emisor!.inicio_actividades,
  }

  const esRecibo = c.tipo_comprobante === 0
  const bytes = esRecibo
    ? await generarReciboPDF(datosReciboDesdeFila(c, datosEmisor, desc(c.condicion_iva_receptor_id)))
    : await generarFacturaPDF(datosFacturaDesdeFila(c, datosEmisor, desc(c.condicion_iva_receptor_id)))

  const nombre = `${esRecibo ? 'recibo' : 'factura'}-${String(c.punto_venta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}.pdf`

  const { data: plantilla } = await admin
    .from('plantilla_mail')
    .select('asunto, cuerpo, cuerpo_texto')
    .eq('clave', esRecibo ? 'recibo_pago' : 'factura_emitida')
    .single()

  const { data: emisorMail } = await admin
    .from('emisor').select('razon_social, cuit').eq('id', true).single()

  // El mismo saludo que arma la acción: sin nombre real, «Hola,» a secas.
  const nombreReal =
    c.receptor_nombre && c.receptor_nombre.trim() !== '' &&
    c.receptor_nombre.trim().toLowerCase() !== 'consumidor final'
      ? c.receptor_nombre.trim() : null
  const saludo = nombreReal ? `Hola ${nombreReal},` : 'Hola,'

  const numeroFormateado = `${String(c.punto_venta).padStart(4,'0')}-${String(c.numero).padStart(8,'0')}`
  const fecha = new Date(c.fecha_emision + 'T00:00:00').toLocaleDateString('es-AR')

  const { asunto, html: mensaje } = aplicar(plantilla!, {
    saludo, numero: numeroFormateado,
    monto: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(c.monto)),
    detalle: c.detalle ?? '', fecha,
  })

  const html = envolver({
    cuerpoHtml: mensaje,
    destacados: [
      { rotulo: esRecibo ? 'Recibo N°' : 'Factura N°', valor: numeroFormateado },
      { rotulo: 'Fecha', valor: fecha },
      { rotulo: 'Total', valor: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(c.monto)) },
    ],
    emisor: { razonSocial: emisorMail!.razon_social, cuit: emisorMail!.cuit },
  })

  console.log(`  comprobante : nº${c.numero} · ${esRecibo ? 'Recibo' : 'Factura'} · «${c.receptor_nombre}» · $${c.monto}`)
  console.log(`  saludo      : «${saludo}»${nombreReal ? '' : '   ← sin nombre real'}`)
  console.log(`  asunto      : ${asunto}`)
  console.log(`  PDF         : ${bytes.length} bytes → ${nombre}`)
  console.log(`  destino     : ${destino}`)

  if (process.argv.includes('--solo-preview')) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(process.env.PREVIEW_OUT ?? 'preview.html', html)
    console.log('  ✅ preview escrito, SIN enviar')
    return
  }

  const r = await enviarMail({
    to: destino, subject: asunto, html,
    adjuntos: [{ nombre, contenido: Buffer.from(bytes).toString('base64') }],
  })
  console.log('  resultado   :', r.ok ? (r.dryRun ? 'DRY-RUN' : `✅ ENVIADO · id ${r.id}`) : '🔴 ' + r.error)
}

main()
