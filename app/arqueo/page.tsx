import { createClient } from '@/lib/db/server'
import { formatDate } from '@/lib/format'
import { Card, DataTable, Money, type CeldaBadge, type ColumnDef } from '@/components/ui'

// ── Filas preparadas (badge ya resuelto) ────────────────────────────────────

interface FilaDiferencia {
  arqueo_id: string | null
  fecha: string | null
  predio: string | null
  saldo_sistema: number | null
  saldo_contado: number | null
  diferencia: number | null
  clase: CeldaBadge
}

interface FilaHistorial {
  arqueo_id: string | null
  fecha: string | null
  predio: string | null
  saldo_sistema: number | null
  saldo_contado: number | null
  diferencia: number | null
  estado: CeldaBadge
}

interface FilaDiaCancha {
  dia_cancha_id: string | null
  fecha: string | null
  predio: string | null
  saldo_sistema: number | null
  estado: CeldaBadge
}

// ── Mapeos a estado del sistema de diseño ───────────────────────────────────

function claseABadge(clase: string | null): CeldaBadge {
  if (clase === 'faltante') return { estado: 'vencido', label: 'Faltante' }
  if (clase === 'sobrante') return { estado: 'info', label: 'Sobrante' }
  return { estado: 'neutro', label: clase ?? '—' }
}

function estadoArqueoABadge(estado: string | null): CeldaBadge {
  if (estado === 'entregado') return { estado: 'ok', label: 'Entregado' }
  if (estado === 'pendiente_entrega') return { estado: 'porVencer', label: 'Pendiente de entrega' }
  return { estado: 'neutro', label: estado ?? '—' }
}

function arqueadoABadge(arqueoId: string | null): CeldaBadge {
  return arqueoId
    ? { estado: 'ok', label: 'Arqueado' }
    : { estado: 'porVencer', label: 'Sin arquear' }
}

const COL_DIFERENCIAS: ColumnDef<FilaDiferencia>[] = [
  { key: 'fecha', label: 'Fecha', format: 'date', width: 96 },
  { key: 'predio', label: 'Predio' },
  { key: 'saldo_sistema', label: 'Saldo sistema', format: 'money' },
  { key: 'saldo_contado', label: 'Saldo contado', format: 'money' },
  { key: 'diferencia', label: 'Diferencia', format: 'money' },
  { key: 'clase', label: 'Clase', format: 'badge' },
]

const COL_DIA_CANCHA: ColumnDef<FilaDiaCancha>[] = [
  { key: 'fecha', label: 'Fecha', format: 'date', width: 96 },
  { key: 'predio', label: 'Predio' },
  { key: 'saldo_sistema', label: 'Saldo sistema', format: 'money' },
  { key: 'estado', label: 'Estado', format: 'badge' },
]

const COL_HISTORIAL: ColumnDef<FilaHistorial>[] = [
  { key: 'fecha', label: 'Fecha', format: 'date', width: 96 },
  { key: 'predio', label: 'Predio' },
  { key: 'saldo_sistema', label: 'Saldo sistema', format: 'money' },
  { key: 'saldo_contado', label: 'Saldo contado', format: 'money' },
  { key: 'diferencia', label: 'Diferencia', format: 'money' },
  { key: 'estado', label: 'Estado', format: 'badge' },
]

export default async function ArqueoPage() {
  const supabase = await createClient()

  const [
    { data: sinRendir, error: errorSinRendir },
    { data: diferenciasRaw, error: errorDiferencias },
    { data: historialRaw, error: errorHistorial },
    { data: diaCanchaRaw, error: errorDiaCancha },
  ] = await Promise.all([
    supabase.from('v_efectivo_sin_rendir').select('*'),
    supabase.from('v_arqueo_diferencia').select('*').order('fecha', { ascending: false }),
    supabase.from('v_arqueo_detalle').select('*').order('fecha', { ascending: false }),
    supabase.from('v_saldo_efectivo_dia_cancha').select('*').order('fecha', { ascending: false }),
  ])

  const error = errorSinRendir ?? errorDiferencias ?? errorHistorial ?? errorDiaCancha

  const diferencias: FilaDiferencia[] = (diferenciasRaw ?? []).map((f) => ({
    arqueo_id: f.arqueo_id,
    fecha: f.fecha,
    predio: f.predio,
    saldo_sistema: f.saldo_sistema,
    saldo_contado: f.saldo_contado,
    diferencia: f.diferencia,
    clase: claseABadge(f.clase),
  }))

  const historial: FilaHistorial[] = (historialRaw ?? []).map((f) => ({
    arqueo_id: f.arqueo_id,
    fecha: f.fecha,
    predio: f.predio,
    saldo_sistema: f.saldo_sistema,
    saldo_contado: f.saldo_contado,
    diferencia: f.diferencia,
    estado: estadoArqueoABadge(f.estado),
  }))

  const diaCancha: FilaDiaCancha[] = (diaCanchaRaw ?? []).map((f) => ({
    dia_cancha_id: f.dia_cancha_id,
    fecha: f.fecha,
    predio: f.predio,
    saldo_sistema: f.saldo_sistema,
    estado: arqueadoABadge(f.arqueo_id),
  }))

  return (
    <div className="pb-10">
      <header className="mb-7">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Arqueo de caja</h1>
        <p className="mt-1 text-[12px] text-muted">Control de efectivo de los predios.</p>
      </header>

      {error && (
        <pre className="mb-4 rounded-md bg-errbg p-3 text-[11px] text-errtx">{error.message}</pre>
      )}

      {!error && sinRendir && sinRendir.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-3 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            Efectivo sin rendir
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sinRendir.map((fila) => (
              <Card
                key={fila.responsable_id}
                title={`Responsable ${fila.responsable_id?.slice(0, 8) ?? '—'}`}
                icon="alerta"
              >
                <div className="mb-1 text-2xl font-extrabold text-ink">
                  <Money value={fila.monto_sin_rendir ?? 0} />
                </div>
                <p className="text-[11px] text-muted">
                  {fila.arqueos_pendientes ?? 0} arqueos pendientes · desde{' '}
                  {formatDate(fila.desde)}
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {!error && (
        <section className="mb-7">
          <h2 className="mb-3 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            Diferencias sin resolver
          </h2>
          <Card icon="monedas" noPadding>
            <DataTable
              columns={COL_DIFERENCIAS}
              rows={diferencias}
              rowKey={(row, i) => row.arqueo_id ?? i}
              maxHeight={400}
              emptyMessage="No hay diferencias pendientes"
            />
          </Card>
        </section>
      )}

      {!error && (
        <section className="mb-7">
          <h2 className="mb-3 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            Cajas por día de operación
          </h2>
          <Card icon="calendario" noPadding>
            <DataTable
              columns={COL_DIA_CANCHA}
              rows={diaCancha}
              rowKey={(row, i) => row.dia_cancha_id ?? i}
              maxHeight={400}
              emptyMessage="No hay días de cancha registrados"
            />
          </Card>
        </section>
      )}

      {!error && (
        <section className="mb-7">
          <h2 className="mb-3 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            Historial de arqueos
          </h2>
          <Card icon="documento" noPadding>
            <DataTable
              columns={COL_HISTORIAL}
              rows={historial}
              rowKey={(row, i) => row.arqueo_id ?? i}
              maxHeight={400}
              emptyMessage="No hay arqueos registrados"
            />
          </Card>
        </section>
      )}
    </div>
  )
}