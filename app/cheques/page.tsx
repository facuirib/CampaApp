import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaCheque = Database['public']['Views']['v_cheque']['Row']

/**
 * Cómo se dibuja cada situación.
 *
 * `situacion` ya viene derivada de la vista —combina estado y fecha— así que acá
 * sólo se elige color y rótulo. El front no decide si algo está vencido.
 */
const BADGE_SITUACION: Record<string, CeldaBadge> = {
  vencido: { estado: 'vencido', label: 'Vencido' },
  por_vencer: { estado: 'porVencer', label: 'Por vencer' },
  acreditado: { estado: 'ok', label: 'Acreditado' },
  debitado: { estado: 'ok', label: 'Debitado' },
  rechazado: { estado: 'mora', label: 'Rechazado' },
  anulado: { estado: 'neutro', label: 'Anulado' },
}

/**
 * Los días, en palabras.
 *
 * `dias_para_cobro` viene crudo de la vista: 35, -6. Un "-6" pelado no dice si
 * faltan o pasaron, y es justo lo que hay que leer de un vistazo en una cartera.
 * En los resueltos no se muestra: la cuenta regresiva ya no significa nada.
 */
function rotuloDias(dias: number | null, situacion: string | null): string {
  if (dias === null) return '—'
  if (situacion !== 'vencido' && situacion !== 'por_vencer') return '—'
  if (dias === 0) return 'hoy'
  if (dias > 0) return `en ${dias} ${dias === 1 ? 'día' : 'días'}`
  return `hace ${-dias} ${dias === -1 ? 'día' : 'días'}`
}

interface Fila {
  cheque_id: string
  sentido: CeldaBadge
  numero: string | null
  banco: string | null
  contraparte: string | null
  monto: number | null
  fecha_cobro: string | null
  dias: string
  situacion: CeldaBadge
}

const COLUMNAS: ColumnDef<Fila>[] = [
  { key: 'sentido', label: 'Sentido', format: 'badge', width: 116 },
  { key: 'numero', label: 'Número', width: 100 },
  { key: 'banco', label: 'Banco', width: 146 },
  { key: 'contraparte', label: 'Contraparte' },
  // El monto va sin signo: el badge de sentido ya dice para qué lado va, y un
  // "-$2.400.000" en una columna de montos se lee como error de carga.
  { key: 'monto', label: 'Monto', format: 'money', width: 138 },
  { key: 'fecha_cobro', label: 'Cobro', format: 'date', width: 104 },
  { key: 'dias', label: 'Vence', align: 'right', width: 112 },
  { key: 'situacion', label: 'Situación', format: 'badge', width: 122 },
]

export default async function ChequesPage({
  searchParams,
}: {
  searchParams: Promise<{ sentido?: string; situacion?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  // Default: lo que está abierto. La cartera es lo pendiente; lo resuelto se ve
  // eligiéndolo. Mismo criterio que el estado=activo de Activos.
  const situacion = params.situacion === undefined ? 'pendientes' : params.situacion

  let query = supabase.from('v_cheque').select('*')
  if (params.sentido) query = query.eq('sentido', params.sentido)
  if (situacion === 'pendientes') query = query.in('situacion', ['por_vencer', 'vencido'])
  else if (situacion) query = query.eq('situacion', situacion)

  const [listaRes, kpiRes] = await Promise.all([
    query.order('fecha_cobro'),
    // Una fila siempre, también sin cheques: es una agregación sin group by.
    supabase.from('v_cheque_kpi').select('*').maybeSingle(),
  ])

  const error = listaRes.error ?? kpiRes.error
  const kpi = kpiRes.data

  const filas: Fila[] = (listaRes.data ?? []).map((c: FilaCheque) => ({
    cheque_id: c.cheque_id!,
    sentido:
      c.sentido === 'emitido'
        ? { estado: 'neutro', label: 'Emitido' }
        : { estado: 'info', label: 'Recibido' },
    numero: c.numero,
    banco: c.banco,
    contraparte: c.contraparte,
    monto: c.monto,
    fecha_cobro: c.fecha_cobro,
    dias: rotuloDias(c.dias_para_cobro, c.situacion),
    situacion: BADGE_SITUACION[c.situacion ?? ''] ?? { estado: 'neutro', label: c.situacion ?? '—' },
  }))

  const filtros: FiltroUrl[] = [
    {
      parametro: 'sentido',
      label: 'Sentido',
      todos: 'Todos',
      opciones: [
        { valor: 'recibido', label: 'Recibidos' },
        { valor: 'emitido', label: 'Emitidos' },
      ],
    },
    {
      parametro: 'situacion',
      label: 'Situación',
      // "Todas" es el vacío. El default de la pantalla es `pendientes`, y
      // valorPorDefecto lo refleja para que el control no mienta sobre lo que
      // la tabla está mostrando.
      todos: 'Todas',
      opciones: [
        { valor: 'pendientes', label: 'Pendientes' },
        { valor: 'vencido', label: 'Vencidos' },
        { valor: 'por_vencer', label: 'Por vencer' },
        { valor: 'acreditado', label: 'Acreditados' },
        { valor: 'debitado', label: 'Debitados' },
        { valor: 'rechazado', label: 'Rechazados' },
      ],
      valorPorDefecto: 'pendientes',
    },
  ]

  const vencidos = kpi?.vencidos ?? 0
  const neto = kpi?.neto ?? 0
  const hayCheques = (kpi?.total ?? 0) > 0

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Cheques</h1>
        <p className="mt-1 max-w-[78ch] text-[12px] text-muted">
          Los cheques recibidos y emitidos, con su vencimiento y su estado. Un cheque no mueve la
          caja hasta que se acredita o el banco lo debita: mientras está pendiente es plata
          comprometida, y así entra a la proyección.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {/* Los cuatro salen de v_cheque_kpi, que agrega la MISMA vista que la
          tabla: el encabezado y las filas no pueden discrepar. */}
      <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        <KpiCard
          tono="neutro"
          titulo="En cartera"
          valor={kpi?.en_cartera ?? 0}
          icon="monedas"
          subtitulo={`${kpi?.recibidos_pendientes ?? 0} recibidos por cobrar`}
        />
        <KpiCard
          tono="info"
          titulo="A pagar"
          valor={kpi?.a_pagar ?? 0}
          icon="banco"
          subtitulo={`${kpi?.emitidos_pendientes ?? 0} emitidos pendientes`}
        />
        {/* El neto va ADEMÁS de los dos, no en lugar: son dos movimientos en
            direcciones opuestas y cada uno es una conversación distinta. */}
        <KpiCard
          tono={neto < 0 ? 'alerta' : 'positivo'}
          titulo="Neto"
          valor={neto}
          icon="caja"
          subtitulo={neto < 0 ? 'Se debe más de lo que se espera cobrar' : 'A favor'}
        />
        <KpiCard
          tono={vencidos > 0 ? 'alerta' : 'neutro'}
          titulo="Vencidos"
          valor={kpi?.monto_vencido ?? 0}
          icon="alerta"
          subtitulo={
            vencidos > 0
              ? `${vencidos} ${vencidos === 1 ? 'cheque sin resolver' : 'cheques sin resolver'}`
              : 'Ninguno vencido'
          }
        />
      </div>

      {/* Los dos casos de "vencido" son problemas distintos y la banda lo dice:
          uno es plata que falta, el otro plata que todavía no salió. */}
      {vencidos > 0 && (
        <p className="mb-6 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
          <strong className="font-bold">
            {vencidos === 1
              ? 'Un cheque venció y sigue sin resolverse.'
              : `${vencidos} cheques vencieron y siguen sin resolverse.`}
          </strong>{' '}
          Un <strong className="font-semibold">recibido</strong> vencido es plata que ya debería
          estar en la cuenta: hay que acreditarlo, o marcarlo rechazado si el banco no lo pagó. Un{' '}
          <strong className="font-semibold">emitido</strong> vencido es plata que el banco todavía
          no debitó, y la caja la está mostrando de más.
        </p>
      )}

      {hayCheques && (
        <div className="mb-4">
          <FiltrosUrl filtros={filtros} />
        </div>
      )}

      {/* Entrega vacía: sin cheques no se muestra una tabla vacía con filtros
          arriba —que se lee como que algo se rompió— sino de dónde salen. */}
      {!error && !hayCheques ? (
        <div className="rounded-md border border-line bg-white px-4 py-12 text-center">
          <p className="text-[13px] font-bold text-ink">Todavía no hay cheques</p>
          <p className="mx-auto mt-2 max-w-[58ch] text-[11px] text-muted">
            Los cheques no se cargan acá: aparecen solos. Uno{' '}
            <strong className="font-semibold">recibido</strong> entra al registrar un cobro con
            medio cheque; uno <strong className="font-semibold">emitido</strong>, al pagar un gasto
            con cheque. Esta pantalla es para seguirlos: cuándo vencen, acreditarlos, debitarlos o
            marcar un rechazo.
          </p>
          <p className="mt-5 text-[11px] text-muted">
            <Link href="/cobranza" className="font-semibold text-blue-d hover:underline">
              Registrar un cobro
            </Link>
            {' · '}
            <Link href="/gastos" className="font-semibold text-blue-d hover:underline">
              Pagar un gasto
            </Link>
          </p>
        </div>
      ) : (
        <DataTable
          columns={COLUMNAS}
          rows={filas}
          rowKey="cheque_id"
          rowHref={(f) => `/cheques/${f.cheque_id}`}
          maxHeight={560}
          emptyMessage="Ningún cheque coincide con estos filtros."
        />
      )}

      {hayCheques && (
        <p className="mt-4 text-[11px] text-muted">
          El detalle de cada uno abre su origen y sus asientos. Los pendientes se proyectan en{' '}
          <Link href="/proyeccion" className="font-semibold text-blue-d hover:underline">
            Proyección
          </Link>{' '}
          por su fecha de cobro: los recibidos suman, los emitidos restan.
        </p>
      )}
    </div>
  )
}
