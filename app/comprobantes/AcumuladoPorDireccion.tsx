import { createClient } from '@/lib/db/server'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { DataTable, type ColumnDef } from '@/components/ui'
import { formatMoneyExacto } from '@/lib/format'

/**
 * Lo facturado por mes y por dirección: la BASE para Comercio e Industria.
 *
 * C&I es un impuesto municipal que se paga según DÓNDE se factura, y el
 * domicilio del punto de venta es lo que lo determina. Esto da la base; **no
 * calcula el impuesto** — eso llega cuando se trabajen impuestos, y calcularlo
 * acá sería inventar una alícuota que nadie definió.
 *
 * ── Por qué va abajo de la lista y no en una pestaña ──────────────────────
 *
 * Una pestaña esconde la mitad del contenido y hace que nadie descubra la
 * segunda. Y el acumulado es corto —una fila por mes y dirección—, así que no
 * compite por espacio con la lista.
 *
 * ── Lo que la vista deja afuera, y por qué importa ────────────────────────
 *
 * `v_facturado_por_direccion` toma sólo `estado = 'emitida'` y las notas de
 * crédito le restan. Las dos cosas salvan la base de inflarse en silencio: una
 * pendiente reservó un número que ARCA nunca autorizó, y una nota de crédito
 * corrige hacia abajo. Sumarlas daría una base más grande que la real, del lado
 * que se paga.
 */

interface Fila {
  clave: string
  periodo: string
  direccion: React.ReactNode
  cantidad: number
  neto: string
  iva: string
  total: string
}

const COLUMNAS: ColumnDef<Fila>[] = [
  { key: 'periodo', label: 'Período', width: 110 },
  { key: 'direccion', label: 'Dirección de emisión' },
  { key: 'cantidad', label: 'Comprobantes', align: 'right', width: 120 },
  { key: 'neto', label: 'Neto', align: 'right', width: 130 },
  { key: 'iva', label: 'IVA', align: 'right', width: 130 },
  { key: 'total', label: 'Total', align: 'right', width: 140 },
]

export default async function AcumuladoPorDireccion({ anio }: { anio?: string }) {
  const supabase = await createClient()

  let query = supabase
    .from('v_facturado_por_direccion')
    .select('*')
    .order('periodo', { ascending: false })
    .order('punto_venta')
  if (anio) query = query.eq('anio', Number(anio))

  const [{ data: filas }, { data: anios }] = await Promise.all([
    query,
    supabase.from('v_facturado_por_direccion').select('anio'),
  ])

  const opcionesAnio = [...new Set((anios ?? []).map((a) => a.anio))].sort().reverse()

  const filtro: FiltroUrl[] = [
    {
      parametro: 'anio',
      label: 'Año',
      todos: 'Todos',
      // Sólo el año: los meses YA son las filas, así que filtrar por mes dejaría
      // una sola fila y no informaría nada.
      opciones: (opcionesAnio as number[]).map((a) => ({ valor: String(a), label: String(a) })),
    },
  ]

  const rows: Fila[] = (filas ?? []).map((f) => ({
    clave: `${f.periodo}-${f.punto_venta}`,
    periodo: f.periodo!,
    direccion: f.domicilio ? (
      <span>
        {f.domicilio}
        <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">
          {f.punto_nombre}
        </span>
      </span>
    ) : (
      // La #407 sale acá: su punto 200 no está en la configuración. Se muestra
      // rotulada en vez de filtrarla — un comprobante que desaparece del
      // acumulado sin dejar rastro es peor que uno que aparece sin dirección.
      <span className="text-muted">
        Sin dirección configurada · punto {f.punto_venta} · no suma a C&amp;I
      </span>
    ),
    cantidad: f.cantidad!,
    neto: formatMoneyExacto(Number(f.neto)),
    iva: formatMoneyExacto(Number(f.iva)),
    total: formatMoneyExacto(Number(f.total)),
  }))

  return (
    <section className="space-y-3 border-t border-line pt-6">
      <div>
        <h2 className="text-[15px] font-extrabold text-ink">Facturado por dirección</h2>
        <p className="mt-1 max-w-[74ch] text-[11.5px] leading-snug text-muted">
          Base para <strong className="font-semibold">Comercio e Industria</strong>, el impuesto
          municipal que se paga según dónde se factura. Cuenta sólo las facturas{' '}
          <strong className="font-semibold">emitidas</strong> —las pendientes y las que ARCA rechazó
          no existen fiscalmente— y las notas de crédito restan.{' '}
          <strong className="font-semibold">No calcula el impuesto</strong>: da la base sobre la que
          se lo calcula.
        </p>
      </div>

      {opcionesAnio.length > 1 && <FiltrosUrl filtros={filtro} />}

      <DataTable
        columns={COLUMNAS}
        rows={rows}
        rowKey="clave"
        densidad="compacta"
        emptyMessage="Todavía no hay facturas emitidas."
      />
    </section>
  )
}
