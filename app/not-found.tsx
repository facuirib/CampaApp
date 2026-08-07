import Link from 'next/link'

/**
 * El 404 de toda la app.
 *
 * Reemplaza el default de Next, que es una franja negra sin relación con nada
 * del sistema. Se renderiza dentro del layout, así que el sidebar sigue ahí y
 * la pantalla no se siente como una salida de la aplicación.
 */
export default function NotFound() {
  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Página no encontrada</h1>
        <p className="mt-1 text-[12px] text-muted">
          La dirección no corresponde a ninguna pantalla.
        </p>
      </header>

      <div className="rounded-md border border-line bg-white px-4 py-10 text-center">
        <p className="text-[11px] text-muted">
          Puede que el enlace esté mal escrito o que la pantalla ya no exista.
        </p>
        <Link
          href="/"
          className="mt-3 inline-block text-[11px] font-bold text-blue-d hover:underline"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
