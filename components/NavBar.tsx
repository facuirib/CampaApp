"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/cobranza', label: 'Deudores' },
  { href: '/proyeccion', label: 'Proyección' },
  { href: '/proyeccion/mensual', label: 'Proyección mensual' },
  { href: '/catalogos/tarifario', label: 'Tarifario' },
]

export default function NavBar() {
  const pathname = usePathname()

  // La sección activa es la de href más específico que matchea la ruta actual,
  // para que /cobranza/[id] resalte "Deudores" sin pisar /proyeccion/mensual.
  const activoHref = LINKS.map((l) => l.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0]

  return (
    <nav className="bg-gray-50 border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-6 h-14">
        <span className="font-bold text-gray-900">CAMPA</span>

        <div className="flex items-center gap-4 text-sm">
          {LINKS.map((link) => {
            const activo = link.href === activoHref

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`py-2 ${
                  activo
                    ? 'font-semibold text-gray-900 border-b-2 border-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}