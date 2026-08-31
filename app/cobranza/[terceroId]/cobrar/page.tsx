import { redirect } from 'next/navigation'

/** Se mudó con la ficha, a `/equipos/[terceroId]/cobrar`. */
export default async function CobrarRedirect({
  params,
}: {
  params: Promise<{ terceroId: string }>
}) {
  const { terceroId } = await params
  redirect(`/equipos/${terceroId}/cobrar`)
}
