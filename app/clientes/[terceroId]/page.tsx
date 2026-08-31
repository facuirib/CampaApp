import { redirect } from 'next/navigation'

/**
 * La ficha del cliente se fundió con la del equipo, en `/equipos/[id]`.
 *
 * Eran dos fichas del mismo equipo sin un link entre ellas: acá los datos
 * fiscales, allá la deuda. Ahora son una pestaña de la misma.
 */
export default async function ClienteFichaRedirect({
  params,
}: {
  params: Promise<{ terceroId: string }>
}) {
  const { terceroId } = await params
  redirect(`/equipos/${terceroId}?tab=datos`)
}
