'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type NombreIcono } from '@/components/ui'

export interface ItemNav {
  href: string
  label: string
  icon: NombreIcono
}

export interface GrupoNav {
  /** `null` en el primer grupo: "Inicio" no necesita encabezado. */
  titulo: string | null
  items: ItemNav[]
}

/**
 * El árbol de navegación, exportado.
 *
 * Vive acá y no adentro del componente para que el rail colapsable y la barra
 * inferior de mobile —las dos mejoras que vienen después— lo reusen en vez de
 * mantener su propia copia. Agregar una pantalla debería ser una línea acá y
 * nada más.
 */
export const GRUPOS: GrupoNav[] = [
  {
    titulo: null,
    items: [{ href: '/', label: 'Inicio', icon: 'inicio' }],
  },
  {
    titulo: 'Torneo',
    items: [
      { href: '/cobranza', label: 'Cobranza', icon: 'cobranza' },
      { href: '/catalogos/tarifario', label: 'Tarifario', icon: 'tarifario' },
    ],
  },
  {
    titulo: 'Operación',
    items: [
      { href: '/gastos', label: 'Gastos', icon: 'comprobante' },
      { href: '/arqueo', label: 'Arqueo', icon: 'arqueo' },
    ],
  },
  {
    titulo: 'Finanzas',
    items: [
      { href: '/proyeccion', label: 'Proyección', icon: 'proyeccion' },
      { href: '/resultados', label: 'Resultados', icon: 'resultados' },
      { href: '/movimientos', label: 'Movimientos', icon: 'movimientos' },
      { href: '/auditoria', label: 'Auditoría', icon: 'auditoria' },
    ],
  },
  {
    titulo: 'Societario',
    items: [
      { href: '/socios', label: 'Socios', icon: 'socios' },
      { href: '/sponsors', label: 'Sponsors', icon: 'sponsors' },
      { href: '/usd', label: 'USD', icon: 'usd' },
    ],
  },
]

/**
 * Cuál de los ítems corresponde a la ruta actual.
 *
 * Gana el href MÁS LARGO que matchea, y por eso `/cobranza/abc123` marca
 * Cobranza sin que `/` se lo dispute: `/` matchea todo, así que si ganara el
 * primero, Inicio quedaría activo en cada pantalla.
 */
export function hrefActivo(pathname: string, grupos: GrupoNav[] = GRUPOS): string | null {
  const candidatos = grupos
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((href) =>
      href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`),
    )
    .sort((a, b) => b.length - a.length)

  return candidatos[0] ?? null
}

function Lockup() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image
        src="/brand/campa-isologo-navy.png"
        alt=""
        width={34}
        height={34}
        className="shrink-0"
        priority
      />
      <span className="min-w-0">
        <span className="block text-[15px] font-extrabold leading-none tracking-[.4px] text-ink">
          CAMPA
        </span>
        <span className="mt-1 block truncate text-[8.5px] uppercase tracking-[.06em] text-muted">
          Gestión administrativa
        </span>
      </span>
    </Link>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)

  // /design/mobile se embebe en un iframe angosto dentro de /design para
  // mostrar el colapso a cards del DataTable. Ahí la navegación es ruido.
  if (pathname.startsWith('/design/mobile')) return null

  const activo = hrefActivo(pathname)

  return (
    <aside
      className={[
        'bg-white',
        // Mobile: una franja arriba, en el flujo. Desktop: columna fija de
        // 256px que no scrollea con el contenido.
        'border-b border-line',
        'md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto',
        'md:border-b-0 md:border-r',
      ].join(' ')}
    >
      <div className="flex items-center justify-between px-4 py-3.5 md:py-5">
        <Lockup />
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-label={abierto ? 'Cerrar navegación' : 'Abrir navegación'}
          className="rounded-sm p-1.5 text-muted hover:bg-row-hover hover:text-ink md:hidden"
        >
          <Icon name={abierto ? 'cerrar' : 'chevronAbajo'} size={18} />
        </button>
      </div>

      <nav className={`${abierto ? 'block' : 'hidden'} px-2 pb-4 md:block`}>
        {GRUPOS.map((grupo, i) => (
          <div key={grupo.titulo ?? 'inicio'} className={i > 0 ? 'mt-4' : ''}>
            {grupo.titulo && (
              <h2 className="px-2.5 pb-1.5 text-[8.5px] font-bold uppercase tracking-[.07em] text-muted">
                {grupo.titulo}
              </h2>
            )}

            <ul className="grid gap-0.5">
              {grupo.items.map((item) => {
                const esActivo = item.href === activo
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={esActivo ? 'page' : undefined}
                      onClick={() => setAbierto(false)}
                      className={[
                        'flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[12.5px]',
                        'transition-colors',
                        esActivo
                          ? 'bg-blue-tint font-bold text-blue-d'
                          : // El inactivo va en --ink a 80%, no en gris lavado:
                            // la mejora de la decisión 7a era justamente que se
                            // leyeran bien.
                            'font-semibold text-ink/80 hover:bg-row-hover hover:text-ink',
                      ].join(' ')}
                    >
                      <Icon
                        name={item.icon}
                        size={16}
                        className={esActivo ? 'shrink-0 text-blue' : 'shrink-0 text-muted'}
                      />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
