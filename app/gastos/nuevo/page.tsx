import FormularioGasto from './FormularioGasto'

/**
 * Cargar un gasto.
 *
 * El formulario vive en su propio componente desde que la carga de costos de
 * bar se mudó a `/bar/costo`: es la MISMA pantalla con el catálogo acotado a un
 * área, y duplicar 578 líneas para eso habría garantizado que las dos copias se
 * separen en la primera corrección.
 *
 * Acá va sin `soloArea`, así que ofrece torneo, predio y administración — pero
 * NO bar: los costos del bar se cargan en /bar/costo. Dos puertas para lo mismo
 * terminan en dos costumbres distintas y en nadie sabiendo cuál es la buena.
 */
export default function CargarGastoPage() {
  return (
    <FormularioGasto bajada="Se reconoce al cargar (devengo). El pago es un paso aparte. Los costos del bar se cargan en Bar." />
  )
}
