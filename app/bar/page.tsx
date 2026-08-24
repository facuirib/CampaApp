import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { formatDate } from '@/lib/format'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { Button, DataTable, Money, type ColumnDef } from '@/components/ui'
import AnularCierre from './AnularCierre'

export const dynamic = 'force-dynamic'

interface FilaCierre {
  venta_bar_id: string
  dia: string
  predio: string
  efectivo: React.ReactNode
  tarjeta: React.ReactNode
  mp: React.ReactNode
  total: React.ReactNode
  estado: { estado: 'ok' | 'neutro'; label: string }
  acciones: React.ReactNode
}

/**
 * Los cierres de bar.
 *
 * Server Component: la lista sale entera del servidor y no manda JavaScript
 * propio. Lo único que cruza al cliente es <AnularCierre>, una isla por fila.
 *
 * Todos los números salen de `v_venta_bar` — incluido el total de cada cierre,
 * que es la columna generada de la tabla. Acá no se suma nada.
 *
 * ── Los botones, por rol ───────────────────────────────────────────────────
 *
 * El permiso se resuelve **acá, en el servidor, antes de renderizar**, y sale
 * de `puede()` sobre el mapa — no de una condición escrita a mano en la
 * pantalla, que se desincronizaría de las policies sin que nadie lo note.
 *
 * Y se decide antes por una razón concreta: **no se puede mostrar el botón y
 * esperar el error.** Un `update` o un `delete` que RLS deniega devuelve 0
 * filas *sin excepción*, así que el front no tiene de dónde concluir que salió
 * mal. Si el botón se dibuja, el usuario aprieta y no pasa nada — en silencio.
 *
 * La isla de anular **no se renderiza** cuando el rol no puede: no es que se
 * dibuje deshabilitada, es que no cruza al cliente. Es la forma más simple del
 * patrón y sirve mientras la isla tenga UNA sola acción; cuando tiene varias
 * con permisos distintos —el detalle de un cheque, donde acreditar es del
 * operador y rechazar es de admin— el permiso baja como prop.
 */
export default async function BarPage() {
  const supabase = await createClient()
  const rol = await rolActual()

  const puedeCerrar = puede(rol, 'bar.cierre')
  const puedeRetirar = puede(rol, 'bar.retiro')
  const puedeAnular = puede(rol, 'bar.cierre.anular')

  const { data, error } = await supabase
    .from('v_venta_bar')
    .select('*')
    .order('fecha', { ascending: false })

  if (error) {
    return (
      <div className="pb-10">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Bar</h1>
        <p className="mt-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      </div>
    )
  }

  const cierres = data ?? []

  const columnas: ColumnDef<FilaCierre>[] = [
    { key: 'dia', label: 'Día' },
    { key: 'predio', label: 'Predio' },
    { key: 'efectivo', label: 'Efectivo', align: 'right' },
    { key: 'tarjeta', label: 'Tarjeta', align: 'right' },
    { key: 'mp', label: 'Mercado Pago', align: 'right' },
    { key: 'total', label: 'Total', align: 'right' },
    { key: 'estado', label: 'Estado', format: 'badge' },
    { key: 'acciones', label: '' },
  ]

  const filas: FilaCierre[] = cierres.map((c) => {
    const anulado = c.estado === 'anulado'

    // El anulado se TACHA, no se esconde: mismo criterio que /movimientos con
    // los asientos anulados. Que el cierre se haya hecho y después anulado son
    // dos hechos, y los dos pasaron.
    const monto = (valor: number | null) =>
      anulado ? (
        <span className="text-muted line-through">
          <Money value={valor ?? 0} />
        </span>
      ) : (
        <Money value={valor ?? 0} />
      )

    return {
      venta_bar_id: c.venta_bar_id!,
      dia: formatDate(c.fecha),
      predio: c.predio_nombre ?? c.predio ?? '—',
      efectivo: monto(c.monto_efectivo),
      tarjeta: monto(c.monto_tarjeta),
      mp: monto(c.monto_mp),
      total: anulado ? (
        <span className="text-muted line-through">
          <Money value={c.total ?? 0} />
        </span>
      ) : (
        <Money value={c.total ?? 0} className="font-bold" />
      ),
      estado: anulado
        ? { estado: 'neutro' as const, label: 'Anulado' }
        : { estado: 'ok' as const, label: 'Vigente' },
      // El motivo del anulado se muestra siempre —es información, no una
      // acción—; el botón de anular, sólo a quien puede usarlo.
      acciones: anulado ? (
        <span className="text-[11px] text-muted" title={c.anulado_motivo ?? undefined}>
          {c.anulado_motivo ? `Anulado: ${c.anulado_motivo}` : 'Anulado'}
        </span>
      ) : puedeAnular ? (
        <AnularCierre
          ventaBarId={c.venta_bar_id!}
          fecha={formatDate(c.fecha)}
          predio={c.predio_nombre ?? c.predio ?? ''}
          total={c.total ?? 0}
        />
      ) : null,
    }
  })

  return (
    <div className="pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Bar</h1>
          <p className="mt-1 text-[12px] text-muted">
            El cierre de caja del bar, por día y predio. Un cierre por día.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Retiro como acción secundaria: el cierre de ventas es lo de todos
              los días, el retiro pasa cuando alguien se lleva la plata. */}
          {puedeRetirar && (
            <Link href="/bar/retiro">
              <Button variant="secondary" icon="monedas">
                Retirar efectivo
              </Button>
            </Link>
          )}
          {puedeCerrar && (
            <Link href="/bar/nuevo">
              <Button icon="plus">Registrar cierre</Button>
            </Link>
          )}
        </div>
      </header>

      {cierres.length === 0 ? (
        <div className="rounded-md border border-line bg-white px-4 py-12 text-center">
          <p className="text-[13px] font-bold text-ink">Todavía no hay cierres de bar cargados</p>
          <p className="mx-auto mt-1.5 max-w-md text-[11.5px] text-muted">
            Cada día que abre el bar se carga un cierre con lo que entró por efectivo, tarjeta y
            Mercado Pago. No hace falta que se haya jugado.
          </p>
          {/* El vacío también cambia según el rol: ofrecerle «registrá el
              primero» a quien no puede registrar es prometer algo que la
              pantalla siguiente le va a negar. */}
          {puedeCerrar && (
            <div className="mt-4 flex justify-center">
              <Link href="/bar/nuevo">
                <Button icon="plus">Registrar el primero</Button>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <DataTable columns={columnas} rows={filas} rowKey="venta_bar_id" />
      )}
    </div>
  )
}
