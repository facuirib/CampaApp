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
  valores: Record<string, string>,
): PlantillaResuelta {
  return {
    asunto: resolver(plantilla.asunto, valores),
    html: resolver(plantilla.cuerpo, valores),
    texto: plantilla.cuerpo_texto ? resolver(plantilla.cuerpo_texto, valores) : null,
  }
}
