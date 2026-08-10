import { redirect } from 'next/navigation'

/**
 * La proyección mensual dejó de ser una ruta propia: es una pestaña de
 * `/proyeccion`, porque son la misma pregunta a dos granularidades y compartían
 * encabezado, KpiCards y gráfico.
 *
 * Esta ruta queda como redirección y no se borra: puede estar guardada en un
 * favorito o pegada en un chat, y un 404 ahí sería una regresión para alguien
 * que la venía usando. El `redirect` es permanente porque el destino es estable.
 */
export default function ProyeccionMensualPage() {
  redirect('/proyeccion?vista=mensual')
}
