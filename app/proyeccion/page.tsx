import { createClient } from '@/lib/db/server'
import { formatDate } from '@/lib/format'
import { ChartArea, DataTable, KpiCard, type ColumnDef, type PuntoSerie } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaCashflow = Database['public']['Views']['v_cashflow']['Row']

interface FilaSemana {
  semana: string
  fecha: string | null
  entradas: number | null
  salidas: number | null
  flujo_neto: number | null
  saldo_proyectado: number | null
  tramo: string
}

const COLUMNAS: ColumnDef<FilaSemana>[] = [
  { key: 'fecha', label: 'Semana', format: 'date', width: 112 },
  { key: 'tramo', label: 'Tramo', width: 104 },
  { key: 'entradas', label: 'Entradas', format: 'money', width: 140 },
  { key: 'salidas', label: 'Salidas', format: 'money', width: 140 },
  { key: 'flujo_neto', label: 'Flujo neto', format: 'money', width: 140 },
  { key: 'saldo_proyectado', label: 'Saldo proyectado', format: 'money', width: 156 },
]

export default async function ProyeccionPage() {
  const supabase = await createClient()

  const [cashflowRes, cajaRes, conEgresosRes, bajoCeroRes] = await Promise.all([
    supabase.from('v_cashflow').select('*').not('semana', 'is', null).order('semana'),
    // El saldo de HOY sale de su propia vista, ya sumado: el front no calcula
    // totales (regla 1). No es lo mismo que saldo_proyectado, que es el saldo
    // al CIERRE de la semana e incluye lo comprometido todavía sin cobrar.
    supabase.from('v_saldo_caja_total').select('saldo_total').single(),
    // Cuántas semanas futuras tienen egresos. Es la BASE la que cuenta, con
    // `head: true` —no trae filas, sólo el número—: preguntar "¿hay egresos
    // proyectados?" recorriendo el array en el front sería el mismo cálculo
    // que la regla 1 saca de la pantalla, aunque el resultado sea un booleano.
    supabase
      .from('v_cashflow')
      .select('*', { count: 'exact', head: true })
      .eq('futura', true)
      .lt('salidas', 0),
    supabase
      .from('v_cashflow')
      .select('*', { count: 'exact', head: true })
      .lt('saldo_proyectado', 0),
  ])

  const error = cashflowRes.error ?? cajaRes.error ?? conEgresosRes.error ?? bajoCeroRes.error
  const filas = cashflowRes.data ?? []

  const saldoHoy = cajaRes.data?.saldo_total ?? 0
  const semanasConEgresos = conEgresosRes.count ?? 0
  const semanasBajoCero = bajoCeroRes.count ?? 0

  // Buscar la primera fila que cumple algo es filtrar, no calcular: el número
  // que se muestra sigue siendo el de su fila.
  const filaFinal = filas[filas.length - 1]
  const filaQuiebre = filas.find((f) => (f.saldo_proyectado ?? 0) < 0)

  const serie: PuntoSerie[] = filas.map((f: FilaCashflow) => ({
    fecha: f.semana ?? '',
    valor: f.saldo_proyectado ?? 0,
    proyectado: !!f.futura,
  }))

  const semanas: FilaSemana[] = filas.map((f: FilaCashflow, i: number) => ({
    semana: f.semana ?? String(i),
    fecha: f.semana,
    tramo: f.futura ? 'Proyectado' : 'Real',
    entradas: f.entradas,
    salidas: f.salidas,
    flujo_neto: f.flujo_neto,
    saldo_proyectado: f.saldo_proyectado,
  }))

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Proyección de caja</h1>
        <p className="mt-1 text-[12px] text-muted">
          Saldo semanal: real hasta hoy, estimado hacia adelante.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && filas.length === 0 && (
        <div className="rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted">
          Todavía no hay datos de flujo. La proyección aparece cuando se registren cuotas, cobros o
          presupuesto.
        </div>
      )}

      {filas.length > 0 && (
        <>
          {/* La advertencia se apaga sola en cuanto haya presupuesto cargado.
              Sin ella, una curva que sólo sube se lee como una proyección
              optimista y en realidad es una proyección INCOMPLETA: le faltan
              todos los egresos. Es la diferencia entre "vamos bien" y "no
              cargamos los gastos". */}
          {semanasConEgresos === 0 && (
            <p className="mb-6 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
              <strong className="font-bold">Proyección sin egresos presupuestados.</strong> Ninguna
              semana futura tiene gastos estimados, así que la curva refleja sólo los ingresos y el
              saldo proyectado es más alto de lo que va a ser. Se corrige cargando el presupuesto.
            </p>
          )}

          <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            <KpiCard
              tono="neutro"
              titulo="Saldo actual"
              valor={saldoHoy}
              icon="banco"
              subtitulo="Caja real, hoy"
            />
            <KpiCard
              tono={(filaFinal?.saldo_proyectado ?? 0) < 0 ? 'alerta' : 'info'}
              titulo="Saldo proyectado"
              valor={filaFinal?.saldo_proyectado ?? 0}
              icon="proyeccion"
              subtitulo={
                filaFinal?.semana ? `Al ${formatDate(filaFinal.semana)}` : 'A fin del rango'
              }
            />
            {/* El quiebre no es una fecha en el número grande sino un CONTEO:
                KpiCard muestra números, y "cuántas semanas quedan bajo cero"
                dice más que la primera fecha sola — que igual va de subtítulo. */}
            <KpiCard
              tono={semanasBajoCero > 0 ? 'alerta' : 'positivo'}
              titulo="Semanas bajo cero"
              valor={semanasBajoCero}
              formato="entero"
              icon="alerta"
              subtitulo={
                filaQuiebre?.semana
                  ? `La primera, el ${formatDate(filaQuiebre.semana)}`
                  : 'Sin quiebre proyectado'
              }
            />
          </div>

          {/* Sin envoltorio: ChartArea ya trae su propio marco —el mismo caso
              que DataTable dentro de Card—, y anidarlo dibuja dos bordes. */}
          <ChartArea className="mb-6" serie={serie} titulo="Saldo de caja proyectado por semana" />

          {/* Sin fila de total: `saldo_proyectado` es stock —cada semana ya
              contiene a las anteriores— y las columnas de flujo suman períodos
              reales y estimados mezclados, que no es un número que signifique
              nada. Lo que sí significa está arriba, en los KpiCards. */}
          <DataTable
            columns={COLUMNAS}
            rows={semanas}
            rowKey="semana"
            densidad="compacta"
            maxHeight={520}
            emptyMessage="Sin semanas para proyectar."
          />
        </>
      )}
    </div>
  )
}
