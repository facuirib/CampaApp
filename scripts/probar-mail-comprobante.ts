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
    .select('asunto, cuerpo')
    .eq('clave', esRecibo ? 'recibo_pago' : 'factura_emitida')
    .single()

  console.log(`  comprobante : nº${c.numero} · ${esRecibo ? 'Recibo' : 'Factura'} · «${c.receptor_nombre}» · $${c.monto}`)
  console.log(`  PDF         : ${bytes.length} bytes → ${nombre}`)
  console.log(`  plantilla   : ${plantilla?.asunto}`)
  console.log(`  destino     : ${destino}`)
  console.log('  enviando…')

  const r = await enviarMail({
    to: destino,
    subject: `[PRUEBA] ${plantilla?.asunto ?? 'Comprobante · CAMPA'}`,
    html: (plantilla?.cuerpo ?? '<p>Comprobante adjunto.</p>')
      .replace(/\{\{equipo\}\}/g, c.receptor_nombre ?? '')
      .replace(/\{\{monto\}\}/g, String(c.monto))
      .replace(/\{\{detalle\}\}/g, nombre),
    adjuntos: [{ nombre, contenido: Buffer.from(bytes).toString('base64') }],
  })

  console.log('  resultado   :', r.ok ? (r.dryRun ? 'DRY-RUN (sin key)' : '✅ ENVIADO') : '🔴 ' + r.error)
}

main()
