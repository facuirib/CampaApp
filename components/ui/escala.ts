/**
 * La escala de un eje numérico, en números redondos.
 *
 * ── El problema que resuelve ──────────────────────────────────────────────
 *
 * Antes cada gráfico tomaba el mínimo y el máximo REALES de sus datos y
 * repartía N marcas entre los dos. El resultado eran ejes rotulados
 * «$7,9M · $5,9M · $3,9M · $2,0M · $0,0M»: números exactos, ilegibles y sin
 * ninguna relación entre sí. Un eje no está para decir cuánto vale el dato más
 * alto —eso lo dice el dato— sino para dar una regla contra la cual leerlo, y
 * una regla se lee cuando sus marcas son redondas.
 *
 * ── Cómo elige el paso ────────────────────────────────────────────────────
 *
 * El algoritmo clásico de «números lindos»: se toma el paso ideal
 * —rango / cantidad de marcas—, se lo lleva a su potencia de diez y se lo
 * redondea hacia arriba al 1, 2, 5 o 10 más cercano. Con eso el paso siempre
 * es un número con el que se puede contar de memoria, y el mínimo y el máximo
 * del eje se corren al múltiplo de ese paso que los contiene.
 *
 * Correr los extremos es parte del arreglo, no un efecto secundario: si el eje
 * terminara en el máximo real, la última marca volvería a ser un número sucio.
 */

/**
 * El rótulo de una marca del eje, en plata, SIEMPRE entero.
 *
 * 🔴 La unidad la elige el PASO, no el valor, y ahí está el truco. Si cada
 * marca eligiera su propia unidad, un eje con paso de $500k daría
 * «$2,5M · $2M · $1,5M»: mitad con decimal y mitad sin. Eligiendo la unidad
 * desde el paso, ese mismo eje se rotula en miles —«$2.500k · $2.000k»— y todas
 * las marcas son enteras, que es lo que un eje tiene que ser para servir de
 * regla.
 *
 * `formatMoneyCorto` no sirve acá justamente por eso: decide la unidad mirando
 * cada número por separado.
 */
export function formatTickMoneda(valor: number, paso: number): string {
  // El cero no lleva unidad: «$0M» y «$0k» son la misma nada escrita de forma
  // rara, y en un eje que cruza el cero esa marca es la más mirada de todas.
  if (valor === 0) return '$0'

  const signo = valor < 0 ? '-' : ''
  const abs = Math.abs(valor)

  if (paso >= 1_000_000) return `${signo}$${Math.round(abs / 1_000_000).toLocaleString('es-AR')}M`
  if (paso >= 1_000) return `${signo}$${Math.round(abs / 1_000).toLocaleString('es-AR')}k`
  return `${signo}$${Math.round(abs).toLocaleString('es-AR')}`
}

/** Un eje ya resuelto: sus extremos redondos y las marcas de adentro. */
export interface EscalaEje {
  min: number
  max: number
  /** Las marcas, de la más baja a la más alta. Todas múltiplos del paso. */
  ticks: number[]
  paso: number
}

/** El 1, 2, 5, 10 más cercano hacia arriba, dentro de su potencia de diez. */
function pasoLindo(bruto: number): number {
  if (!(bruto > 0) || !Number.isFinite(bruto)) return 1
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)))
  const normalizado = bruto / potencia
  const escalon = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10
  return escalon * potencia
}

/**
 * La escala de un eje que va de `min` a `max`, con ~`marcas` divisiones.
 *
 * `min` y `max` son los del DATO; los que devuelve son los del EJE, corridos al
 * múltiplo del paso que los contiene. Siempre incluye el cero si el rango lo
 * cruza — quien llama ya suele pasarlo, y esto no lo saca.
 */
export function escalaEje(min: number, max: number, marcas = 5): EscalaEje {
  // Todo en cero: un eje de 0 a 1 con paso 1, en vez de dividir por cero.
  if (!Number.isFinite(min) || !Number.isFinite(max) || (min === 0 && max === 0)) {
    return { min: 0, max: 1, ticks: [0, 1], paso: 1 }
  }

  const divisiones = Math.max(1, marcas - 1)
  const paso = pasoLindo((max - min || Math.abs(max) || 1) / divisiones)

  const ejeMin = Math.floor(min / paso) * paso
  const ejeMax = Math.ceil(max / paso) * paso

  const ticks: number[] = []
  // Se cuenta con enteros y se multiplica al final: acumular sumando el paso
  // arrastra el error de coma flotante y termina dando 2.9999999999999996 en
  // vez de 3, que es justo el decimal que este módulo existe para evitar.
  const pasos = Math.round((ejeMax - ejeMin) / paso)
  for (let i = 0; i <= pasos; i++) ticks.push(ejeMin + i * paso)

  return { min: ejeMin, max: ejeMax === ejeMin ? ejeMin + paso : ejeMax, ticks, paso }
}
