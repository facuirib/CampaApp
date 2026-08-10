import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * La puerta: sin sesión no se entra, y de paso se refresca el token.
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
