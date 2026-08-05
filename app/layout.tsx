import type { Metadata } from 'next'
import { Asap } from 'next/font/google'
import NavBar from '@/components/NavBar'
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
        {/* NavBar provisoria — reemplazar por el layout F4 de Facu cuando esté */}
        <NavBar />
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
