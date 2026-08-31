import Link from 'next/link'
import ColasAviso from './ColasAviso'
import { createClient } from '@/lib/db/server'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaDeuda = Database['public']['Views']['v_deuda_equipo']['Row']
type FilaDeudaTorneo = Database['public']['Views']['v_deuda_equipo_torneo']['Row']

interface Deudor {
  tercero_id: string
  equipo: string | null
  estado: CeldaBadge
  deuda_vencida: number | null
  deuda_total: number | null
  vencimiento_mas_antiguo: string | null
  /**
   * Cuántos torneos, o cuántas cuotas.
   *
   * Sin filtro la pregunta útil es "¿en cuántos torneos debe?" —lo que avisa
   * que el reclamo es por más de una cosa—. Filtrando por uno, ese número es
   * siempre 1 y no dice nada: ahí lo que ubica el tamaño del reclamo es cuántas
   * cuotas quedan. Es la misma columna con dos preguntas, y por eso el rótulo
   * también cambia.
   */
  contexto: number | null
  saldo_a_favor: number | null
  email: string | null
}

/**
 * El estado de un deudor.
 *
 * `v_deuda_equipo` NO trae columna de estado: lista importes por equipo, no
 * situaciones de cuota. Así que el badge se deriva de si hay o no deuda
 * vencida. Es una comparación para elegir un color y un rótulo, no un total
 * calculado — los importes que se ven en las columnas siguen siendo los de la
 * vista, sin tocar.
 *
 * El mapa de estados de cuota (al_dia, pagada, por_vencer, vencida,
 * parcial_vencida) corresponde a `v_deuda_detalle`, que es por cuota. Va a
 * usarse en la pantalla de detalle, que es donde esas filas existen.
 */
function estadoDeudor(vencida: number | null, aFavor: number | null): CeldaBadge {
  if ((vencida ?? 0) > 0) return { estado: 'mora', label: 'En mora' }
  if ((aFavor ?? 0) > 0) return { estado: 'info', label: 'Con anticipo' }
  return { estado: 'porVencer', label: 'Por vencer' }
}

function columnas(filtrado: boolean): ColumnDef<Deudor>[] {
  return [
    { key: 'equipo', label: 'Equipo' },
    { key: 'estado', label: 'Estado', format: 'badge' },
    { key: 'deuda_vencida', label: 'Vencida', format: 'money', width: 118 },
    { key: 'deuda_total', label: 'Deuda total', format: 'money', width: 128 },
    { key: 'vencimiento_mas_antiguo', label: 'Vence desde', format: 'date', width: 108 },
    { key: 'contexto', label: filtrado ? 'Cuotas' : 'Torneos', align: 'right', width: 76 },
    { key: 'saldo_a_favor', label: 'A favor', format: 'money', width: 108 },
    { key: 'email', label: 'Email' },
  ]
}

/**
 * Las dos vistas de la cobranza, en la URL como en /proyeccion.
 *
 * «Cuenta corriente» es el panorama: cuánto se debe y quién. «Avisos» es el
 * trabajo del día: a quién le toca qué mensaje. Los mismos equipos mirados con
 * dos preguntas distintas — cuánto debe cada uno, y a quién hay que hablarle
 * hoy.
 */
const VISTAS = [
  { vista: 'cuenta', label: 'Cuenta corriente' },
  { vista: 'avisos', label: 'Avisos' },
] as const

type Vista = (typeof VISTAS)[number]['vista']

function Pestanas({ activa, torneo }: { activa: Vista; torneo?: string }) {
  return (
    <div className="mb-5 inline-flex gap-1 rounded-md bg-line2 p-1" role="tablist">
      {VISTAS.map((v) => {
        const esActiva = v.vista === activa
        // El filtro de torneo se arrastra: es del panorama, y perderlo al
        // volver de Avisos obligaría a elegirlo de nuevo.
        const qs = new URLSearchParams()
        if (v.vista !== 'cuenta') qs.set('vista', v.vista)
        if (torneo) qs.set('torneo', torneo)
        const q = qs.toString()
        return (
          <Link
            key={v.vista}
            href={q ? `/cobranza?${q}` : '/cobranza'}
            role="tab"
            aria-selected={esActiva}
            className={[
              'rounded-sm px-3 py-1 text-[11px] font-bold transition-colors',
              esActiva ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {v.label}
          </Link>
        )
      })}
    </div>
  )
}

export default async function CobranzaPage({
  searchParams,
}: {
  searchParams: Promise<{ torneo?: string; vista?: string }>
}) {
  const { torneo: torneoElegido, vista } = await searchParams
  const activa: Vista = vista === 'avisos' ? 'avisos' : 'cuenta'
  const supabase = await createClient()

  // ── La pestaña Avisos ──────────────────────────────────────────────────
  //
  // Sale temprano y con su propia consulta: no comparte NADA con el panorama.
  // El filtro por torneo, por ejemplo, no aplica acá — el aviso se le manda al
  // equipo con todo lo que arrastre, que es el concepto 5.
  if (activa === 'avisos') {
    const [colaRes, cfgRes] = await Promise.all([
      supabase.from('v_cobranza_cola').select('*').order('total_adeudado', { ascending: false }),
      supabase.from('config_cobranza').select('*').eq('id', true).maybeSingle(),
    ])

    return (
      <div className="pb-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Cobranza</h1>
            <p className="mt-1 text-[12px] text-muted">
              A quién le toca un aviso hoy, y de qué tono.
            </p>
          </div>
          <Link
            href="/cobranza/avisos/historial"
            className="shrink-0 text-[11px] font-semibold text-blue-d hover:underline"
          >
            Historial de avisos →
          </Link>
        </header>

        <Pestanas activa={activa} torneo={torneoElegido} />

        {colaRes.error && (
          <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
            {colaRes.error.message}
          </p>
        )}

        <ColasAviso filas={colaRes.data ?? []} ventanas={cfgRes.data ?? null} />
      </div>
    )
  }

  const [torneosRes, kpis] = await Promise.all([
    supabase.from('torneo').select('id, nombre, estado, activo').order('anio', { ascending: false }),
    // La misma vista que alimentaba /cobranza/kpis, ahora acá.
    supabase.from('v_cobranza_kpi').select('*').order('nombre'),
  ])

  const torneos = torneosRes.data ?? []
  // `v_torneo_actual` y no `find(t => t.activo)`: «cuál es el actual» tiene UNA
  // definición, en la base. La regla estaba copiada acá y en el tarifario, y las
  // dos copias envejecían por separado.
  const { data: actual } = await supabase.from('v_torneo_actual').select('id, nombre').maybeSingle()
  const activo = actual ?? null

  // ── De qué vista se lee ──────────────────────────────────────────────────
  //
  // Las dos contestan "cuánto debe este equipo", pero con grano distinto:
  //
  //   sin filtro → v_deuda_equipo, una fila por equipo con TODOS sus torneos
  //                sumados. Es la pregunta de quien reclama: la deuda es del
  //                equipo, no del torneo (concepto 5).
  //
  //   con filtro → v_deuda_equipo_torneo, una fila por equipo y torneo, con los
  //                montos RESTRINGIDOS a ese torneo.
  //
  // No alcanzaba con filtrar la primera: no tiene torneo_id, y agregárselo
  // habría filtrado las FILAS dejando los MONTOS totales. Un equipo que debe
  // $10.5M en Clausura y $11.1M en Apertura aparecería, filtrado por Clausura,
  // mostrando $21.6M — un número plausible y falso.
  const deudores = torneoElegido
    ? await supabase
        .from('v_deuda_equipo_torneo')
        .select('*')
        .eq('torneo_id', torneoElegido)
        .order('deuda_vencida', { ascending: false })
        .order('vencimiento_mas_antiguo', { ascending: true })
    : await supabase
        .from('v_deuda_equipo')
        .select('*')
        .order('deuda_vencida', { ascending: false })
        .order('vencimiento_mas_antiguo', { ascending: true })

  const error = deudores.error ?? kpis.error ?? torneosRes.error

  // `v_cobranza_kpi` da una fila por torneo. Se ELIGE la fila —la del torneo
  // filtrado, o la del que está en curso—, no se suman las filas.
  const kpi =
    kpis.data?.find((k) => k.torneo_id === (torneoElegido ?? activo?.id)) ?? kpis.data?.[0] ?? null

  const filas: Deudor[] = (deudores.data ?? []).map((f: FilaDeuda | FilaDeudaTorneo) => ({
    tercero_id: f.tercero_id!,
    equipo: f.equipo,
    estado: estadoDeudor(f.deuda_vencida, f.saldo_a_favor),
    deuda_vencida: f.deuda_vencida,
    deuda_total: f.deuda_total,
    vencimiento_mas_antiguo: f.vencimiento_mas_antiguo,
    contexto: 'torneos_con_deuda' in f ? f.torneos_con_deuda : f.cuotas_impagas,
    saldo_a_favor: f.saldo_a_favor,
    email: f.email,
  }))

  const FILTROS: FiltroUrl[] = [
    {
      parametro: 'torneo',
      label: 'Torneo',
      todos: 'Todos los torneos',
      opciones: torneos.map((t) => ({
        valor: t.id,
        label: t.estado === 'en_curso' ? `${t.nombre} (en curso)` : t.nombre,
      })),
    },
  ]

  const tasa = kpi?.tasa_cobranza ?? 0

  return (
    <div className="pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Deudores</h1>
        {/* Sin filtro, la TABLA trae la deuda de todos los torneos que cada
            equipo arrastre, pero los KpiCards son de UNO —`v_cobranza_kpi` es
            por torneo—. Antes el subtítulo decía sólo el nombre del torneo en
            curso, y con dos torneos cargados eso se lee como que la tabla es de
            ese torneo. Son dos alcances distintos en la misma pantalla y hay
            que decirlo, no elegir uno. */}
        <p className="mt-1 text-[12px] text-muted">
          {torneoElegido
            ? `${kpi?.nombre ?? 'Torneo'} — sólo la deuda de este torneo, ordenada por urgencia de reclamo.`
            : 'Todos los torneos que cada equipo arrastre, ordenados por urgencia de reclamo.'}
          {!torneoElegido && kpi?.nombre && <> Los indicadores de abajo son de {kpi.nombre}.</>}
        </p>
        </div>
        {/* El historial de avisos vivía colgado de /reclamos, que ya no existe.
            Va acá arriba y no como sección: es consulta, no la tarea del día. */}
        <Link
          href="/cobranza/avisos/historial"
          className="shrink-0 text-[11px] font-semibold text-blue-d hover:underline"
        >
          Historial de avisos →
        </Link>
      </header>

      <Pestanas activa={activa} torneo={torneoElegido} />

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      <FiltrosUrl filtros={FILTROS} />

      {/* Tres tajadas que NO se pisan: `por_vencer` y `vencido` son disjuntas
          entre sí, y la tasa es un porcentaje. Ninguna contiene a otra, así que
          cada rótulo nombra su tajada exacta y no insinúa un total. Los tres
          vienen calculados de v_cobranza_kpi: la pantalla no suma la columna
          de la tabla para llegar a ninguno. */}
      <div className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <KpiCard
          tono="info"
          titulo="Por vencer"
          valor={kpi?.por_vencer ?? 0}
          icon="calendario"
          subtitulo="Todavía no vencida"
        />
        <KpiCard
          tono="alerta"
          titulo="En mora"
          valor={kpi?.vencido ?? 0}
          icon="alerta"
          subtitulo="Vencida e impaga"
        />
        <KpiCard
          tono={tasa >= 50 ? 'positivo' : 'neutro'}
          titulo="Tasa de cobranza"
          valor={tasa}
          formato="entero"
          icon="monedas"
          subtitulo={
            kpi?.dias_promedio_cobro == null
              ? '% de lo comprometido, ya cobrado'
              : `% cobrado · ${kpi.dias_promedio_cobro} días promedio`
          }
        />
      </div>

      {/* Sin fila de total: ninguna vista da el total de exactamente lo que
          esta tabla lista. `v_cobranza_kpi` es por torneo y acá hay deuda de
          todos los torneos que cada equipo arrastre, así que un total pasado
          desde ahí sería otro número. Sumarlo en el front, peor.

          Y con filtro tampoco: `saldo_a_favor` es del EQUIPO y no del torneo
          —un anticipo no tiene torneo—, así que se repite en cada fila del
          equipo y sumar esa columna lo contaría de más. */}
      <DataTable
        columns={columnas(Boolean(torneoElegido))}
        rows={filas}
        rowKey="tercero_id"
        rowHref={(f) => `/equipos/${f.tercero_id}`}
        maxHeight={560}
        emptyMessage="Ningún equipo tiene deuda pendiente."
      />
    </div>
  )
}
