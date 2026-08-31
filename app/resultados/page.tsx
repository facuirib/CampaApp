import { createClient } from '@/lib/db/server'
import { formatMoney } from '@/lib/format'
import { MESES_LARGO } from '@/lib/domain/pl'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { KpiCard } from '@/components/ui'
import MatrizPL, { type FilaCuenta, type FilaTotal } from './MatrizPL'
import type { Database } from '@/lib/db/database.types'

type FilaPL = Database['public']['Views']['v_pl_mensual']['Row']
type FilaItem = Database['public']['Views']['v_pl_mensual_item']['Row']
type FilaTot = Database['public']['Views']['v_pl_mensual_total']['Row']

/**
 * Estado de resultados a nivel EMPRESA.
 *
 * No se parte por torneo, predio ni categoría: el negocio es unificado y la
 * estructura permanente no se prorratea (arquitectura.md §1.d). Por eso el
 * único filtro es el año — no hay selector de torneo, y no es un olvido.
 *
 * Ningún número de esta pantalla se calcula acá. La matriz sale de
 * `v_pl_mensual`, las filas de total de `v_pl_mensual_total` y el encabezado
 * de `v_pl_kpi`, que suma la anterior. Lo único que hace este archivo es
 * PIVOTAR —poner en un array de doce lo que viene como doce filas—, que es
 * acomodar, no sumar.
 */

/** Doce posiciones vacías: la fila existe aunque el mes no tenga movimiento. */
function doceMeses(): number[] {
  return Array.from({ length: 12 }, () => 0)
}

export default async function ResultadosPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>
}) {
  const { anio: anioParam } = await searchParams
  const supabase = await createClient()

  // Los años primero: de cuál depende todo lo demás, así que va solo.
  const aniosRes = await supabase
    .from('v_pl_kpi')
    .select('anio')
    .order('anio', { ascending: false })

  const anios = (aniosRes.data ?? []).map((a) => a.anio).filter((a): a is number => a != null)
  const anio = anioParam ? Number(anioParam) : (anios[0] ?? new Date().getFullYear())

  const [matrizRes, itemsRes, totalesRes, kpiRes] = await Promise.all([
    supabase.from('v_pl_mensual').select('*').eq('anio', anio).order('codigo'),
    supabase.from('v_pl_mensual_item').select('*').eq('anio', anio).order('item'),
    supabase.from('v_pl_mensual_total').select('*').eq('anio', anio).order('mes'),
    supabase.from('v_pl_kpi').select('*').eq('anio', anio).maybeSingle(),
  ])

  const error =
    aniosRes.error ?? matrizRes.error ?? itemsRes.error ?? totalesRes.error ?? kpiRes.error
  const kpi = kpiRes.data

  // ── Pivote ───────────────────────────────────────────────────────────────
  // Doce filas por cuenta se convierten en una fila con doce columnas. El
  // `total` NO se suma acá: se toma de la columna «Año», que sale de la propia
  // vista sumada por cuenta... y como la vista no la trae, se pide aparte.
  const itemsPorCuenta = new Map<string, Map<string, number[]>>()
  for (const it of (itemsRes.data ?? []) as FilaItem[]) {
    if (!it.codigo || !it.item || it.mes == null) continue
    const deLaCuenta = itemsPorCuenta.get(it.codigo) ?? new Map<string, number[]>()
    const meses = deLaCuenta.get(it.item) ?? doceMeses()
    meses[it.mes - 1] = Number(it.monto ?? 0)
    deLaCuenta.set(it.item, meses)
    itemsPorCuenta.set(it.codigo, deLaCuenta)
  }

  const porCuenta = new Map<string, FilaCuenta & { tipo: string }>()
  for (const f of (matrizRes.data ?? []) as FilaPL[]) {
    if (!f.codigo || f.mes == null) continue
    const actual = porCuenta.get(f.codigo) ?? {
      codigo: f.codigo,
      nombre: f.nombre ?? f.codigo,
      tipo: f.tipo ?? '',
      meses: doceMeses(),
      total: 0,
      items: [],
    }
    actual.meses[f.mes - 1] = Number(f.monto ?? 0)
    porCuenta.set(f.codigo, actual)
  }

  // El total del año de cada fila es la suma de sus doce meses. Es la única
  // suma de la pantalla, y es aritmética de presentación sobre datos que ya
  // vinieron calculados —no un total de negocio que una vista deba dar—.
  const cerrar = (f: FilaCuenta & { tipo: string }): FilaCuenta => {
    const items = [...(itemsPorCuenta.get(f.codigo) ?? new Map())]
      .map(([item, meses]) => ({
        item,
        meses,
        total: meses.reduce((a: number, b: number) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total)

    return {
      codigo: f.codigo,
      // J1 · «Ingresos bar», «Ingresos por partidos», «Ingresos sponsors»…
      // debajo de un bloque que YA se titula Ingresos. La palabra se repite
      // cuatro veces y no distingue nada: lo que distingue es lo que viene
      // después. Se saca del rótulo, no del nombre de la cuenta — el plan de
      // cuentas sigue diciendo «Ingresos por partidos», que es como se llama.
      nombre: f.nombre.replace(/^Ingresos\s+(por\s+)?/i, (m, _p, off) =>
        off === 0 ? '' : m,
      ) || f.nombre,
      meses: f.meses,
      total: f.meses.reduce((a, b) => a + b, 0),
      items,
    }
  }

  const todas = [...porCuenta.values()]
  // Las cuentas sin un solo movimiento en el año no se muestran: doce ceros y
  // un nombre no informan nada, y con siete cuentas de egreso vacías la matriz
  // sería mayormente blanca. Los MESES en cero sí se muestran —esa era la
  // decisión—; una CUENTA en cero todo el año es otra cosa.
  const conMovimiento = (f: FilaCuenta & { tipo: string }) => f.meses.some((m) => m !== 0)

  const ingresos = todas.filter((f) => f.tipo === 'ingreso' && conMovimiento(f)).map(cerrar)
  const egresos = todas.filter((f) => f.tipo === 'egreso' && conMovimiento(f)).map(cerrar)
  const financieros = todas.filter((f) => f.tipo === 'financiero' && conMovimiento(f)).map(cerrar)

  // ── Las filas de total, desde la vista ───────────────────────────────────
  const totIngresos = doceMeses()
  const totEgresos = doceMeses()
  const totResultado = doceMeses()
  for (const t of (totalesRes.data ?? []) as FilaTot[]) {
    if (t.mes == null) continue
    totIngresos[t.mes - 1] = Number(t.ingresos ?? 0)
    totEgresos[t.mes - 1] = Number(t.egresos ?? 0)
    totResultado[t.mes - 1] = Number(t.resultado ?? 0)
  }

  const totalIngresos: FilaTotal = {
    label: 'Total ingresos',
    meses: totIngresos,
    total: Number(kpi?.ingresos_cobrados ?? 0),
  }
  const totalEgresos: FilaTotal = {
    label: 'Total egresos',
    meses: totEgresos,
    total: Number(kpi?.egresos ?? 0),
  }
  const resultado: FilaTotal = {
    label: 'Resultado',
    meses: totResultado,
    total: Number(kpi?.resultado ?? 0),
  }

  const margen = kpi?.margen_pct == null ? null : Number(kpi.margen_pct)
  const resultadoTotal = Number(kpi?.resultado ?? 0)
  const financiero = Number(kpi?.resultado_financiero ?? 0)

  const FILTROS: FiltroUrl[] = [
    {
      parametro: 'anio',
      label: 'Año',
      todos: 'Año…',
      valorPorDefecto: String(anio),
      opciones: anios.map((a) => ({ valor: String(a), label: String(a) })),
    },
  ]

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Resultados</h1>
        <p className="mt-1 text-[12px] text-muted">
          Estado de resultados de la empresa, mes a mes.{' '}
          <strong className="font-semibold text-ink">Los ingresos son percibidos</strong> —entran al
          cobrar— y <strong className="font-semibold text-ink">los gastos devengados</strong> —al
          cargarlos, se hayan pagado o no—. Es deliberado, y por eso el resultado no coincide con la
          caja.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      <FiltrosUrl filtros={FILTROS} />

      {/* Los cuatro salen de v_pl_kpi, que suma v_pl_mensual_total: la MISMA
          fuente que las filas de total de la matriz. No pueden discrepar. */}
      <div className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        <KpiCard
          tono="positivo"
          titulo="Ingresos cobrados"
          valor={Number(kpi?.ingresos_cobrados ?? 0)}
          icon="monedas"
          subtitulo="Percibido: lo que entró"
        />
        <KpiCard
          tono="neutro"
          titulo="Egresos"
          valor={Number(kpi?.egresos ?? 0)}
          icon="comprobante"
          subtitulo="Devengado: cargado, pagado o no"
        />
        <KpiCard
          tono={resultadoTotal >= 0 ? 'positivo' : 'alerta'}
          titulo="Resultado"
          valor={resultadoTotal}
          icon="resultados"
          subtitulo={
            financiero === 0
              ? 'Ingresos menos egresos'
              : `Incluye ${formatMoney(financiero)} de resultado financiero`
          }
        />
        <KpiCard
          tono={margen == null ? 'neutro' : margen >= 0 ? 'positivo' : 'alerta'}
          titulo="Margen"
          valor={margen}
          formato="porcentaje"
          icon="proyeccion"
          subtitulo={margen == null ? 'Sin ingresos en el año' : 'Del resultado sobre lo cobrado'}
        />
      </div>

      {ingresos.length === 0 && egresos.length === 0 && financieros.length === 0 ? (
        <div className="rounded-md border border-line bg-white px-4 py-10 text-center text-[11px] text-muted">
          {anio} no tiene movimientos de resultado.
        </div>
      ) : (
        <MatrizPL
          ingresos={ingresos}
          egresos={egresos}
          financieros={financieros}
          totalIngresos={totalIngresos}
          totalEgresos={totalEgresos}
          resultado={resultado}
          hayFinancieros={financieros.length > 0}
        />
      )}

      <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
        Las cuentas sin un solo movimiento en el año no se listan. Los meses en cero sí se muestran:
        un mes flojo es un dato.
        {kpi?.mejor_mes != null && <> El mejor mes fue {MESES_LARGO[kpi.mejor_mes - 1]}.</>}
      </p>
    </div>
  )
}
