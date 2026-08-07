import type { Metadata } from 'next'
import { Asap } from 'next/font/google'
import Sidebar from '@/components/Sidebar'
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es-AR" className={asap.variable}>
      <body className="antialiased">
        {/* En mobile el sidebar es una franja arriba y el contenido va debajo;
            desde md pasan a ser dos columnas. El `min-w-0` del main es lo que
            impide que una tabla ancha empuje el ancho de todo el layout. */}
        <div className="md:flex md:items-start">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  )
}
