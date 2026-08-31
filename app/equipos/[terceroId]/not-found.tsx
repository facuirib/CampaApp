import Link from 'next/link'

/**
 * El 404 de la cuenta corriente.
 *
 * Next resuelve el `not-found` más cercano a la ruta que lo llamó, así que un
 * equipo inexistente cae acá y no en el 404 general: el mensaje habla de
 * equipos y el link vuelve a Deudores, que es de donde venía el usuario.
 *
 * Un `not-found.tsx` no recibe props, así que no puede decir QUÉ id falló. A
 * cambio, el status HTTP es 404 de verdad: un equipo que no existe es un
 * recurso no encontrado, y eso lo tiene que decir el protocolo, no solo el
 * texto de la pantalla.
 */
export default function EquipoNoEncontrado() {
  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Equipo no encontrado</h1>
        <p className="mt-1 text-[12px] text-muted">
          Ese identificador no corresponde a ningún equipo con ficha.
        </p>
      </header>

      <div className="rounded-md border border-line bg-white px-4 py-10 text-center">
        <p className="text-[11px] text-muted">
          Puede que la dirección esté mal escrita o que el equipo ya no tenga ficha.
        </p>
        <Link
          href="/equipos"
          className="mt-3 inline-block text-[11px] font-bold text-blue-d hover:underline"
        >
          Volver a Deudores
        </Link>
      </div>
    </div>
  )
}
