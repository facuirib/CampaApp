import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { Badge, DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface FilaMov {
  clave: string
  asiento_id: string
  fecha: string | null
  descripcion: React.ReactNode
  origen: CeldaBadge
  entra: number | null
  sale: number | null
  saldo_corrido: number | null
}

const COLUMNAS: ColumnDef<FilaMov>[] = [
  { key: 'fecha', label: 'Fecha', format: 'date', width: 108 },
  { key: 'descripcion', label: 'Movimiento' },
  { key: 'origen', label: 'Origen', format: 'badge', width: 126 },
  { key: 'entra', label: 'Entra', format: 'money', tono: 'ingreso', width: 130 },
  { key: 'sale', label: 'Sale', format: 'money', tono: 'egreso', width: 130 },
  // El saldo corrido puede cruzar el cero: ahí el signo es la información.
  { key: 'saldo_corrido', label: 'Saldo', format: 'money', tono: 'auto', width: 140 },
]

const ORIGEN: Record<string, CeldaBadge> = {
  cobro: { estado: 'ok', label: 'Cobro' },
  gasto: { estado: 'mora', label: 'Gasto' },
  socio: { estado: 'info', label: 'Socio' },
  sponsor: { estado: 'info', label: 'Sponsor' },
  bar: { estado: 'neutro', label: 'Bar' },
  arqueo: { estado: 'neutro', label: 'Arqueo' },
  usd: { estado: 'info', label: 'USD' },
  traslado: { estado: 'porVencer', label: 'Traslado' },
  ajuste: { estado: 'porVencer', label: 'Ajuste' },
}

/**
 * El historial de una caja.
 *
 * `/caja` contestaba «cuánto hay», y la pregunta que sigue —«cómo llegó a
 * eso»— no tenía dónde contestarse: para entender un saldo raro había que ir al
 * libro diario y filtrar a ojo por la cuenta.
 *
 * Los movimientos salen de `v_movimiento_caja`, que los lee del diario: una
 * caja ES una cuenta contable, así que no hay tabla paralela que pueda diferir
 * del asiento. El saldo corrido lo trae la vista —verificado que la última fila
 * de cada caja da exactamente su saldo de `v_saldo_caja`, en las nueve—.
 *
 * Los asientos anulados se muestran TACHADOS y no se esconden, igual que en
 * /movimientos: el original y su contraasiento se compensan solos, y filtrar
 * dejaría el contraasiento huérfano (regla 4).
 */
export default async function CajaDetallePage({
  params,
}: {
  params: Promise<{ cajaId: string }>
}) {
  const { cajaId } = await params
  if (!UUID.test(cajaId)) notFound()

  const supabase = await createClient()
  const [{ data: caja }, { data: movs, error }] = await Promise.all([
    supabase.from('v_saldo_caja').select('*').eq('caja_id', cajaId).maybeSingle(),
    supabase
      .from('v_movimiento_caja')
      .select('*')
      .eq('caja_id', cajaId)
      .order('fecha', { ascending: false }),
  ])

  if (!caja) notFound()

  const filas: FilaMov[] = (movs ?? []).map((m, i) => ({
    clave: `${m.asiento_id}-${i}`,
    asiento_id: m.asiento_id!,
    fecha: m.fecha,
    descripcion: m.anulado ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="line-through opacity-60">{m.descripcion}</span>
        <Badge estado="vencido">Anulado</Badge>
      </span>
    ) : (
      m.descripcion
    ),
    origen: ORIGEN[m.origen ?? ''] ?? { estado: 'neutro', label: m.origen ?? '—' },
    entra: (m.debe ?? 0) > 0 ? m.debe : null,
    sale: (m.haber ?? 0) > 0 ? m.haber : null,
    saldo_corrido: m.saldo_corrido,
  }))

  return (
    <div className="pb-10">
      <Link href="/caja" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a caja
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">{caja.nombre}</h1>
        <p className="mt-1 text-[12px] text-muted">
          {caja.tipo}
          {caja.predio ? ` · ${caja.predio}` : ''} — todo lo que entró y salió, del diario.
        </p>
      </header>

      <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <KpiCard
          tono={(caja.saldo ?? 0) < 0 ? 'alerta' : 'positivo'}
          titulo="Saldo actual"
          valor={caja.saldo ?? 0}
          subtitulo={(caja.saldo ?? 0) < 0 ? 'En rojo' : 'Disponible'}
        />
        <KpiCard
          tono="neutro"
          titulo="Movimientos"
          valor={filas.length}
          formato="entero"
          subtitulo="Asientos que la tocaron"
        />
      </div>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {/* Sin fila de total: el saldo es STOCK y ya está arriba. Sumar la
          columna «Saldo» contaría cada movimiento una vez por cada uno que le
          sigue — el mismo argumento que en la ficha del socio. */}
      <DataTable
        columns={COLUMNAS}
        rows={filas}
        rowKey="clave"
        rowHref={(f) => `/movimientos/${f.asiento_id}`}
        densidad="compacta"
        maxHeight={560}
        emptyMessage="Esta caja todavía no tuvo movimientos."
      />
      <p className="mt-3 text-[11px] text-muted">
        Del más reciente al más viejo. Cada fila abre su asiento. Los anulados se muestran tachados:
        el diario es un registro histórico, y el contraasiento está más abajo.
      </p>
    </div>
  )
}
