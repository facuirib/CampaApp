import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { formatDate, formatMoney } from '@/lib/format'
import { estadoSocio } from '@/lib/domain/socio'
import { Badge, Button, DataTable, KpiCard, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

/**
 * El segmento acepta cualquier texto: se valida ANTES de consultar, así el
 * error de Postgres —`invalid input syntax for type uuid`— ni se produce.
 * Mismo criterio que sponsors, la cuenta corriente de cobranza y el diario.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FilaMensual = Database['public']['Views']['v_socio_detalle_mensual']['Row']

interface FilaPeriodo {
  periodo_id: string
  periodo: string
  devengado: number | null
  retirado: number | null
  neto: number | null
  saldo_acumulado: number | null
}

/**
 * El período va como TEXTO, no como `format: 'date'`.
 *
 * La vista da `anio` y `mes` por separado, no una fecha: fabricar un día 1 para
 * poder formatearlo sería inventar un dato que no existe, y mostrar "01/08/26"
 * donde el mes es la unidad. El devengo es del mes completo — se asienta el
 * último día, no el primero.
 */
function formatPeriodo(anio: number | null, mes: number | null): string {
  if (anio == null || mes == null) return '—'
  return `${String(mes).padStart(2, '0')}/${anio}`
}

const COLUMNAS: ColumnDef<FilaPeriodo>[] = [
  { key: 'periodo', label: 'Período', width: 96 },
  { key: 'devengado', label: 'Devengado', format: 'money', width: 132 },
  { key: 'retirado', label: 'Retirado', format: 'money', width: 132 },
  { key: 'neto', label: 'Neto', format: 'money', width: 132 },
  { key: 'saldo_acumulado', label: 'Saldo acumulado', format: 'money', width: 150 },
]

export default async function SocioDetallePage({
  params,
}: {
  params: Promise<{ socioId: string }>
}) {
  const { socioId } = await params
  if (!UUID.test(socioId)) notFound()

  const supabase = await createClient()

  const [socioRes, mensualRes] = await Promise.all([
    // El filtro `tipo = 'socio'` está DENTRO de la vista, así que el uuid de un
    // sponsor o de un equipo no devuelve fila y cae en notFound. No hace falta
    // comprobarlo acá — y comprobarlo acá sería una segunda definición de "qué
    // es un socio", que es justo lo que no queremos duplicado.
    supabase.from('v_socio_lista').select('*').eq('socio_id', socioId).maybeSingle(),
    supabase
      .from('v_socio_detalle_mensual')
      .select('*')
      .eq('socio_id', socioId)
      .order('anio')
      .order('mes'),
  ])

  const error = socioRes.error ?? mensualRes.error
  const socio = socioRes.data

  // Uuid válido pero de alguien que no es socio: tampoco existe como recurso.
  if (!error && !socio) notFound()

  const filas: FilaPeriodo[] = (mensualRes.data ?? []).map((f: FilaMensual) => ({
    periodo_id: f.periodo_id!,
    periodo: formatPeriodo(f.anio, f.mes),
    devengado: f.devengado,
    retirado: f.retirado,
    neto: f.neto,
    saldo_acumulado: f.saldo_acumulado,
  }))

  const saldo = socio?.saldo ?? 0
  const badge = estadoSocio(socio?.estado ?? null)

  return (
    <div className="pb-10">
      <Link href="/socios" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a socios
      </Link>

      {error && (
        <p className="mt-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {socio && (
        <>
          <header className="mb-6 mt-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">{socio.socio}</h1>
              <Badge estado={badge.estado}>{badge.label}</Badge>
              {socio.activo === false && <Badge estado="neutro">Inactivo</Badge>}
            </div>
            <p className="mt-1 text-[12px] text-muted">
              {socio.sueldo_vigente == null
                ? 'Sin sueldo acordado'
                : `${formatMoney(socio.sueldo_vigente)} por mes` +
                  (socio.vigente_desde ? ` desde el ${formatDate(socio.vigente_desde)}` : '')}
              {' · '}
              {socio.meses_con_movimiento === 1
                ? '1 mes con movimiento'
                : `${socio.meses_con_movimiento ?? 0} meses con movimiento`}
            </p>
          </header>

          <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            <KpiCard tono="neutro" titulo="Devengado" valor={socio.devengado ?? 0} />
            <KpiCard tono="info" titulo="Retirado" valor={socio.retirado ?? 0} />
            {/* El saldo negativo es el socio que retiró de más: plata que le
                queda en contra. Va en alerta porque es la única de las tres
                cifras que puede estar mal, no porque cero sea malo. */}
            <KpiCard
              tono={saldo < 0 ? 'alerta' : 'positivo'}
              titulo="Saldo"
              valor={saldo}
              subtitulo={saldo < 0 ? 'Retiró más de lo devengado' : 'A favor del socio'}
            />
          </div>

          {/* ── El hueco de la escritura ──────────────────────────────────
              El botón está en su lugar y DESHABILITADO, no ausente. Que se vea
              dónde va a estar contesta la pregunta de Facu —"no se ve cómo
              registrar un retiro"— sin fingir que ya se puede.

              No está cableado a propósito: `crear_retiro_socio` existe y está
              completa, pero es una de las seis funciones sin `p_created_by`, y
              desde que se sacó el fallback a auth.users no puede escribir sin
              sesión. Un botón que la llame hoy explota con "permission denied
              for table users".

              La escritura es carril de Horacio: el formulario, la Server Action
              y el parámetro de la función van juntos. Acá sólo queda el lugar. */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Button
              icon="plus"
              disabled
              title="En construcción: la escritura de socios está pendiente"
            >
              Registrar retiro
            </Button>
            <p className="text-[10.5px] text-muted">
              En construcción. Los retiros se cargan por ahora desde la base; la pantalla de carga
              es lo próximo del módulo.
            </p>
          </div>

          {/* La fila de total se PASA desde v_socio_lista, no se suma acá.

              `saldo_acumulado` queda EN BLANCO a propósito. Las otras tres
              columnas son flujo —lo que pasó en cada mes— y sumarlas da algo
              que significa: los netos suman exactamente el saldo. El acumulado
              es STOCK: cada fila ya contiene a las anteriores, así que sumar la
              columna cuenta los meses viejos una vez por cada mes siguiente. El
              único total sensato sería el último valor de la serie, y ése ya
              está arriba en el KpiCard de Saldo — bajo un rótulo que dice
              "saldo" y no "total". */}
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            rowKey="periodo_id"
            maxHeight={520}
            total={{
              periodo: 'Total',
              devengado: socio.devengado ?? 0,
              retirado: socio.retirado ?? 0,
              neto: saldo,
            }}
            emptyMessage="Todavía no hay devengos ni retiros para este socio."
          />
        </>
      )}
    </div>
  )
}
