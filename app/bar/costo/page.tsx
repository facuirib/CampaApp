import FormularioGasto from '@/app/gastos/nuevo/FormularioGasto'

/**
 * Cargar un costo del bar, sin salir de Bar.
 *
 * ── Por qué se mudó ───────────────────────────────────────────────────────
 *
 * Los costos del bar se cargaban en Gastos, mezclados con los del torneo, el
 * predio y administración. Eso partía el circuito del bar en dos pantallas: las
 * ventas acá, lo que costó producirlas allá — y para saber si el bar gana plata
 * había que sumar de memoria entre dos lugares.
 *
 * ── Lo que NO cambió ──────────────────────────────────────────────────────
 *
 * **El modelo, nada.** Un costo de bar sigue siendo un `gasto` con una
 * `cat_gasto` de `area = 'bar'`, con su devengo y su pago como cualquier otro.
 * Sacarlo de `cat_gasto` habría roto el P&L, el presupuesto y el trigger
 * `check_gasto_coherente` a cambio de nada: lo que estaba mal era dónde se
 * cargaba, no qué es.
 *
 * Por eso es la MISMA pantalla —el mismo componente, la misma función de la
 * base— con el catálogo acotado a `bar`. Y acotarlo no es cosmética:
 * «Limpieza» existe en predio y en bar y se clasifican distinto, así que
 * ofrecer las cuatro áreas desde acá invita a elegir la equivocada.
 */
export default function CargarCostoBarPage() {
  return (
    <FormularioGasto
      soloArea="bar"
      titulo="Cargar costo del bar"
      bajada="Se reconoce al cargar (devengo). El pago es un paso aparte, en Gastos."
      volverA={{ href: '/bar', label: '← Volver a bar' }}
    />
  )
}
