"use client"

import { Suspense, use } from 'react'
import { useSearchParams } from 'next/navigation'
import FormularioCobro from './FormularioCobro'

/**
 * El flujo entero vive en `FormularioCobro.tsx` — se extrajo para que
 * `CobroRapido.tsx` (el modal del Sidebar) pueda montar exactamente el mismo
 * formulario sin duplicar `proponer_imputacion`/`registrar_cobro` en dos
 * lugares. Esta página sólo desenvuelve `terceroId` de la URL y lee
 * `?torneo=`, que viaja desde los botones "Cobrar" de `/cobranza` cuando hay
 * un torneo filtrado.
 *
 * `useSearchParams()` necesita un `<Suspense>` arriba — mismo motivo que
 * `AvisoSinPermiso` y ahora `Sidebar` en `app/layout.tsx`.
 */
function CobrarPageInner({ params }: { params: Promise<{ terceroId: string }> }) {
  const { terceroId } = use(params)
  const torneoInicial = useSearchParams().get('torneo')

  return <FormularioCobro terceroId={terceroId} torneoInicial={torneoInicial} />
}

export default function CobrarPage(props: { params: Promise<{ terceroId: string }> }) {
  return (
    <Suspense>
      <CobrarPageInner {...props} />
    </Suspense>
  )
}
