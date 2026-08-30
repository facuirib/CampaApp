import type { Database } from '@/lib/db/database.types'

type PlantillaRow = Database['public']['Tables']['plantilla_mail']['Row']

/**
 * Las plantillas viven en la BASE, no en TypeScript.
 *
 * Es la decisión que quedó abierta desde julio, con las dos cosas construidas a
 * la vez: `plantilla_mail` modelada y sembrada con cuatro plantillas, y
 * `lib/mail/templates.ts` con dos escritas a mano. Ninguna se usaba, y mantener
 * las dos era la fábrica de drift que CLAUDE.md advierte.
 *
 * Gana la tabla, por una razón concreta: que Guille o Mati puedan cambiar "te
 * pedimos regularizar el pago" sin un deploy. En TypeScript, cada palabra
 * distinta es un commit, un build y un push — y el texto de un reclamo es
 * exactamente lo que se quiere poder ajustar después de mandarlo dos veces.
 */

/** Las claves sembradas. Un typo no compila. */
export type ClavePlantilla =
  | 'aviso_7dias'
  | 'reclamo_vencida'
  | 'reclamo_2'
  | 'recibo_pago'
  | 'factura_emitida'
  | 'cobranza_por_vencer'
  | 'cobranza_recordatorio'
  | 'cobranza_firme'

/**
 * Los placeholders que el sistema sabe resolver. **Esta es la lista.**
 *
 * Vive acá, junto al `resolver()` que los reemplaza, y no en la pantalla de
 * edición: si la pantalla ofreciera su propia lista, podría ofrecer uno que el
 * envío no resuelve —y saldría literal en el mail— o dejar de ofrecer uno que
 * sí existe. La ayuda que ve quien edita se genera de acá.
 *
 * `armarValores()` está tipada contra estas claves, así que agregar un
 * placeholder sin darle valor —o al revés— no compila.
 */
export const PLACEHOLDERS = {
  equipo: 'El nombre del equipo al que se le reclama.',
  cantidad: 'Cuántas cuotas se le reclaman, ya en plural: «3 cuotas vencidas».',
  monto: 'El total adeudado, formateado: «$1.240.000».',
  detalle: 'La lista de cuotas, una por línea, con torneo, fecha y saldo.',
} as const

export type Placeholder = keyof typeof PLACEHOLDERS

/**
 * Los del mail de un comprobante, que son otros.
 *
 * No se mezclan con los de arriba en una lista sola: un `{{numero}}` ofrecido
 * en un reclamo saldría **literal** en el mail —`resolver()` deja intacto lo
 * que no sabe resolver— y un `{{cantidad}}` en un recibo tampoco significa
 * nada. Cada plantilla ofrece los suyos, y el editor muestra los que
 * correspondan.
 */
export const PLACEHOLDERS_COMPROBANTE = {
  saludo:
    'El saludo completo, ya armado: «Hola Acme,» — o «Hola,» a secas cuando el ' +
    'comprobante no tiene un nombre real (los que van a Consumidor Final).',
  numero: 'El número del comprobante, formateado: «0010-00000018».',
  monto: 'El total del comprobante, formateado: «$525.000».',
  detalle: 'El concepto: «Cuota 3, Cuota 4».',
  fecha: 'La fecha de emisión: «18/08/2026».',
} as const

export type PlaceholderComprobante = keyof typeof PLACEHOLDERS_COMPROBANTE

/**
 * Los del aviso de cobranza.
 *
 * Son los de reclamo más `{{saludo}}` y `{{vencimiento}}`. `{{equipo}}` se va
 * por lo mismo que en los comprobantes: con el nombre vacío salía «Hola ,», y
 * el saludo con la coma adentro no se puede escribir mal.
 */
export const PLACEHOLDERS_COBRANZA = {
  saludo: 'El saludo ya armado: «Hola Acme,» — o «Hola,» si no hay nombre.',
  cantidad: 'Las cuotas del aviso, en plural: «3 cuotas vencidas».',
  monto: 'El total del aviso, formateado: «$1.240.000».',
  detalle: 'La lista de cuotas, una por línea, con torneo, fecha y saldo.',
  vencimiento:
    'La fecha que importa según la etapa: el próximo vencimiento en el aviso ' +
    'preventivo, el más antiguo impago en los otros dos.',
} as const

export type PlaceholderCobranza = keyof typeof PLACEHOLDERS_COBRANZA

/** Las tres etapas de la cobranza y la plantilla de cada una. */
export const PLANTILLA_POR_ETAPA = {
  por_vencer: 'cobranza_por_vencer',
  recordatorio: 'cobranza_recordatorio',
  firme: 'cobranza_firme',
} as const

export type EtapaCobranza = keyof typeof PLANTILLA_POR_ETAPA

/** Qué placeholders ofrece cada plantilla. El editor lee de acá. */
export const PLACEHOLDERS_POR_CLAVE: Record<ClavePlantilla, Record<string, string>> = {
  aviso_7dias: PLACEHOLDERS,
  reclamo_vencida: PLACEHOLDERS,
  reclamo_2: PLACEHOLDERS,
  recibo_pago: PLACEHOLDERS_COMPROBANTE,
  factura_emitida: PLACEHOLDERS_COMPROBANTE,
  cobranza_por_vencer: PLACEHOLDERS_COBRANZA,
  cobranza_recordatorio: PLACEHOLDERS_COBRANZA,
  cobranza_firme: PLACEHOLDERS_COBRANZA,
}

/**
 * Sin esto la plantilla queda rota, no pobre.
 *
 * `{{detalle}}` es la única obligatoria: un reclamo que no dice QUÉ cuotas se
 * deben no es un reclamo, es una queja. Los otros tres se pueden omitir —el
 * detalle ya menciona los montos— y por eso su ausencia es una advertencia y
 * no un bloqueo.
 */
export const PLACEHOLDERS_OBLIGATORIOS: Placeholder[] = ['detalle']

export function esPlaceholderValido(clave: string): clave is Placeholder {
  return clave in PLACEHOLDERS
}

/** Los `{{...}}` que aparecen en un texto y NO existen: saldrían literales. */
export function placeholdersDesconocidos(texto: string): string[] {
  return placeholdersFaltantes(texto).filter((c) => !esPlaceholderValido(c))
}

/** De los obligatorios, cuáles no están en el texto. */
export function obligatoriosAusentes(texto: string): Placeholder[] {
  const presentes = new Set(placeholdersFaltantes(texto))
  return PLACEHOLDERS_OBLIGATORIOS.filter((c) => !presentes.has(c))
}

export interface CuerposPlantilla {
  /** El HTML del mail. */
  cuerpo: string
  /** El plano de WhatsApp. Vacío o null = ese canal no manda nada. */
  cuerpo_texto: string | null
}

/**
 * Los obligatorios que faltan, **cuerpo por cuerpo**.
 *
 * Validar la concatenación de los dos sería un agujero: `{{detalle}}` presente
 * en el texto de WhatsApp taparía su ausencia en el HTML del mail, y se
 * guardaría un mail que no dice qué cuotas se deben. Son dos mensajes que van
 * por dos canales: cada uno tiene que estar completo por su cuenta.
 *
 * El plano se valida sólo si tiene contenido — vacío significa "por acá no se
 * manda", no "está incompleto".
 */
export function obligatoriosPorCuerpo(campos: CuerposPlantilla): {
  cuerpo: Placeholder[]
  cuerpo_texto: Placeholder[]
} {
  return {
    cuerpo: obligatoriosAusentes(campos.cuerpo),
    cuerpo_texto: campos.cuerpo_texto?.trim() ? obligatoriosAusentes(campos.cuerpo_texto) : [],
  }
}

export interface PlantillaResuelta {
  asunto: string
  /** Para el mail. */
  html: string
  /** Para WhatsApp. Null si esa plantilla no tiene versión plana. */
  texto: string | null
}

/**
 * Reemplaza `{{clave}}` por su valor.
 *
 * Un placeholder sin valor se deja **tal cual**, a propósito: si falta el dato,
 * que se vea `{{equipo}}` en la previsualización es un error obvio que se
 * detecta antes de mandar. Reemplazarlo por vacío produciría "Hola ," — que
 * parece un mensaje bien formado y se manda sin que nadie lo note.
 */
export function resolver(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (original, clave: string) =>
    clave in valores ? valores[clave] : original,
  )
}

/** Qué placeholders quedaron sin resolver. Vacío = la plantilla está completa. */
export function placeholdersFaltantes(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))]
}

/**
 * Toma la fila de la plantilla y le aplica los valores.
 *
 * La lectura de la base queda afuera —la hace quien llama, con su cliente— para
 * que esto sea una función pura y se pueda probar sin base.
 */
export function aplicar(
  plantilla: Pick<PlantillaRow, 'asunto' | 'cuerpo' | 'cuerpo_texto'>,
  // `Record<string, string>` y no `Record<Placeholder, string>`: ahora hay dos
  // familias de placeholders —reclamo y comprobante— y esta función resuelve
  // las dos. Quién puede usar cuál lo dice `PLACEHOLDERS_POR_CLAVE`, que es
  // donde esa regla se puede leer; acá sólo se sustituye.
  valores: Record<string, string>,
): PlantillaResuelta {
  return {
    asunto: resolver(plantilla.asunto, valores),
    html: resolver(plantilla.cuerpo, valores),
    texto: plantilla.cuerpo_texto ? resolver(plantilla.cuerpo_texto, valores) : null,
  }
}
