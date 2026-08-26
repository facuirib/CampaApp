"use client"

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Field, Input, Select } from '@/components/ui'

export interface FiltroUrl {
  /** Nombre del parámetro en la query string. */
  parametro: string
  label: string
  /** Texto de la opción vacía: el "sin filtrar". */
  todos: string
  opciones: { valor: string; label: string }[]
  /**
   * Qué mostrar cuando la URL no trae el parámetro.
   *
   * Para los filtros que NO tienen un "todos" real —el año de Resultados, el
   * torneo del Tarifario— la pantalla elige un valor por defecto y muestra sus
   * datos. Sin esto, el `<select>` quedaría en la opción vacía mientras la
   * tabla de abajo muestra otra cosa: el control estaría mintiendo sobre lo
   * que se está viendo.
   *
   * No cambia la URL —sigue limpia hasta que alguien elija— sólo lo que el
   * control refleja.
   */
  valorPorDefecto?: string
}

/**
 * Un buscador de texto, opcional, en la misma barra.
 *
 * Vive acá y no en un componente aparte porque es el mismo problema: estado en
 * la URL para que la pantalla filtrada sea un link y la página siga siendo
 * Server Component. Separarlo daría dos barras que se ven igual y navegan
 * distinto.
 */
export interface BusquedaUrl {
  parametro: string
  label: string
  placeholder?: string
  /** Clase de ancho. El default —`w-[240px]`— sirve para buscar por nombre. */
  ancho?: string
}

export interface FiltrosUrlProps {
  filtros: FiltroUrl[]
  busqueda?: BusquedaUrl
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
export default function FiltrosUrl({ filtros, busqueda }: FiltrosUrlProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ── El texto se escribe acá y viaja a la URL con retraso ─────────────────
  //
  // El `<select>` navega al cambiar porque cambia una vez; el texto cambia en
  // cada tecla, y navegar por tecla serían diez consultas al servidor para
  // escribir «Barcelo». Se guarda local mientras se tipea y recién ahí va a la
  // URL, que sigue siendo la fuente de la verdad.
  const textoUrl = busqueda ? (searchParams.get(busqueda.parametro) ?? '') : ''
  const [texto, setTexto] = useState(textoUrl)

  // Si la URL cambia por afuera —el botón atrás, un link con la búsqueda
  // puesta— el campo tiene que seguirla.
  useEffect(() => setTexto(textoUrl), [textoUrl])

  useEffect(() => {
    if (!busqueda || texto === textoUrl) return
    const id = setTimeout(() => cambiar(busqueda.parametro, texto.trim()), 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

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
      {busqueda && (
        <Field label={busqueda.label} className={busqueda.ancho ?? 'w-[240px]'}>
          <Input
            value={texto}
            placeholder={busqueda.placeholder}
            onChange={(e) => setTexto(e.target.value)}
          />
        </Field>
      )}
      {filtros.map((filtro) => (
        <Field key={filtro.parametro} label={filtro.label} className="w-[190px]">
          <Select
            placeholder={filtro.todos}
            value={searchParams.get(filtro.parametro) ?? filtro.valorPorDefecto ?? ''}
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
