import type { Metadata } from 'next'
import { Asap } from 'next/font/google'
import Sidebar from '@/components/Sidebar'
import { createClient } from '@/lib/db/server'
import './globals.css'

// Asap es la tipografía de marca. next/font la sirve desde el mismo dominio y
// reserva la métrica antes de que baje, así que no hay salto de layout ni
// pedido a fonts.googleapis.com. El eje de peso va completo (400..800) porque
// el sistema usa 700 en botones y 800 en títulos y cifras.
const asap = Asap({
  subsets: ['latin'],
  variable: '--font-asap',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CAMPA',
  description: 'Gestión financiera del torneo',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // El email para el pie del sidebar. En /login no hay sesión y el layout de
  // esa ruta no monta el sidebar, así que `user` en null es un caso normal y
  // no un error.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <html lang="es-AR" className={asap.variable}>
      <body className="antialiased">
        {/* Sin sesión NO se monta el chrome de la app.

            En App Router los layouts se COMPONEN: un layout propio en /login se
            anida dentro de éste en vez de reemplazarlo, así que el sidebar
            aparecería igual. La alternativa canónica es un route group
            —mover las veinte rutas a app/(privado)/— y para una sola pantalla
            pública no lo vale.

            La condición es sólida porque el middleware la sostiene: sin usuario
            la única ruta alcanzable es /login. Si mañana hubiera una segunda
            pantalla pública, esto sigue funcionando sin tocarse. */}
        {user ? (
          // En mobile el sidebar es una franja arriba y el contenido va debajo;
          // desde md pasan a ser dos columnas. El `min-w-0` del main es lo que
          // impide que una tabla ancha empuje el ancho de todo el layout.
          <div className="md:flex md:items-start">
            <Sidebar email={user.email} />
            <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
              <div className="mx-auto max-w-6xl">{children}</div>
            </main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  )
}
