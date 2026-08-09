/**
 * La lectura del log de auditoría.
 *
 * `audit_log` guarda dos snapshots `jsonb` por evento y nada más: qué cambió
 * hay que derivarlo comparándolos. Acá está esa lógica, fuera de la pantalla,
 * porque no es maquetado — es cómo se lee un evento de auditoría, y va a hacer
 * falta igual el día que haya un detalle, un export o un mail de alerta.
 *
 * El CONTEO de campos cambiados NO está acá: lo calcula `v_auditoria` en SQL,
 * porque la pantalla necesita filtrar por él y PostgREST no puede filtrar por
 * algo que no es columna. Acá se arma el detalle legible; el número viene de
 * la base y las dos cosas usan la misma definición.
 */

export interface CampoCambiado {
  campo: string
  antes: unknown
  despues: unknown
}

/** Un `jsonb` de la base, ya sabiendo que es un registro y no un array. */
export function comoRegistro(valor: unknown): Record<string, unknown> | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null
  return valor as Record<string, unknown>
}

/** Un valor de campo, en corto. Los objetos se truncan para que entren. */
export function formatValor(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'object') {
    const texto = JSON.stringify(v)
    return texto.length > 40 ? `${texto.slice(0, 37)}…` : texto
  }
  return String(v)
}

/**
 * Los campos que difieren entre dos snapshots.
 *
 * `anterior = null` es un alta; `nuevo = null`, una baja. La comparación es la
 * misma que hace `v_auditoria` en SQL —clave por clave, sobre la unión de las
 * claves de los dos lados— así que el largo de esta lista coincide con
 * `campos_cambiados`. Si algún día dejaran de coincidir, es que una de las dos
 * cambió de criterio sin la otra.
 */
export function calcularCambios(
  anterior: Record<string, unknown> | null,
  nuevo: Record<string, unknown> | null,
): CampoCambiado[] {
  const claves = new Set([...Object.keys(anterior ?? {}), ...Object.keys(nuevo ?? {})])
  const cambios: CampoCambiado[] = []

  for (const campo of claves) {
    const antes = anterior?.[campo]
    const despues = nuevo?.[campo]
    if (JSON.stringify(antes) !== JSON.stringify(despues)) {
      cambios.push({ campo, antes, despues })
    }
  }

  return cambios.sort((a, b) => a.campo.localeCompare(b.campo))
}

/**
 * El diff en una línea, para que entre en una celda de tabla.
 *
 * Un DELETE cambia el registro entero —8 a 11 campos en las tablas de hoy— y
 * enumerarlos no dice nada útil: lo que importa es que se borró. Por eso la
 * baja se resume en una frase y no en una lista.
 *
 * Para el resto se muestran los primeros campos y, si quedan más, cuántos. El
 * corte es de presentación: `campos_cambiados` sigue diciendo el total exacto.
 */
export function resumirCambios(operacion: string, cambios: CampoCambiado[], maximo = 3): string {
  if (operacion === 'DELETE') {
    return `Se borró el registro (${cambios.length} campos)`
  }
  if (cambios.length === 0) {
    // No es un adorno: es el síntoma de que algo reescribió la fila con los
    // mismos valores. Ver la nota de fn_audit en decisiones.md.
    return 'Sin cambios'
  }

  const visibles = cambios
    .slice(0, maximo)
    .map((c) => `${c.campo}: ${formatValor(c.antes)} → ${formatValor(c.despues)}`)
    .join(' · ')

  const resto = cambios.length - maximo
  return resto > 0 ? `${visibles} · +${resto}` : visibles
}
