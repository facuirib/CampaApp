/**
 * Los cuatro roles, y sus etiquetas.
 *
 * Viven acá y no en `lib/db/admin.ts` porque ese módulo es `server-only` —
 * importa la `service_role`— y el editor de usuarios es un Client Component que
 * necesita los nombres para dibujar el select.
 *
 * Lo descubrió el build, no una revisión: al importar `ROLES` desde el cliente,
 * Next cortó con «'server-only' cannot be imported from a Client Component».
 * Ese es exactamente el trabajo que le pedimos al `import 'server-only'`, y la
 * separación que forzó es la correcta: **el nombre de un rol no es un secreto;
 * la credencial que los asigna, sí.**
 *
 * Fijos en el código por ahora. Configurables es fase futura.
 */
export const ROLES = ['admin', 'operador', 'read-only', 'bar', 'finanzas'] as const

export type Rol = (typeof ROLES)[number]

export const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  'read-only': 'Solo lectura',
  bar: 'Bar',
  finanzas: 'Finanzas',
}
