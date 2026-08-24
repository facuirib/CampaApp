"use client"

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ROL_LABEL, type Rol } from '@/lib/roles'
import { createClient } from '@/lib/db/client'
import { Icon, type NombreIcono } from '@/components/ui'

export interface ItemNav {
  href: string
  label: string
  icon: NombreIcono
  /**
   * Sub-secciones. Con esto el ítem deja de ser un link y pasa a desplegar.
   *
   * Es el primer nivel anidado de la nav, y por eso se modela acá y no dentro
   * de Configuración: el día que Catálogos o Societario necesiten sub-items,
   * ya existe el patrón.
   */
  hijos?: SubItemNav[]
}

export interface SubItemNav {
  href: string
  label: string
  /**
   * Una sección planeada que todavía no existe.
   *
   * Se muestra en gris y NO navega. Es a propósito: anunciar lo que viene
   * ubica al que busca —«acá va a estar»— sin mandarlo a un 404. Cuando la
   * pantalla exista, se saca esta bandera y nada más.
   */
  pronto?: boolean
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
    // En el orden en que pasan las cosas: se anota el equipo, se arma el
    // fixture, se le cobra, y al que no paga se le reclama. Después, los dos
    // que NO son un paso sino el molde del que sale todo lo anterior: el
    // tarifario y el torneo mismo.
    //
    // Torneos va último aunque sea lo primero que existe, por frecuencia: se
    // crea un torneo dos veces al año, y se cobra todos los días. Ponerlo
    // arriba empujaría lo cotidiano hacia abajo para hacerle lugar a algo que
    // se toca dos veces por temporada.
    //
    // Cuando lleguen los pasos 2 y 3 del módulo de estructura —categorías y
    // series, y el tarifario editable— cuelgan de acá como hijos de Torneos.
    titulo: 'Torneo',
    items: [
      { href: '/inscripciones', label: 'Inscripciones', icon: 'inscripciones' },
      { href: '/calendario', label: 'Calendario', icon: 'calendario' },
      { href: '/cobranza', label: 'Cobranza', icon: 'cobranza' },
      { href: '/reclamos', label: 'Reclamos', icon: 'reclamos' },
      { href: '/catalogos/tarifario', label: 'Tarifario', icon: 'tarifario' },
      { href: '/torneos', label: 'Torneos', icon: 'equipos' },
    ],
  },
  {
    // De lo más líquido a lo menos: el efectivo y su arqueo, después los
    // valores que todavía no son plata (cheques), y al final los bienes.
    //
    // Bar va acá y no en un grupo propio, aunque el bar SEA un dominio aparte
    // —área propia en cat_gasto, encargado propio, y un futuro de productos y
    // stock que no se parece a nada de esto—. Dos razones, las dos de hoy y no
    // de siempre: un grupo de un solo ítem se lee como algo a medio hacer, y lo
    // que el bar tiene hoy es exactamente una pantalla. Y lo que esa pantalla
    // hace —cerrar la caja de un día— es lo mismo que hace Arqueo dos líneas
    // más arriba: por eso va pegado, no al final.
    //
    // Cuando el bar sume productos, stock o su propio arqueo, se muda a grupo
    // propio: el árbol ya modela `hijos`, así que es mover un objeto de lugar.
    titulo: 'Operación',
    items: [
      { href: '/gastos', label: 'Gastos', icon: 'comprobante' },
      { href: '/caja', label: 'Caja', icon: 'caja' },
      { href: '/arqueo', label: 'Arqueo', icon: 'arqueo' },
      { href: '/bar', label: 'Bar', icon: 'bar' },
      { href: '/cheques', label: 'Cheques', icon: 'banco' },
      { href: '/activos', label: 'Activos', icon: 'activos' },
    ],
  },
  {
    // Lo que va a pasar primero, lo que pasó después: la proyección y el
    // calendario miran adelante; resultados y movimientos, atrás.
    titulo: 'Finanzas',
    items: [
      // Presupuesto va PRIMERO porque es lo que alimenta a Proyección: se
      // planea, se proyecta, y recién después se mira lo que pasó.
      { href: '/presupuesto', label: 'Presupuesto', icon: 'monedas' },
      { href: '/proyeccion', label: 'Proyección', icon: 'proyeccion' },
      { href: '/calendario-pagos', label: 'Calendario de pagos', icon: 'reloj' },
      { href: '/resultados', label: 'Resultados', icon: 'resultados' },
      { href: '/movimientos', label: 'Movimientos', icon: 'movimientos' },
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
  {
    titulo: 'Sistema',
    items: [
      // Auditoría estaba en Finanzas y no es plata: es quién tocó qué. Lo que
      // audita son movimientos, sí, pero también altas de equipo, cambios de
      // tarifario y ediciones de plantilla. Es del sistema.
      { href: '/auditoria', label: 'Auditoría', icon: 'auditoria' },
      {
        href: '/configuracion',
        label: 'Configuración',
        icon: 'configuracion',
        hijos: [
          { href: '/configuracion/plantillas', label: 'Plantillas' },
          { href: '/configuracion/categorias', label: 'Categorías de gasto', pronto: true },
          { href: '/configuracion/cierres', label: 'Cierres de período', pronto: true },
          { href: '/configuracion/usuarios', label: 'Usuarios' },
        ],
      },
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
    // Los hijos entran en la comparación: estando en /configuracion/plantillas,
    // el que gana por más largo es el hijo, no el padre.
    .flatMap((g) => g.items.flatMap((i) => [i.href, ...(i.hijos ?? []).map((h) => h.href)]))
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

export interface SidebarProps {
  /** El email de quien está adentro. Sin sesión no se renderiza el sidebar. */
  email?: string | null
  /**
   * Su rol, leído del JWT en el layout.
   *
   * Por ahora solo se MUESTRA, en el pie junto al email: saber con qué permisos
   * estás mirando la pantalla evita el desconcierto de que un botón no haga
   * nada. Filtrar los ítems del menú por rol es la fase de front — se hace de
   * una vez con la regla final, no en dos pasadas con reglas parciales.
   */
  rol?: Rol | null
}

/**
 * El pie: quién está adentro y cómo salir.
 *
 * El email va arriba del botón y no adentro: con cinco personas compartiendo
 * pantallas, saber con qué usuario se está escribiendo importa antes de
 * apretar nada — el asiento que se genere va a quedar con ese id.
 */
function PieSesion({ email, rol }: { email: string; rol?: Rol | null }) {
  const [saliendo, setSaliendo] = useState(false)

  async function salir() {
    setSaliendo(true)
    await createClient().auth.signOut()
    // Navegación dura, por lo mismo que en el login: el layout raíz tiene que
    // volver a evaluarse sin sesión para desmontar el sidebar.
    window.location.assign('/login')
  }

  return (
    <div className="mt-auto border-t border-line px-4 py-3">
      <p className="truncate text-[10px] text-muted" title={email}>
        {email}
        {rol && <span className="ml-1 text-muted/70">· {ROL_LABEL[rol]}</span>}
      </p>
      <button
        type="button"
        onClick={salir}
        disabled={saliendo}
        className="mt-1 text-[11px] font-bold text-blue-d hover:underline disabled:text-disabled"
      >
        {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
      </button>
    </div>
  )
}

export default function Sidebar({ email, rol }: SidebarProps) {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)
  const itemActivo = useRef<HTMLLIElement | null>(null)

  const activo = hrefActivo(pathname)

  // Traer a la vista el ítem de la pantalla en la que estás.
  //
  // La lista no entra entera en una laptop, así que estando en las últimas
  // secciones —Configuración, por ejemplo— la nav cargaba mostrando el
  // principio y el ítem activo quedaba abajo, fuera de cuadro: la barra no
  // decía dónde estás, que es lo único que tiene que hacer.
  //
  // `block: 'nearest'` mueve lo mínimo indispensable: si el ítem ya se ve, no
  // toca nada. Y `scrollIntoView` acá sólo mueve el contenedor que scrollea
  // —el <nav>—, no la página.
  useEffect(() => {
    itemActivo.current?.scrollIntoView({ block: 'nearest' })
  }, [activo])

  // /design/mobile se embebe en un iframe angosto dentro de /design para
  // mostrar el colapso a cards del DataTable. Ahí la navegación es ruido.
  //
  // Va DESPUÉS de los hooks: un `return` temprano antes de un `useEffect` los
  // dejaría corriendo en distinto orden según la ruta, que es exactamente lo
  // que las reglas de hooks prohíben.
  if (pathname.startsWith('/design/mobile')) return null

  return (
    <aside
      className={[
        'bg-white',
        // Mobile: una franja arriba, en el flujo. Desktop: columna fija de
        // 256px que no scrollea con el contenido.
        'border-b border-line',
        // El que scrollea es la lista, no el sidebar: ver el <nav> de abajo.
        'md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-hidden',
        'md:border-b-0 md:border-r',
        // Columna flex para que el pie de sesión caiga abajo con `mt-auto`.
        'md:flex md:flex-col',
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

      {/* La zona que scrollea es ESTA, no el <aside>.
          Con veinte ítems la nav no entra en una laptop de 900px, y si
          scrolleara el sidebar entero el pie de sesión —o sea "Cerrar
          sesión"— quedaría abajo de todo, invisible hasta que alguien
          scrollee la barra lateral, que es lo último que se le ocurre a
          nadie. Acá el pie queda fijo y se mueve sólo la lista.
          `min-h-0` es lo que le permite encogerse: sin eso, un hijo de flex
          no baja de su alto de contenido y el overflow no llega a activarse. */}
      <nav
        className={`${abierto ? 'block' : 'hidden'} px-2 pb-4 md:block md:min-h-0 md:flex-1 md:overflow-y-auto`}
      >
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
                // Un padre con hijos se marca cuando la ruta cae en cualquiera
                // de ellos: al estar en Plantillas, Configuración sigue activa.
                const enLaRama = esActivo || (item.hijos ?? []).some((h) => h.href === activo)

                return (
                  <li key={item.href} ref={enLaRama ? itemActivo : undefined}>
                    <Link
                      href={item.href}
                      aria-current={esActivo ? 'page' : undefined}
                      onClick={() => setAbierto(false)}
                      className={[
                        'flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[12.5px]',
                        'transition-colors',
                        enLaRama
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
                        className={enLaRama ? 'shrink-0 text-blue' : 'shrink-0 text-muted'}
                      />
                      {item.label}
                    </Link>

                    {/* Las sub-secciones se muestran SIEMPRE, no al hacer clic.
                        Con cuatro ítems y uno solo activo, un desplegable que
                        haya que abrir esconde justamente lo que se está
                        buscando. El sangrado y la línea alcanzan para que se
                        lean como dependientes. */}
                    {item.hijos && (
                      <ul className="ml-[26px] mt-0.5 grid gap-0.5 border-l border-line pl-2">
                        {item.hijos.map((hijo) =>
                          hijo.pronto ? (
                            <li
                              key={hijo.href}
                              // No es un link: no navega, no recibe foco y el
                              // cursor lo dice. Mandar a un 404 sería peor que
                              // no mostrarlo.
                              //
                              // Sin `aria-disabled`: no hay nada que
                              // deshabilitar —un <li> no es interactivo— y el
                              // atributo no aplica a ese rol. Quien lee con
                              // lector de pantalla se entera por la etiqueta
                              // "pronto", que es texto de verdad.
                              className="flex cursor-not-allowed items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-[11.5px] text-disabled"
                            >
                              {hijo.label}
                              <span className="shrink-0 rounded-pill bg-line2 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-[.04em] text-muted">
                                pronto
                              </span>
                            </li>
                          ) : (
                            <li key={hijo.href}>
                              <Link
                                href={hijo.href}
                                aria-current={hijo.href === activo ? 'page' : undefined}
                                onClick={() => setAbierto(false)}
                                className={[
                                  'block rounded-sm px-2.5 py-1.5 text-[11.5px] transition-colors',
                                  hijo.href === activo
                                    ? 'font-bold text-blue-d'
                                    : 'font-semibold text-ink/70 hover:bg-row-hover hover:text-ink',
                                ].join(' ')}
                              >
                                {hijo.label}
                              </Link>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Sólo con sesión: el sidebar no se muestra en /login, pero si algún día
          se renderizara sin usuario, no tiene que inventar un pie vacío. */}
      {email && <PieSesion email={email} rol={rol} />}
    </aside>
  )
}
