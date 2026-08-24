import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { puede, reglaDeRuta, PERMISOS } from '@/lib/permisos'
import type { Rol } from '@/lib/roles'

/**
 * La puerta: sin sesión no se entra, sin el rol tampoco, y de paso se refresca
 * el token.
 *
 * El refresco no es opcional. El access token de Supabase dura una hora; quien
 * lo renueva en una app con Server Components es el middleware, escribiendo la
 * cookie nueva en la respuesta. Sin esto, la sesión se corta sola a la hora y
 * el usuario aparece deslogueado sin haber hecho nada.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // `getUser()` y NO `getSession()`. getSession lee la cookie y confía en lo
  // que dice: una cookie manipulada pasaría el control. getUser valida contra
  // el servidor de auth. Es más lento y es el que corresponde en la puerta.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const enLogin = request.nextUrl.pathname.startsWith('/login')

  // /login se excluye acá y NO en el matcher: si estuviera fuera del middleware,
  // el redirect inverso —el de alguien logueado que vuelve al login— no podría
  // ocurrir, y quedaría mirando un formulario que no necesita.
  if (!user && !enLogin) {
    const destino = request.nextUrl.clone()
    destino.pathname = '/login'
    destino.search = ''
    return NextResponse.redirect(destino)
  }

  if (user && enLogin) {
    const destino = request.nextUrl.clone()
    destino.pathname = '/'
    destino.search = ''
    return NextResponse.redirect(destino)
  }

  // ── Las rutas de escritura, por rol ──────────────────────────────────────
  //
  // Sólo las que son de escritura y nada más. Las pantallas mixtas —el detalle
  // de un cheque, el presupuesto, el tarifario— también son la pantalla de
  // lectura de eso, así que ahí lo que se esconde es el botón, no la puerta.
  //
  // Y esto no reemplaza a la policy: la reemplazaría si alguien creyera que
  // basta con no poder navegar. La ruta bloqueada evita el formulario que no
  // se va a poder mandar; lo que impide la escritura es RLS.
  const regla = user ? reglaDeRuta(request.nextUrl.pathname) : null

  if (regla) {
    // El claim, no `user.app_metadata`: es lo que va a leer `auth_rol()` en la
    // base. Si el rol cambió hace un rato y el token todavía no se renovó,
    // conviene rebotar con el rol viejo —el que la base va a usar— y no dejar
    // pasar a un formulario que la policy va a rechazar.
    const { data: claim } = await supabase.auth.getClaims()
    const rol = ((claim?.claims.app_metadata as { rol?: string } | undefined)?.rol ??
      null) as Rol | null

    if (!puede(rol, regla.op)) {
      const destino = request.nextUrl.clone()
      destino.pathname = regla.padre
      // El motivo viaja en la URL y la pantalla padre lo muestra: rebotar sin
      // decir nada se lee como que el link estaba roto.
      destino.search = `?sinpermiso=${encodeURIComponent(PERMISOS[regla.op].que)}`
      return NextResponse.redirect(destino)
    }
  }

  return response
}

export const config = {
  /**
   * Todo menos los estáticos.
   *
   * `brand/` va excluido a propósito: si el isologo quedara detrás de la
   * puerta, la pantalla de login —que se ve justamente sin sesión— se
   * dibujaría sin logo. Lo mismo con los assets de Next.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|jpg|svg|ico|webp)$).*)'],
}
