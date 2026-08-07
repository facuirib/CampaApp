"use client"

import { createContext, useContext, useId } from 'react'

interface ContextoCampo {
  id: string
  invalido: boolean
  /** Id del mensaje de error o de ayuda, si hay alguno. */
  describedBy?: string
}

const CampoCtx = createContext<ContextoCampo | null>(null)

/** Lo consumen Input y Select para heredar el id y el estado del campo. */
export function useCampo() {
  return useContext(CampoCtx)
}

export interface FieldProps {
  label: React.ReactNode
  /** Si viene, el control se marca y el mensaje aparece debajo. */
  error?: string | null
  /** Ayuda breve. La reemplaza el error cuando hay error. */
  hint?: React.ReactNode
  required?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * La envoltura de un campo: label arriba, control en el medio, mensaje abajo.
 *
 * Envuelve al control en vez de renderizarlo, y esa es la decisión de forma
 * que sostiene todo lo demás:
 *
 *   · el control conserva su superficie nativa de props, así que vestir un
 *     campo existente es cambiar `<input>` por `<Input>` y nada más — los
 *     `value` y `onChange` que ya estaban siguen siendo los mismos;
 *   · un control nuevo —un textarea, un combobox, un monto con sufijo— no
 *     obliga a tocar Field, porque Field no sabe qué tiene adentro.
 *
 * El `id` lo genera Field y lo comparte por contexto, así que la asociación
 * label ↔ control es el DEFAULT y no algo que alguien tenga que acordarse de
 * escribir. Un `id` explícito en el control siempre gana.
 *
 * El label tiene alto fijo de una línea: es lo que hace que una fila de campos
 * alinee por arriba y por abajo aunque los rótulos midan distinto. Un campo con
 * error crece hacia abajo, sin descolgar a los vecinos.
 */
export default function Field({
  label,
  error,
  hint,
  required = false,
  className,
  children,
}: FieldProps) {
  const id = useId()
  const mensajeId = `${id}-msg`
  const hayMensaje = Boolean(error) || Boolean(hint)

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block h-4 truncate text-[9px] font-bold uppercase leading-4 tracking-[.06em] text-muted"
      >
        {label}
        {required && (
          <span className="text-err" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>

      <CampoCtx.Provider
        value={{ id, invalido: Boolean(error), describedBy: hayMensaje ? mensajeId : undefined }}
      >
        {children}
      </CampoCtx.Provider>

      {error ? (
        <p id={mensajeId} className="mt-1 text-[9.5px] leading-snug text-errtx">
          {error}
        </p>
      ) : hint ? (
        <p id={mensajeId} className="mt-1 text-[9.5px] leading-snug text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
