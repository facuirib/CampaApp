import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { Button, DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type Ficha = Database['public']['Views']['v_cuenta_corriente_equipo']['Row']
type CuotaRow = Database['public']['Views']['v_deuda_detalle']['Row']

/**
 * El segmento `[terceroId]` acepta cualquier texto, así que `/cobranza/kpis` o
 * `/cobranza/loquesea` llegan hasta acá. Se valida ANTES de consultar: si no
 * es un uuid, la consulta ni se hace y el error de Postgres —`invalid input
 * syntax for type uuid`— no llega a existir, mucho menos a pantalla.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Los estados de cuota, con rótulo legible.
 *
 * Acá SÍ corresponde este mapa: estas filas son cuotas, y `v_deuda_detalle`
 * trae la columna `estado`. En la lista de deudores no aplicaba porque
 * `v_deuda_equipo` lista importes por equipo, no situaciones de cuota.
 *
 * `vencida` y `parcial_vencida` comparten el rojo: las dos son plata que ya
 * tendría que estar. Se distinguen por el rótulo, que dice cuál es cuál.
 */
const ESTADOS: Record<string, CeldaBadge> = {
  al_dia: { estado: 'alDia', label: 'Al día' },
  pagada: { estado: 'ok', label: 'Pagada' },
  por_vencer: { estado: 'porVencer', label: 'Por vencer' },
  vencida: { estado: 'mora', label: 'Vencida' },
  parcial_vencida: { estado: 'mora', label: 'Parcial vencida' },
}

function estadoCuota(codigo: string | null): CeldaBadge {
  // Un estado que la vista agregue mañana cae en gris con su código, en vez
  // de romper o de mentir con un color que no le toca.
  return ESTADOS[codigo ?? ''] ?? { estado: 'neutro', label: codigo ?? '—' }
}

interface FilaCuota {
  cuota_id: string
  cuota_numero: number | null
  torneo: string | null
  vence_at: string | null
  monto: number | null
  pagado: number | null
  saldo: number | null
  estado: CeldaBadge
}

const COLUMNAS: ColumnDef<FilaCuota>[] = [
  { key: 'cuota_numero', label: 'Cuota', align: 'right', width: 70 },
  // El torneo también está como título de la sección, y aun así va en la fila.
  // El encabezado se pierde apenas la tabla scrollea: la cuota de la fila 30 no
  // dice de qué torneo es, y con un equipo anotado en dos torneos —que ahora
  // existe— eso es exactamente lo que hay que poder leer de un vistazo.
  { key: 'torneo', label: 'Torneo', width: 132 },
  { key: 'vence_at', label: 'Vence', format: 'date', width: 110 },
  { key: 'monto', label: 'Monto', format: 'money', width: 128 },
  { key: 'pagado', label: 'Pagado', format: 'money', width: 128 },
  { key: 'saldo', label: 'Saldo', format: 'money', width: 128 },
  { key: 'estado', label: 'Estado', format: 'badge' },
]

export default async function CuentaCorrientePage({
  params,
}: {
  params: Promise<{ terceroId: string }>
}) {
  const { terceroId } = await params

  // Un id que no es uuid no puede corresponder a ningún equipo: es un 404, y
  // así se corta antes de consultar. El error de Postgres ni se produce.
  if (!UUID.test(terceroId)) notFound()

  const supabase = await createClient()
  const puedeCobrar = puede(await rolActual(), 'cobro.registrar')
  const [fichasRes, cuotasRes] = await Promise.all([
    supabase.from('v_cuenta_corriente_equipo').select('*').eq('tercero_id', terceroId),
    supabase
      .from('v_deuda_detalle')
      .select('*')
      .eq('tercero_id', terceroId)
      .order('torneo')
      .order('cuota_numero'),
  ])

  const error = fichasRes.error ?? cuotasRes.error
  const fichas = fichasRes.data ?? []
  const cuotas = cuotasRes.data ?? []

  // Uuid válido pero sin ficha ni cuota: tampoco existe como recurso.
  if (!error && fichas.length === 0 && cuotas.length === 0) notFound()

  const equipo = fichas[0]?.equipo ?? cuotas[0]?.equipo ?? 'Equipo'

  return (
    <div className="pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">{equipo}</h1>
          <p className="mt-1 text-[12px] text-muted">
            Cuenta corriente — una sección por ficha, con sus cuotas.
          </p>
        </div>
        {puedeCobrar && (
          <Link href={`/cobranza/${terceroId}/cobrar`}>
            <Button icon="plus">Registrar cobro</Button>
          </Link>
        )}
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {fichas.map((ficha: Ficha) => {
        // Filtro, no cálculo: se reparten las cuotas ya traídas entre las
        // fichas del equipo. Ningún número sale de acá.
        const suyas = cuotas.filter((c: CuotaRow) => c.equipo_torneo_id === ficha.equipo_torneo_id)

        const filas: FilaCuota[] = suyas.map((c: CuotaRow) => ({
          cuota_id: c.cuota_id!,
          cuota_numero: c.cuota_numero,
          torneo: c.torneo,
          vence_at: c.vence_at,
          monto: c.monto,
          pagado: c.pagado,
          saldo: c.saldo,
          estado: estadoCuota(c.estado),
        }))

        const saldo = ficha.saldo ?? 0

        return (
          <section key={ficha.equipo_torneo_id} className="mb-8">
            <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
              {ficha.torneo}
            </h2>
            <p className="mb-3 text-[11px] text-muted">
              {ficha.categoria} · Serie {ficha.serie}
            </p>

            <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <KpiCard tono="neutro" titulo="Total del plan" valor={ficha.total_plan ?? 0} />
              <KpiCard tono="positivo" titulo="Pagado" valor={ficha.total_pagado ?? 0} />
              <KpiCard tono={saldo > 0 ? 'alerta' : 'positivo'} titulo="Saldo" valor={saldo} />
              <KpiCard
                tono="info"
                titulo="Cuotas pagadas"
                valor={ficha.cuotas_pagadas ?? 0}
                formato="entero"
                subtitulo={`de ${ficha.cuotas_total ?? 0} cuotas`}
              />
            </div>

            {/* La fila de total se PASA desde la ficha: total_plan, total_pagado
                y saldo de `v_cuenta_corriente_equipo` son exactamente la suma de
                las columnas de esta tabla —verificado sobre las 28 fichas del
                set— así que no hace falta sumarlas acá, ni se hace. */}
            <DataTable
              columns={COLUMNAS}
              rows={filas}
              rowKey="cuota_id"
              maxHeight={420}
              total={{
                cuota_numero: 'Total',
                monto: ficha.total_plan ?? 0,
                pagado: ficha.total_pagado ?? 0,
                saldo,
              }}
              emptyMessage="Esta ficha no tiene cuotas generadas."
            />
          </section>
        )
      })}
    </div>
  )
}
