import { createClient } from '@/lib/db/server'
import { estadoSocio } from '@/lib/domain/socio'
import { DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaLista = Database['public']['Views']['v_socio_lista']['Row']

interface FilaSocio {
  socio_id: string
  socio: string | null
  estado: CeldaBadge
  sueldo_vigente: number | null
  devengado: number | null
  retirado: number | null
  saldo: number | null
  meses_con_movimiento: number | null
}

const COLUMNAS: ColumnDef<FilaSocio>[] = [
  { key: 'socio', label: 'Socio' },
  { key: 'estado', label: 'Estado', format: 'badge', width: 130 },
  { key: 'sueldo_vigente', label: 'Sueldo vigente', format: 'money', width: 138 },
  { key: 'devengado', label: 'Devengado', format: 'money', width: 132 },
  { key: 'retirado', label: 'Retirado', format: 'money', width: 132 },
  // El saldo es la única de las tres que puede ser negativa, y su signo cambia
  // de qué se está hablando: positivo es plata a pagar, negativo es plata que
  // se llevó de más. Va última porque es la conclusión de las dos anteriores.
  { key: 'saldo', label: 'Saldo', format: 'money', width: 132 },
  { key: 'meses_con_movimiento', label: 'Meses', align: 'right', width: 74 },
]

export default async function SociosPage() {
  const supabase = await createClient()

  const [listaRes, kpiRes] = await Promise.all([
    supabase.from('v_socio_lista').select('*').order('socio'),
    // Una fila siempre, también sin socios: es una agregación sin group by.
    supabase.from('v_socio_kpi').select('*').maybeSingle(),
  ])

  const error = listaRes.error ?? kpiRes.error
  const kpi = kpiRes.data

  const filas: FilaSocio[] = (listaRes.data ?? []).map((s: FilaLista) => ({
    socio_id: s.socio_id!,
    socio: s.socio,
    estado: estadoSocio(s.estado),
    sueldo_vigente: s.sueldo_vigente,
    devengado: s.devengado,
    retirado: s.retirado,
    saldo: s.saldo,
    meses_con_movimiento: s.meses_con_movimiento,
  }))

  const enContra = kpi?.socios_en_contra ?? 0
  const sinSueldo = kpi?.socios_sin_sueldo ?? 0

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Socios</h1>
        <p className="mt-1 text-[12px] text-muted">
          Un socio por fila, con su sueldo vigente y su cuenta. El detalle abre el mes a mes: lo
          devengado, lo retirado y el saldo al cierre de cada período.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {/* minmax de 200 y no de 220 como sponsors: son CINCO tarjetas y no
          cuatro, y con 220 la quinta cae sola a una segunda fila. A 200 entran
          las cinco en una línea en pantalla ancha, y siguen envolviendo bien
          cuando no hay lugar.

          Los cinco números vienen de v_socio_kpi, que suma v_socio_lista: la
          MISMA fuente que la tabla de abajo, así que el encabezado y las filas
          no pueden discrepar. Sin la vista esto sería sumar la columna en el
          front —lo que la regla 1 prohíbe—, y por eso la pantalla vieja
          directamente no mostraba ningún total entre socios. */}
      <div className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <KpiCard
          tono="neutro"
          titulo="Sueldo mensual"
          valor={kpi?.sueldo_mensual ?? 0}
          icon="socios"
          subtitulo={
            sinSueldo > 0
              ? `${kpi?.socios ?? 0} socios · ${sinSueldo} sin sueldo acordado`
              : `${kpi?.socios ?? 0} socios · ${kpi?.socios_activos ?? 0} activos`
          }
        />
        <KpiCard
          tono="neutro"
          titulo="Devengado"
          valor={kpi?.devengado ?? 0}
          icon="monedas"
          subtitulo="Acumulado de todos los meses"
        />
        <KpiCard
          tono="info"
          titulo="Retirado"
          valor={kpi?.retirado ?? 0}
          icon="banco"
          subtitulo="Plata que ya salió"
        />
        {/* Los dos saldos van SEPARADOS y no neteados, igual que en la vista.
            Que el club le deba $3.400.000 a uno y que otro le deba $450.000 no
            es lo mismo que un neto de $2.950.000: son dos movimientos de plata
            en direcciones opuestas, y cada uno es una conversación distinta.
            El neto se lee restando; las dos mitades de un neto no se recuperan. */}
        <KpiCard
          tono="positivo"
          titulo="A favor de los socios"
          valor={kpi?.saldo_a_favor ?? 0}
          icon="monedas"
          subtitulo="Devengado y todavía no retirado"
        />
        <KpiCard
          tono={enContra > 0 ? 'alerta' : 'neutro'}
          titulo="Retirado de más"
          valor={kpi?.saldo_en_contra ?? 0}
          icon="alerta"
          subtitulo={
            enContra > 0
              ? `${enContra} ${enContra === 1 ? 'socio se adelantó' : 'socios se adelantaron'}`
              : 'Nadie retiró de más'
          }
        />
      </div>

      {/* Sin fila de total: los totales ya están arriba, en los KpiCards, con
          los mismos números y la misma fuente. Repetirlos abajo es ruido. */}
      <DataTable
        columns={COLUMNAS}
        rows={filas}
        rowKey="socio_id"
        rowHref={(f) => `/socios/${f.socio_id}`}
        maxHeight={560}
        emptyMessage="No hay socios cargados."
      />
    </div>
  )
}
