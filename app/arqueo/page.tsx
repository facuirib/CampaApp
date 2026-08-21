import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { formatDate } from '@/lib/format'
import { Button, Card, DataTable, Money, type CeldaBadge, type ColumnDef } from '@/components/ui'
import AsentarDiferencia from './AsentarDiferencia'

// ── Filas preparadas (badge ya resuelto) ────────────────────────────────────

interface FilaDiferencia {
  arqueo_id: string | null
  fecha: string | null
  predio: string | null
  saldo_sistema: number | null
  saldo_contado: number | null
  diferencia: number | null
  clase: CeldaBadge
  ambito: CeldaBadge
  /** Isla de cliente: el botón que escribe el asiento de ajuste. */
  accion: React.ReactNode
}

interface FilaHistorial {
  arqueo_id: string | null
  fecha: string | null
  predio: string | null
  saldo_sistema: number | null
  saldo_contado: number | null
  diferencia: number | null
  estado: CeldaBadge
  ambito: CeldaBadge
}

interface FilaDiaCancha {
  dia_cancha_id: string | null
  // No es columna visible: solo para armar el rowHref (arqueado → entregar
  // ese arqueo; sin arquear → crear uno nuevo preseleccionando el día).
  arqueo_id: string | null
  fecha: string | null
  predio: string | null
  saldo_sistema: number | null
  estado: CeldaBadge
}

// ── Mapeos a estado del sistema de diseño ───────────────────────────────────

/**
 * El ámbito, como badge y no como texto plano.
 *
 * Son dos cajones físicos distintos: mezclarlos en una lista sin marca visible
 * es cómo se termina asentando el faltante del bar contra la caja del torneo.
 */
function ambitoABadge(ambito: string | null): CeldaBadge {
  if (ambito === 'bar') return { estado: 'info', label: 'Bar' }
  return { estado: 'neutro', label: 'Torneo' }
}

function claseABadge(clase: string | null): CeldaBadge {
  if (clase === 'faltante') return { estado: 'vencido', label: 'Faltante' }
  if (clase === 'sobrante') return { estado: 'info', label: 'Sobrante' }
  return { estado: 'neutro', label: clase ?? '—' }
}

/**
 * El estado, leído según el ámbito.
 *
 * `arqueo.estado` nace en 'pendiente_entrega' para los dos cajones, pero la
 * entrega a central es del TORNEO: el bar saca su plata por /bar/retiro y
 * `registrar_entrega_central` lo rechaza. Mostrarle «Pendiente de entrega» a un
 * arqueo de bar anuncia un paso que no existe y que nadie va a poder hacer.
 *
 * La columna se comparte porque la tabla se comparte —fue la contra asumida al
 * elegir `ambito` en vez de una tabla aparte—, así que la lectura se corrige
 * acá, que es donde el ámbito está a la vista.
 */
function estadoArqueoABadge(estado: string | null, ambito: string | null): CeldaBadge {
  if (ambito === 'bar') return { estado: 'ok', label: 'Registrado' }
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
  { key: 'ambito', label: 'Cajón', format: 'badge', width: 88 },
  { key: 'predio', label: 'Predio' },
  { key: 'saldo_sistema', label: 'Saldo sistema', format: 'money' },
  { key: 'saldo_contado', label: 'Saldo contado', format: 'money' },
  { key: 'diferencia', label: 'Diferencia', format: 'money' },
  { key: 'clase', label: 'Clase', format: 'badge' },
  { key: 'accion', label: '' },
]

const COL_DIA_CANCHA: ColumnDef<FilaDiaCancha>[] = [
  { key: 'fecha', label: 'Fecha', format: 'date', width: 96 },
  { key: 'predio', label: 'Predio' },
  { key: 'saldo_sistema', label: 'Saldo sistema', format: 'money' },
  { key: 'estado', label: 'Estado', format: 'badge' },
]

const COL_HISTORIAL: ColumnDef<FilaHistorial>[] = [
  { key: 'fecha', label: 'Fecha', format: 'date', width: 96 },
  { key: 'ambito', label: 'Cajón', format: 'badge', width: 88 },
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
    ambito: ambitoABadge(f.ambito),
    accion: (
      <AsentarDiferencia
        arqueoId={f.arqueo_id!}
        ambito={f.ambito ?? 'torneo'}
        diferencia={f.diferencia ?? 0}
        cuenta={f.ambito === 'bar' ? 'Bar Efectivo' : 'Caja Efectivo'}
      />
    ),
  }))

  const historial: FilaHistorial[] = (historialRaw ?? []).map((f) => ({
    arqueo_id: f.arqueo_id,
    fecha: f.fecha,
    predio: f.predio,
    saldo_sistema: f.saldo_sistema,
    saldo_contado: f.saldo_contado,
    diferencia: f.diferencia,
    estado: estadoArqueoABadge(f.estado, f.ambito),
    ambito: ambitoABadge(f.ambito),
  }))

  const diaCancha: FilaDiaCancha[] = (diaCanchaRaw ?? []).map((f) => ({
    dia_cancha_id: f.dia_cancha_id,
    arqueo_id: f.arqueo_id,
    fecha: f.fecha,
    predio: f.predio,
    saldo_sistema: f.saldo_sistema,
    estado: arqueadoABadge(f.arqueo_id),
  }))

  return (
    <div className="pb-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Arqueo de caja</h1>
          <p className="mt-1 text-[12px] text-muted">
            Control de efectivo de los predios. Dos cajones por predio: el del torneo y el del bar.
          </p>
        </div>
        {/* El alta vive acá y no solo en la tabla de días: la tabla lista el
            cajón del TORNEO, así que sin este botón el arqueo del bar no
            tendría por dónde entrar. */}
        <Link href="/arqueo/nuevo">
          <Button icon="plus">Registrar arqueo</Button>
        </Link>
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
                  {fila.arqueos_pendientes ?? 0} arqueos pendientes · desde {formatDate(fila.desde)}
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {!error && (
        <section className="mb-7">
          <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            Diferencias sin resolver
          </h2>
          <p className="mb-3 text-[11px] text-muted">
            Plata que el libro dice que está y no está, o al revés. Asentar el ajuste la lleva a
            «Diferencias de arqueo» y deja la caja en lo que se contó.
          </p>
          <DataTable
            columns={COL_DIFERENCIAS}
            rows={diferencias}
            rowKey={(row, i) => row.arqueo_id ?? i}
            maxHeight={400}
            emptyMessage="No hay diferencias pendientes"
          />
        </section>
      )}

      {!error && (
        <section className="mb-7">
          <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            Cajas del torneo por día de operación
          </h2>
          <p className="mb-3 text-[11px] text-muted">
            El cajón del torneo. El del bar se arquea desde <strong>Registrar arqueo → Bar</strong>.
          </p>
          <DataTable
            columns={COL_DIA_CANCHA}
            rows={diaCancha}
            rowKey={(row, i) => row.dia_cancha_id ?? i}
            rowHref={(row) =>
              row.arqueo_id ? `/arqueo/${row.arqueo_id}/entregar` : `/arqueo/nuevo?dia=${row.dia_cancha_id}`
            }
            maxHeight={400}
            emptyMessage="No hay días de cancha registrados"
          />
        </section>
      )}

      {!error && (
        <section className="mb-7">
          <h2 className="mb-3 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            Historial de arqueos
          </h2>
          <DataTable
            columns={COL_HISTORIAL}
            rows={historial}
            rowKey={(row, i) => row.arqueo_id ?? i}
            /* Solo el arqueo del TORNEO se entrega a central. El del bar saca
               su plata por /bar/retiro, y `registrar_entrega_central` lo
               rechaza — mandarlo a esa pantalla sería ofrecer una acción que la
               base no va a aceptar. */
            rowHref={(row) =>
              row.ambito.label === 'Torneo' ? `/arqueo/${row.arqueo_id}/entregar` : undefined
            }
            maxHeight={400}
            emptyMessage="No hay arqueos registrados"
          />
        </section>
      )}
    </div>
  )
}
