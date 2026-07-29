/**
 * Una regla de negocio que no se cumple.
 *
 * Es para lo que el operador puede entender y corregir —"el período está
 * cerrado", "la imputación supera el saldo de la cuota"—, no para fallas
 * técnicas: una caída de red o un bug de SQL no son `DomainError`.
 *
 * `message` va a pantalla tal cual, así que se escribe en español y en los
 * términos de la UI ("Efectivo", "Transferencia").
 *
 * Muchas de estas reglas ya las garantizan triggers de Postgres. Cuando una
 * función de la base rechaza una operación, quien la llama traduce ese rechazo
 * a un `DomainError` con `cause` apuntando al error original.
 */
export class DomainError extends Error {
  /** Identificador estable para distinguir el caso sin leer el mensaje. */
  readonly code?: string
  /** Datos del rechazo, para log. No se muestra en pantalla. */
  readonly details?: unknown

  constructor(
    message: string,
    options: { code?: string; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'DomainError'
    this.code = options.code
    this.details = options.details
  }
}

/** Para separar el error mostrable de la falla técnica en un `catch`. */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}
