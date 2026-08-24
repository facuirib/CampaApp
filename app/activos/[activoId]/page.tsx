import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { formatDate, formatMoney, formatPorcentaje } from '@/lib/format'
import { Badge, Button, DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FilaCuota = Database['public']['Views']['v_amortizacion']['Row']

const ROTULO_CATEGORIA: Record<string, string> = {
  herramientas: 'Herramientas',
  maquinaria: 'Maquinaria',
  equipamiento_bar: 'Equipamiento de bar',
  infraestructura: 'Infraestructura',
  otro: 'Otro',
}

interface FilaPlan {
  clave: string
  cuota: string
  periodo: string
  monto: number | null
  estado: CeldaBadge
}

const COLUMNAS: ColumnDef<FilaPlan>[] = [
  { key: 'cuota', label: 'Cuota', width: 96 },
  { key: 'periodo', label: 'Período', width: 110 },
  { key: 'monto', label: 'Monto', format: 'money', width: 132 },
  { key: 'estado', label: 'Estado', format: 'badge', width: 140 },
]

function formatPeriodo(anio: number | null, mes: number | null): string {
  if (anio == null || mes == null) return '—'
  return `${String(mes).padStart(2, '0')}/${anio}`
}

export default async function ActivoDetallePage({
  params,
}: {
  params: Promise<{ activoId: string }>
}) {
  const { activoId } = await params
  if (!UUID.test(activoId)) notFound()

  const supabase = await createClient()
  const rol = await rolActual()
  const puedeAmortizar = puede(rol, 'activo.amortizar')
  // El aviso de «falta registrar la compra» enlaza a /gastos/nuevo, que es una
  // ruta de escritura: para quien no puede cargar un gasto, el aviso se dice
  // igual —es información— pero sin el link que lo rebotaría.
  const puedeCargarGasto = puede(rol, 'gasto.registrar')

  const [activoRes, cuotasRes, periodosRes] = await Promise.all([
    supabase.from('v_activo').select('*').eq('activo_id', activoId).maybeSingle(),
    supabase
      .from('v_amortizacion')
      .select('*')
      .eq('activo_id', activoId)
      .order('anio')
      .order('mes'),
    // Sólo los períodos abiertos: `asentar_amortizacion` recibe un periodo_id, y
    // los períodos se crean solos al primer movimiento del mes. Ofrecer uno que
    // no existe sería ofrecer algo que no se puede hacer.
    supabase.from('periodo').select('id, anio, mes').eq('estado', 'abierto').order('anio').order('mes'),
  ])

  const error = activoRes.error ?? cuotasRes.error
  const activo = activoRes.data

  if (!error && !activo) notFound()

  // La propuesta pendiente NO sale de v_amortizacion —esa vista lista lo ya
  // asentado— sino de proponer_amortizaciones(), que es una función. Se pregunta
  // por cada período abierto y se queda la primera que proponga algo para este
  // activo: es la que corresponde asentar ahora.
  let propuesta: { periodo: string; monto: number; cuota: number; cuotas_total: number } | null =
    null

  for (const p of periodosRes.data ?? []) {
    const { data } = await supabase.rpc('proponer_amortizaciones', { p_periodo_id: p.id })
    const mia = (data ?? []).find((d) => d.activo_id === activoId)
    if (mia) {
      propuesta = {
        periodo: formatPeriodo(p.anio, p.mes),
        monto: mia.monto,
        cuota: mia.cuota,
        cuotas_total: mia.cuotas_total,
      }
      break
    }
  }

  const filas: FilaPlan[] = (cuotasRes.data ?? []).map((c: FilaCuota) => ({
    clave: c.amortizacion_id!,
    cuota: `${c.numero_cuota ?? '—'}/${c.cuotas_total ?? '—'}`,
    periodo: formatPeriodo(c.anio, c.mes),
    monto: c.monto,
    estado: { estado: 'ok', label: 'Confirmada' },
  }))

  // La propuesta se suma a la tabla como una fila más, con badge distinto: es el
  // mismo plan visto en el tiempo, y separarla en otra tabla haría perder que la
  // que viene es la siguiente de esa misma serie.
  const filasConPropuesta: FilaPlan[] = propuesta
    ? [
        ...filas,
        {
          clave: 'propuesta',
          cuota: `${propuesta.cuota}/${propuesta.cuotas_total}`,
          periodo: propuesta.periodo,
          monto: propuesta.monto,
          estado: { estado: 'porVencer', label: 'Propuesta' },
        },
      ]
    : filas

  return (
    <div className="pb-10">
      <Link href="/activos" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a activos
      </Link>

      {error && (
        <p className="mt-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {activo && (
        <>
          <header className="mb-6 mt-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">{activo.nombre}</h1>
              {activo.estado === 'baja' ? (
                <Badge estado="neutro">De baja</Badge>
              ) : (
                <Badge estado="ok">Activo</Badge>
              )}
              {!activo.compra_registrada && <Badge estado="mora">Sin compra</Badge>}
            </div>
            <p className="mt-1 text-[12px] text-muted">
              {activo.categoria ? ROTULO_CATEGORIA[activo.categoria] : '—'}
              {activo.predio ? ` · ${activo.predio}` : ''}
              {activo.fecha_alta ? ` · alta ${formatDate(activo.fecha_alta)}` : ''}
              {' · '}
              {activo.vida_util_meses} meses de vida útil
              {activo.estado === 'baja' && activo.fecha_baja
                ? ` · baja ${formatDate(activo.fecha_baja)}${activo.motivo_baja ? `: ${activo.motivo_baja}` : ''}`
                : ''}
            </p>
          </header>

          <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            <KpiCard tono="neutro" titulo="Valor de origen" valor={activo.valor_origen ?? 0} />
            <KpiCard
              tono="info"
              titulo="Amortizado"
              valor={activo.amortizado ?? 0}
              subtitulo={`${formatPorcentaje(activo.avance_pct ?? 0)} · ${activo.cuotas_confirmadas ?? 0} de ${activo.vida_util_meses} cuotas`}
            />
            <KpiCard
              tono="positivo"
              titulo="Residual"
              valor={activo.residual ?? 0}
              subtitulo={`Quedan ${activo.cuotas_restantes ?? 0} cuotas de ${formatMoney(activo.cuota_mensual ?? 0)}`}
            />
          </div>

          {/* ── El estado "falta la compra" ───────────────────────────────
              No es un error: el alta del bien y la carga de la compra son dos
              pasos, porque `gasto` apunta al activo y no al revés — el activo
              tiene que existir primero. Pero hasta que el gasto no entra, el
              bien no figura en BIENES_USO y no hay nada que amortizar. */}
          {!activo.compra_registrada ? (
            <p className="mb-6 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
              <strong className="font-bold">Falta registrar la compra.</strong> El bien está dado de
              alta pero su compra todavía no se cargó, así que no figura en Bienes de uso.{' '}
              {puedeCargarGasto ? (
                <Link href="/gastos/nuevo" className="font-semibold underline">
                  Se carga desde Gastos
                </Link>
              ) : (
                <span className="font-semibold">Se carga desde Gastos</span>
              )}{' '}
              con una categoría de naturaleza inversión, eligiendo este activo.
            </p>
          ) : (
            activo.gasto_id && (
              <p className="mb-6 text-[11px] text-muted">
                La compra está registrada como gasto.{' '}
                <Link href="/gastos" className="font-semibold text-blue-d hover:underline">
                  Verla en Gastos
                </Link>
                .
              </p>
            )
          )}

          <h2 className="mb-2 text-[13px] font-bold text-ink">Plan de amortización</h2>

          {filasConPropuesta.length === 0 ? (
            <div className="rounded-md border border-line bg-white px-4 py-10 text-center">
              <p className="text-[12px] font-semibold text-ink">Todavía no se amortizó nada</p>
              <p className="mx-auto mt-2 max-w-[54ch] text-[11px] text-muted">
                {activo.compra_registrada
                  ? 'La amortización se asienta mes a mes, y ningún período abierto tiene una cuota pendiente para este activo.'
                  : 'La amortización empieza cuando la compra esté cargada.'}
              </p>
            </div>
          ) : (
            <>
              <DataTable
                columns={COLUMNAS}
                rows={filasConPropuesta}
                rowKey="clave"
                maxHeight={420}
                emptyMessage="Sin cuotas."
              />
              {propuesta && puedeAmortizar && (
                <div className="mt-4">
                  <Link href="/activos/amortizar">
                    <Button>Asentar la amortización de {propuesta.periodo}</Button>
                  </Link>
                </div>
              )}

              <p className="mt-3 text-[11px] text-muted">
                {propuesta ? (
                  <>
                    La cuota <strong className="font-semibold">{propuesta.cuota}</strong> de{' '}
                    {propuesta.periodo} está <strong className="font-semibold">propuesta</strong> y
                    todavía no se asentó. Al confirmarla se registra el asiento{' '}
                    <span className="cifra">Amortizaciones / Amortización acumulada</span>, que
                    impacta el resultado del período pero no la caja.
                  </>
                ) : (
                  <>
                    Cada cuota confirmada asienta{' '}
                    <span className="cifra">Amortizaciones / Amortización acumulada</span>: impacta
                    el resultado, no la caja. La plata salió al comprar el bien.
                  </>
                )}
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
