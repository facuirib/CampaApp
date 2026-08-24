import Link from 'next/link'
import { createAdminClient } from '@/lib/db/admin'
import type { Rol } from '@/lib/roles'
import { Card } from '@/components/ui'
import UsuariosEditor, { type FilaUsuario } from './UsuariosEditor'

export default async function UsuariosPage() {
  let filas: FilaUsuario[] = []
  let error: string | null = null

  try {
    const admin = createAdminClient()
    const { data, error: err } = await admin.auth.admin.listUsers()
    if (err) throw err

    filas = data.users
      .map((u) => ({
        id: u.id,
        email: u.email ?? '—',
        // El rol sale de `app_metadata`, no de `user_metadata`: el segundo lo
        // edita el propio usuario, así que un rol ahí no sería un permiso.
        rol: (u.app_metadata?.rol as Rol | undefined) ?? null,
        ultimo_login: u.last_sign_in_at ?? null,
        creado: u.created_at,
        // `banned_until` viene como fecha; se muestra el hecho, no la fecha —
        // un ban a 100 años es "desactivado", decir el año confunde.
        desactivado: Boolean(
          (u as { banned_until?: string }).banned_until &&
            new Date((u as { banned_until?: string }).banned_until!) > new Date(),
        ),
      }))
      .sort((a, b) => a.email.localeCompare(b.email))
  } catch (e) {
    error = e instanceof Error ? e.message : 'No se pudo leer la lista de usuarios.'
  }

  return (
    <div className="pb-10">
      <header className="mb-6">
        <Link href="/configuracion" className="text-[12px] text-muted hover:text-ink">
          ← Configuración
        </Link>
        <h1 className="mt-2 text-xl font-extrabold tracking-[-.4px] text-ink">Usuarios</h1>
        <p className="mt-1 text-[12px] text-muted">
          Quién entra al sistema y con qué permisos. El rol viaja en la sesión: al cambiarlo,
          le aplica a la persona la próxima vez que su sesión se renueve.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error}</p>
      )}

      {/* El aviso NO se condiciona a `mailHabilitado`.
          
          Esa bandera mira `RESEND_API_KEY`, que es el correo de los reclamos —
          una cosa distinta del mailer que usa Supabase para las invitaciones,
          que se configura en su panel y desde acá no se puede leer. Atarlo a
          esa bandera diría «el mail está configurado» mirando el mail
          equivocado, que es peor que no decir nada.
          
          Así que se enuncia el hecho, sin fingir que se conoce el estado. */}
      <p className="mb-6 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
        <strong>Las invitaciones salen por el servidor de correo de Supabase</strong>, que se
        configura en su panel y es independiente del correo de los reclamos. Sin un SMTP
        propio, el mailer por defecto manda ~2 mails por hora y suele caer en spam. Si una
        invitación falla, es por ahí.
      </p>

      <Card>
        <UsuariosEditor usuarios={filas} />
      </Card>
    </div>
  )
}
