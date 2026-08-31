import { redirect } from 'next/navigation'

/**
 * La ficha del equipo se mudó a `/equipos/[terceroId]`.
 *
 * Vivía acá porque la cobranza fue lo primero que la necesitó, y llegó a
 * llamarse a sí misma «la ficha del equipo» en su propio subtítulo. Pero la
 * cobranza es UNA LENTE sobre el equipo, no su casa: bajo esta URL había que
 * explicar por qué los datos fiscales y el historial de torneos viven en
 * «cobranza».
 *
 * `/cobranza` —las colas— se queda donde está: es un worklist («a quién hay
 * que reclamar hoy»), que es otra cosa que una ficha.
 */
export default async function CobranzaFichaRedirect({
  params,
}: {
  params: Promise<{ terceroId: string }>
}) {
  const { terceroId } = await params
  redirect(`/equipos/${terceroId}`)
}
