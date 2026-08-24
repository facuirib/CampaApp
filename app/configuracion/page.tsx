import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { puede, type Op } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { Card, Icon } from '@/components/ui'

/**
 * El índice de configuración.
 *
 * Tarjetas y no un sub-sidebar: con una sección viva y tres en camino, dos
 * niveles de navegación para elegir entre cuatro cosas es andamiaje. Las
 * tarjetas escalan hasta media docena sin rediseño, y el día que sean muchas el
 * sidebar anidado se agrega SIN mover ninguna ruta.
 */

interface Seccion {
  href: string
  titulo: string
  descripcion: string
  pronto?: boolean
  /** Si la sección tiene permiso, la operación que la gobierna. */
  op?: Op
}

const SECCIONES: Seccion[] = [
  {
    href: '/configuracion/plantillas',
    titulo: 'Plantillas de mensaje',
    descripcion:
      'El texto de los reclamos que se mandan por mail y por WhatsApp. Se edita sin desplegar.',
  },
  {
    href: '/configuracion/categorias',
    titulo: 'Categorías de gasto',
    descripcion: 'Naturaleza, área y unidad de costo de cada categoría.',
    pronto: true,
  },
  {
    href: '/configuracion/cierres',
    titulo: 'Cierres de período',
    descripcion: 'Cerrar un mes para que no se escriba más sobre él.',
    pronto: true,
  },
  {
    href: '/configuracion/usuarios',
    titulo: 'Usuarios',
    descripcion: 'Quién entra al sistema y con qué permisos.',
    /** La única sección que no ve todo el mundo: reparte permisos. */
    op: 'usuario.gestionar' as const,
  },
]

export default async function ConfiguracionPage() {
  const supabase = await createClient()

  // El índice también es una puerta: una tarjeta que lleva a una pantalla que
  // el middleware va a rebotar es un link roto con otro nombre.
  const rol = await rolActual()
  const secciones = SECCIONES.filter((s) => !s.op || puede(rol, s.op))

  // Un dato en vivo por sección, para que el índice informe y no sea sólo un
  // menú. Hoy hay uno solo porque hay una sola sección construida.
  const { count } = await supabase
    .from('plantilla_mail')
    .select('*', { count: 'exact', head: true })

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Configuración</h1>
        <p className="mt-1 text-[12px] text-muted">
          Lo que se puede cambiar sin tocar código ni volver a desplegar.
        </p>
      </header>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {secciones.map((s) =>
          s.pronto ? (
            <div
              key={s.href}
              aria-disabled
              className="cursor-not-allowed rounded-md border border-line bg-white/60 px-4 py-4"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="text-[12.5px] font-extrabold text-disabled">{s.titulo}</h2>
                <span className="shrink-0 rounded-pill bg-line2 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-[.04em] text-muted">
                  pronto
                </span>
              </div>
              <p className="text-[11px] leading-snug text-disabled">{s.descripcion}</p>
            </div>
          ) : (
            <Link key={s.href} href={s.href} className="block">
              <Card className="h-full transition-colors hover:border-regale">
                <div className="mb-1 flex items-center gap-2">
                  <Icon name="documento" size={15} className="shrink-0 text-blue" />
                  <h2 className="text-[12.5px] font-extrabold text-ink">{s.titulo}</h2>
                </div>
                <p className="text-[11px] leading-snug text-muted">{s.descripcion}</p>
                <p className="mt-2 text-[10.5px] text-muted">{count ?? 0} plantillas · 1 en uso</p>
              </Card>
            </Link>
          ),
        )}
      </div>
    </div>
  )
}
