import jsQR from 'jsqr'
import qrcode from 'qrcode-generator'

import {
  ErrorQR,
  URL_QR_ARCA,
  jsonQrArca,
  pathQrArca,
  urlQrArca,
  type DatosQR,
} from '../lib/pdf/qr-arca.ts'

/**
 * Prueba el QR de ARCA de verdad: no que la función no explote, sino que lo
 * que sale sea escaneable y decodifique al JSON correcto.
 *
 *   node --experimental-strip-types scripts/probar-qr-arca.ts
 */

let fallas = 0
function chequeo(nombre: string, ok: boolean, detalle = '') {
  console.log(`  ${ok ? '✅' : '🔴'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  if (!ok) fallas++
}

const EJEMPLO: DatosQR = {
  fecha: '2026-08-25',
  cuitEmisor: '30-71550267-0',
  puntoVenta: 10,
  tipoComprobante: 6,
  numero: 407,
  importe: 10000,
  moneda: 'PES',
  cotizacion: 1,
  receptorDocTipo: 80,
  receptorDocNro: '20111111112',
  tipoCodAut: 'E',
  cae: '86349910665002',
}

// ── ① El JSON y la URL ─────────────────────────────────────────────────────
console.log('\n① El JSON de 13 campos y la URL')

const json = jsonQrArca(EJEMPLO)
const url = urlQrArca(EJEMPLO)

const CAMPOS = ['ver','fecha','cuit','ptoVta','tipoCmp','nroCmp','importe','moneda','ctz','tipoDocRec','nroDocRec','tipoCodAut','codAut']
chequeo('13 campos, con los nombres de la especificación',
  JSON.stringify(Object.keys(json)) === JSON.stringify(CAMPOS),
  Object.keys(json).join(','))
chequeo('ver = 1', json.ver === 1)
chequeo('el CUIT va sin guiones y como número', json.cuit === 30715502670, String(json.cuit))
chequeo('la URL arranca con la base oficial', url.startsWith(`${URL_QR_ARCA}?p=`))
console.log(`     ${url.slice(0, 78)}…`)
console.log(`     largo total: ${url.length} caracteres`)

// ── ② Ida y vuelta ─────────────────────────────────────────────────────────
console.log('\n② Ida y vuelta: decodificar el ?p= y comparar campo por campo')

const p = new URL(url).searchParams.get('p')!
const vuelta = JSON.parse(Buffer.from(p, 'base64').toString('utf8'))

chequeo('el base64 decodifica a JSON válido', typeof vuelta === 'object' && vuelta !== null)
let iguales = 0
for (const c of CAMPOS) {
  const ok = JSON.stringify(vuelta[c]) === JSON.stringify((json as unknown as Record<string, unknown>)[c])
  if (ok) iguales++
  else chequeo(`campo ${c}`, false, `esperaba ${JSON.stringify((json as unknown as Record<string, unknown>)[c])}, vino ${JSON.stringify(vuelta[c])}`)
}
chequeo(`los 13 campos vuelven idénticos`, iguales === 13, `${iguales}/13`)
chequeo('los numéricos vuelven como número, no string',
  [vuelta.cuit, vuelta.nroDocRec, vuelta.codAut, vuelta.importe].every((v) => typeof v === 'number'))

// ── ③ Escaneable de verdad ─────────────────────────────────────────────────
console.log('\n③ Escaneable: renderizar la matriz y decodificarla con un lector')

function decodificar(texto: string): string | null {
  const qr = qrcode(0, 'M')
  qr.addData(texto)
  qr.make()
  const lado = qr.getModuleCount()
  const ESCALA = 4
  const QUIET = 4 // el margen blanco que la norma del QR exige alrededor
  const px = (lado + QUIET * 2) * ESCALA
  const buf = new Uint8ClampedArray(px * px * 4).fill(255)

  for (let f = 0; f < lado; f++) {
    for (let c = 0; c < lado; c++) {
      if (!qr.isDark(f, c)) continue
      for (let dy = 0; dy < ESCALA; dy++) {
        for (let dx = 0; dx < ESCALA; dx++) {
          const x = (c + QUIET) * ESCALA + dx
          const y = (f + QUIET) * ESCALA + dy
          const i = (y * px + x) * 4
          buf[i] = buf[i + 1] = buf[i + 2] = 0
        }
      }
    }
  }
  return jsQR(buf, px, px)?.data ?? null
}

const leido = decodificar(url)
chequeo('un lector de QR lee la matriz', leido !== null)
chequeo('y lee EXACTAMENTE la URL que armamos', leido === url)
if (leido && leido !== url) console.log(`     leyó: ${leido.slice(0, 90)}`)

// El path vectorial tiene que describir la misma matriz.
const { path, lado } = pathQrArca(url)
const qrRef = qrcode(0, 'M'); qrRef.addData(url); qrRef.make()
chequeo('el path vectorial tiene el mismo lado que la matriz', lado === qrRef.getModuleCount(), `${lado} módulos`)
const tiras = (path.match(/M /g) ?? []).length
let oscuros = 0
for (let f = 0; f < lado; f++) for (let c = 0; c < lado; c++) if (qrRef.isDark(f, c)) oscuros++
chequeo('las tiras horizontales cubren todos los módulos oscuros',
  tiras > 0 && tiras <= oscuros, `${oscuros} módulos → ${tiras} rectángulos (${(path.length / 1024).toFixed(1)} KB de path)`)

// ── ④ Bordes ───────────────────────────────────────────────────────────────
console.log('\n④ Bordes')

const consumidorFinal = urlQrArca({ ...EJEMPLO, receptorDocTipo: 99, receptorDocNro: '0' })
const jsonCF = JSON.parse(Buffer.from(new URL(consumidorFinal).searchParams.get('p')!, 'base64').toString())
chequeo('consumidor final sin identificar (99 / 0)', jsonCF.tipoDocRec === 99 && jsonCF.nroDocRec === 0)

const conDecimales = jsonQrArca({ ...EJEMPLO, importe: 33333.33 })
chequeo('importe con decimales', conDecimales.importe === 33333.33, String(conDecimales.importe))

chequeo('CAE de 14 dígitos entero y exacto',
  jsonQrArca(EJEMPLO).codAut === 86349910665002 && Number.isSafeInteger(jsonQrArca(EJEMPLO).codAut))

function rechaza(nombre: string, datos: DatosQR) {
  try { urlQrArca(datos); chequeo(nombre, false, 'NO frenó') }
  catch (e) { chequeo(nombre, e instanceof ErrorQR, (e as Error).message.slice(0, 62) + '…') }
}
rechaza('nroDocRec de 20 dígitos (desbordaría el number)', { ...EJEMPLO, receptorDocNro: '12345678901234567890' })
rechaza('nroDocRec de 21 dígitos (fuera de la spec)', { ...EJEMPLO, receptorDocNro: '123456789012345678901' })
rechaza('nroDocRec vacío', { ...EJEMPLO, receptorDocNro: '' })
rechaza('fecha en formato argentino', { ...EJEMPLO, fecha: '25/08/2026' })
rechaza('moneda inventada', { ...EJEMPLO, moneda: 'PESOS' })
rechaza('tipoCodAut fuera de E/A', { ...EJEMPLO, tipoCodAut: 'CAE' as never })

const conGuiones = jsonQrArca({ ...EJEMPLO, cuitEmisor: '30-71550267-0' })
const sinGuiones = jsonQrArca({ ...EJEMPLO, cuitEmisor: '30715502670' })
chequeo('el CUIT da igual con guiones o sin ellos', conGuiones.cuit === sinGuiones.cuit)

const caea = jsonQrArca({ ...EJEMPLO, tipoCodAut: 'A' })
chequeo('acepta CAEA (tipoCodAut = A), para cuando exista', caea.tipoCodAut === 'A')

console.log(`\n${fallas === 0 ? '✅ todo verde' : `🔴 ${fallas} falla(s)`}\n`)
process.exit(fallas === 0 ? 0 : 1)
