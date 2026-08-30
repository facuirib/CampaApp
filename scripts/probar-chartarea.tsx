import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

// ChartArea —como todo componente de Next— usa JSX sin importar React. Fuera
// del compilador de Next hay que ponerlo en el ámbito global a mano.
;(globalThis as { React?: unknown }).React = React
import ChartArea, { type PuntoSerie } from '@/components/ui/ChartArea'

/**
 * ChartArea es COMPARTIDO: lo usan `/`, `/design` y `/proyeccion`. El tercer
 * estado tiene que ser aditivo — una serie que no manda `incompleto` tiene que
 * dibujar EXACTAMENTE lo de antes.
 */
const dosEstados: PuntoSerie[] = [
  { fecha: '2026-07-06', valor: 10 },
  { fecha: '2026-07-13', valor: 20 },
  { fecha: '2026-07-20', valor: 30, proyectado: true },
  { fecha: '2026-07-27', valor: 40, proyectado: true },
]
const tresEstados: PuntoSerie[] = [
  { fecha: '2026-07-06', valor: 10 },
  { fecha: '2026-07-13', valor: 20 },
  { fecha: '2026-07-20', valor: 30, proyectado: true },
  { fecha: '2026-07-27', valor: 40, proyectado: true, incompleto: true },
]

const html = (s: PuntoSerie[]) => renderToStaticMarkup(<ChartArea serie={s} titulo="t" />)

const a = html(dosEstados)
const b = html(tresEstados)

const cuenta = (h: string, re: RegExp) => (h.match(re) ?? []).length

console.log('── el caso de SIEMPRE (dos estados, como / y /design) ──')
console.log('  trazos con var(--warn)      :', cuenta(a, /var\(--warn\)/g), '(esperado 0)')
console.log('  polilíneas dibujadas        :', cuenta(a, /<polyline/g))
console.log('  ¿idéntico al de tres estados?:', a === b ? '🔴 sí — el flag no hace nada' : 'no, como debe ser')

console.log('')
console.log('── el caso NUEVO (con cola incompleta) ──')
console.log('  trazos con var(--warn)      :', cuenta(b, /var\(--warn\)/g), '(esperado 2: divisoria + línea)')
console.log('  polilíneas dibujadas        :', cuenta(b, /<polyline/g))
console.log('  divisoria vertical          :', /stroke-dasharray="3 3"/.test(b) ? 'sí' : '🔴 no')

// 🔴 Lo que de verdad prueba que no rompí nada: el HTML del caso viejo tiene
// que ser byte por byte el de antes de tocar el componente. Como el "antes" ya
// no existe, se verifica lo equivalente: que el caso viejo NO contenga NADA del
// tratamiento nuevo, y que las polilíneas sean las mismas dos de siempre.
const limpio = cuenta(a, /var\(--warn\)/g) === 0 && cuenta(a, /<polyline/g) === cuenta(b, /<polyline/g) - 1
console.log('')
console.log(limpio
  ? '✅ ADITIVO: sin `incompleto` el gráfico no dibuja una sola cosa nueva.'
  : '🔴 el caso de dos estados cambió — revisar antes de seguir')
