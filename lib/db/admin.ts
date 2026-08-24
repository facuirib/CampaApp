import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/database.types'

/**
 * El cliente con `service_role`, para lo que ningún usuario puede hacer por sí
 * mismo: crear usuarios, invitarlos, cambiarles el rol, desactivarlos.
 *
 * `import 'server-only'` de primero y no como comentario: si algún día alguien
 * importa esto desde un Client Component, el build **falla** en vez de shippear
 * la key al navegador. Es el mismo cuidado que `RESEND_API_KEY` en
 * `lib/mail/client.ts`, subido un escalón — porque acá el secreto no manda
 * mails firmados como CAMPA, **saltea RLS entero**. Una `service_role` filtrada
 * es acceso total de lectura y escritura a toda la base, sin una sola policy en
 * el medio.
 *
 * Por eso este archivo no exporta un cliente ya construido como hace
 * `lib/mail/client.ts`, sino una función: un módulo que instancia al importarse
 * es un módulo que se evalúa por el solo hecho de aparecer en un grafo de
 * imports. Acá se construye cuando alguien lo pide, y quien lo pide es siempre
 * una Server Action.
 *
 * `persistSession: false` porque no hay sesión que persistir: cada llamada es
 * una operación administrativa puntual, no un usuario navegando.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    // Falla al llamarla, no al importarla: así el resto de la app arranca aunque
    // la key no esté configurada, y el error aparece en la única pantalla que
    // la necesita en vez de tirar abajo el build entero.
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY. La gestión de usuarios no puede ' +
        'funcionar sin ella: es la única credencial que puede crear e invitar.',
    )
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Los nombres de los roles viven en `lib/roles.ts`, fuera de este módulo: acá
// no pueden estar porque este archivo es `server-only` y el editor de usuarios
// —que es cliente— necesita dibujar el select. Se re-exportan para que el
// código de servidor tenga un solo import.
export { ROLES, ROL_LABEL, type Rol } from '@/lib/roles'
