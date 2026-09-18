import { redirect } from 'next/navigation'

/**
 * El detalle de un período dejó de ser una ruta propia: ahora es un
 * desplegable dentro de la fila, en `/proyeccion`. Era la misma consulta
 * (`v_cashflow_real` + `v_cashflow_comprometido` + `v_cashflow_estimado`,
 * filtradas por fecha) que ahora vive en `DetalleSemana.tsx`, cargada
 * on-demand al abrir la fila en vez de en su propia navegación.
 *
 * Queda el redirect y no un 404 por lo mismo que en `/reclamos`, `/clientes`,
 * etc.: puede haber un link viejo guardado, y `?abrir=<periodo>` hace que la
 * fila correspondiente se despliegue sola y se scrollee a la vista — el
 * mismo destino al que llevaba esta ruta, con otra forma.
 */
export default async function ProyeccionPeriodoRedirect({
  params,
}: {
  params: Promise<{ periodo: string }>
}) {
  const { periodo } = await params
  redirect(`/proyeccion?abrir=${periodo}`)
}
