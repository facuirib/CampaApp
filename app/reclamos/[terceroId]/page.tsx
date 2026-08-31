import { redirect } from 'next/navigation'

/** El detalle del equipo ahora es uno solo: la ficha de cobranza. */
export default async function ReclamoEquipoRedirect({
  params,
}: {
  params: Promise<{ terceroId: string }>
}) {
  const { terceroId } = await params
  redirect(`/equipos/${terceroId}`)
}
