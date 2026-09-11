import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { formatDate, formatMoney } from '@/lib/format'
import { areaLabel, estadoGasto, naturalezaLabel } from '@/lib/domain/gasto'
import { etiquetaMedio } from '@/lib/domain/medio-pago'
import { Badge, Card, LinkButton } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * El detalle de un gasto, de SOLO lectura.
 *
 * Hasta esta pantalla, el único detalle era `/gastos/[id]/pagar` — la pantalla
 * de escritura, que el middleware corta por rol. Consecuencia: para lectura y
 * finanzas la lista de gastos era una tabla inerte, sin fila abrible
 * (hallazgo del diagnóstico 11/09). Acá puede entrar cualquiera que vea
 * Gastos; «Pagar» es un link que sólo se ofrece a quien puede.
 */
export default async function GastoDetallePage({
  params,
}: {
  params: Promise<{ gastoId: string }>
}) {
  const { gastoId } = await params
  const supabase = await createClient()
  const rol = await rolActual()
  const puedePagar = puede(rol, 'gasto.pagar')
  const puedeAdjuntar = puede(rol, 'gasto.adjuntar')

  const { data: g } = await supabase
    .from('v_gasto_detalle')
    .select('*')
    .eq('gasto_id', gastoId)
    .maybeSingle()

  if (!g) notFound()

  const filas: [string, React.ReactNode][] = [
    ['Categoría', g.categoria ?? '—'],
    ['Tipo', naturalezaLabel(g.naturaleza)],
    ['Área', areaLabel(g.area)],
    [
      'Cuándo',
      g.jornada_numero != null
        ? `Fecha ${g.jornada_numero} · ${formatDate(g.jornada_fecha)}`
        : formatDate(g.devengado_at),
    ],
    ['Torneo', g.torneo ?? 'Estructura'],
    ['Total', <strong key="t">{formatMoney(g.total ?? 0)}</strong>],
  ]
  if (g.estado === 'pagado') {
    filas.push(
      ['Pagado', formatDate(g.pagado_at)],
      ['Medio', etiquetaMedio(g.medio_pago)],
      ['Responsable', g.pagado_por?.split('@')[0] ?? '—'],
    )
  }

  const badge = estadoGasto(g.estado)

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <Link href="/gastos" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a gastos
      </Link>

      <header className="mb-6 mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">
            {g.concepto ?? 'Gasto'}
          </h1>
          <p className="mt-1 text-[12px] text-muted">
            El gasto, tal como está registrado. Las escrituras — pagar, adjuntar — son sus
            propias pantallas.
          </p>
        </div>
        <Badge estado={badge.estado}>{badge.label}</Badge>
      </header>

      <Card>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {filas.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line2 py-1.5">
              <dt className="text-[10px] font-bold uppercase tracking-[.06em] text-muted">{k}</dt>
              <dd className="text-[12px] text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {g.estado === 'devengado' && puedePagar && (
            <LinkButton href={`/gastos/${gastoId}/pagar`} icon="check">
              Pagar
            </LinkButton>
          )}
          {(puedeAdjuntar || g.estado !== null) && (
            <LinkButton href={`/gastos/${gastoId}/comprobante`} variant="secondary">
              Comprobante
            </LinkButton>
          )}
        </div>
      </Card>
    </div>
  )
}
