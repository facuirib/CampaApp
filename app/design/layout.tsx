import { notFound } from 'next/navigation'
import { rolActual } from '@/lib/rol-actual'

/**
 * El showcase del design system es herramienta de desarrollo: no está en
 * ningún menú, pero la URL quedaba abierta a cualquier rol logueado. Admin
 * solo — para el resto es un 404, como si no existiera.
 */
export default async function DesignLayout({ children }: { children: React.ReactNode }) {
  const rol = await rolActual()
  if (rol !== 'admin') notFound()
  return <>{children}</>
}
