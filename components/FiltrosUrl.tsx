"use client"

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Field, Select } from '@/components/ui'

export interface FiltroUrl {
  /** Nombre del parámetro en la query string. */
  parametro: string
  label: string
  /** Texto de la opción vacía: el "sin filtrar". */
  todos: string
  opciones: { valor: string; label: string }[]
}

export interface FiltrosUrlProps {
  filtros: FiltroUrl[]
}

/**
 * Una barra de filtros que vive en la URL.
 *
 * El estado del filtro es la query string, no un `useState`: así la pantalla
 * filtrada es un link que se puede compartir y guardar, el botón "atrás" del
 * navegador hace lo que uno espera, y —lo que más importa acá— **la página
 * sigue siendo Server Component**. La consulta se rehace en el servidor con el
 * filtro ya aplicado, en vez de traer todo y esconder filas en el cliente.
 *
 * Este componente es de la familia de formulario, así que es cliente por
 * naturaleza (ver la nota de las dos familias en `components/ui`). Es lo único
 * cliente de las pantallas que lo usan.
 *
 * Navega al cambiar, sin botón de "aplicar": un `<select>` que exige confirmar
 * agrega un paso que nadie espera. `scroll: false` evita el salto al tope
 * cuando alguien filtra con la tabla ya scrolleada.
 */
export default function FiltrosUrl({ filtros }: FiltrosUrlProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function cambiar(parametro: string, valor: string) {
    const params = new URLSearchParams(searchParams)

    // Sin valor es "todos": el parámetro se va de la URL en vez de quedar
    // vacío, para que la dirección sin filtros no arrastre `?origen=`.
    if (valor) params.set(parametro, valor)
    else params.delete(parametro)

    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      {filtros.map((filtro) => (
        <Field key={filtro.parametro} label={filtro.label} className="w-[190px]">
          <Select
            placeholder={filtro.todos}
            value={searchParams.get(filtro.parametro) ?? ''}
            onChange={(e) => cambiar(filtro.parametro, e.target.value)}
          >
            {filtro.opciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      ))}
    </div>
  )
}
