'use client'

import { useSearchParams } from 'next/navigation'

/**
 * El motivo del rebote, en la pantalla a la que se rebotó.
 *
 * El middleware manda a la pantalla padre con `?sinpermiso=…`. Sin esto el
 * usuario tipea una URL, aparece en otro lado y no sabe por qué: se lee como
 * un link roto, que es peor que un «no podés». Decir qué era lo que no puede
 * —«Crear un torneo nuevo»— también le dice a quién pedírselo.
 */
export default function AvisoSinPermiso() {
  const que = useSearchParams().get('sinpermiso')
  if (!que) return null

  return (
    <p className="mb-5 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
      <strong>{que}</strong> no está a tu alcance con tu rol, así que volviste acá. Si lo
      necesitás, pedíselo a un administrador.
    </p>
  )
}
