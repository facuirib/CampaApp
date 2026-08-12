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
export type ClavePlantilla = 'aviso_7dias' | 'reclamo_vencida' | 'reclamo_2' | 'recibo_pago'

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
  valores: Record<Placeholder, string>,
): PlantillaResuelta {
  return {
    asunto: resolver(plantilla.asunto, valores),
    html: resolver(plantilla.cuerpo, valores),
    texto: plantilla.cuerpo_texto ? resolver(plantilla.cuerpo_texto, valores) : null,
  }
}
