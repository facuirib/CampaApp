/**
 * El esqueleto de carga de una página: título, bajada, tarjetas y tabla,
 * en gris pulsante — la silueta del layout real, no un spinner.
 *
 * UNA pieza para todos los `loading.tsx` (la convención del vocabulario
 * único, aplicada al esqueleto): cada ruta pesada lo monta con su cantidad
 * de tarjetas y filas, y el look se corrige en un solo lugar. Server
 * Component puro — cero JavaScript al cliente.
 *
 * Por qué existe: sin `loading.tsx`, App Router deja la página VIEJA
 * congelada hasta que la nueva termina todas sus queries — con la base
 * lejos, eso era hasta un segundo mirando una pantalla que no reacciona.
 * Con esto, la transición pinta al instante y los datos llegan después.
 */

/** Anchos que rotan para que la "tabla" no parezca una escalera perfecta. */
const ANCHOS = ['w-full', 'w-11/12', 'w-4/5', 'w-11/12', 'w-3/4', 'w-full', 'w-5/6', 'w-2/3']

export default function EsqueletoPagina({
  kpis = 0,
  filas = 8,
}: {
  /** Cuántas tarjetas de KPI dibuja arriba (0 = ninguna). */
  kpis?: number
  /** Cuántas filas de "tabla" dibuja abajo. */
  filas?: number
}) {
  return (
    <div className="animate-pulse pb-10" aria-busy="true" aria-label="Cargando…">
      <div className="mb-3 mt-0.5 h-6 w-48 rounded-sm bg-line2" />
      <div className="mb-6 h-3 w-80 max-w-full rounded-sm bg-line2" />

      {kpis > 0 && (
        <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} className="rounded-md border border-line bg-white p-4">
              <div className="h-2.5 w-20 rounded-sm bg-line2" />
              <div className="mt-3 h-5 w-28 rounded-sm bg-line2" />
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border border-line bg-white p-4">
        {Array.from({ length: filas }).map((_, i) => (
          <div key={i} className={`h-3.5 rounded-sm bg-line2 ${ANCHOS[i % ANCHOS.length]} ${i > 0 ? 'mt-4' : ''}`} />
        ))}
      </div>
    </div>
  )
}
