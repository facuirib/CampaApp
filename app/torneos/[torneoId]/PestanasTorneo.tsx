import Link from 'next/link'

/**
 * La barra de pestañas del torneo, compartida por las cuatro pantallas.
 *
 * Vive en un componente y no repetida en cada página porque el orden de las
 * pestañas ES el orden del flujo —estructura, equipos, tarifario, calendario—
 * y si cada pantalla lo escribiera por su cuenta, alcanzaría con que una se
 * desordene para que el operador crea que el flujo es otro.
 *
 * No mueve archivos: Estructura y Equipos siguen en sus rutas, que ya
 * funcionaban. Lo que faltaba era la puerta de entrada y saber en cuál de las
 * cuatro está uno parado.
 */
export type PestanaTorneo = 'resumen' | 'estructura' | 'equipos' | 'calendario'

const PESTANAS: { id: PestanaTorneo; label: string; ruta: (id: string) => string }[] = [
  { id: 'resumen', label: 'Resumen', ruta: (id) => `/torneos/${id}` },
  { id: 'estructura', label: 'Estructura', ruta: (id) => `/torneos/${id}/estructura` },
  { id: 'equipos', label: 'Equipos', ruta: (id) => `/torneos/${id}/fichas` },
  // El calendario es del torneo, aunque su pantalla viva en /calendario: se
  // entra ya filtrado. Duplicarla acá sería tener dos editores de lo mismo.
  { id: 'calendario', label: 'Calendario', ruta: (id) => `/calendario?torneo=${id}` },
]

export default function PestanasTorneo({
  activa,
  torneoId,
}: {
  activa: PestanaTorneo
  torneoId: string
}) {
  return (
    <div className="mb-5 inline-flex gap-1 rounded-md bg-line2 p-1" role="tablist">
      {PESTANAS.map((p) => {
        const esActiva = p.id === activa
        return (
          <Link
            key={p.id}
            href={p.ruta(torneoId)}
            role="tab"
            aria-selected={esActiva}
            className={[
              'rounded-sm px-3 py-1 text-[11px] font-bold transition-colors',
              esActiva ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {p.label}
          </Link>
        )
      })}
    </div>
  )
}
