import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { KpiCard } from '@/components/ui'
import EditorPresupuesto, { type AmbitoPresupuesto, type LineaPresupuesto } from './EditorPresupuesto'
import VsReal, { type FilaAnual, type FilaKpi, type FilaMes } from './VsReal'
import type { Database } from '@/lib/db/database.types'

/**
 * Presupuesto · la pantalla de carga.
 *
 * Es la palanca del estimado: cada línea de acá se multiplica por el calendario
 * en `v_cashflow_estimado` y se convierte en los egresos proyectados de
 * `/proyeccion`. Editar un número acá mueve la curva de caja de todo el año.
 *
 * Lee de dos vistas y ninguna suma en el front (regla 1): `v_presupuesto_ambito`
 * da el encabezado de cada sección —estado, cuántas líneas, cuánto suma— y
 * `v_presupuesto_total` el detalle línea por línea con su `factor` ya resuelto.
 *
 * El «vs real» NO está acá: es otra pantalla (PR4) y necesita decidir antes cómo
 * se compara un presupuesto sin fecha contra un gasto que sí la tiene.
 */

/** El primer día del mes corriente en Córdoba, para el corte del vs-real. */
function hoyCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

type FilaAmbito = Database['public']['Views']['v_presupuesto_ambito']['Row']
type FilaLinea = Database['public']['Views']['v_presupuesto_linea']['Row']

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; corte?: string; tabla?: string }>
}) {
  const params = await searchParams
  const vista = params.vista === 'vs-real' ? 'vs-real' : 'carga'
  const corte = params.corte === 'todo' ? 'todo' : 'hasta_hoy'
  const tabla = params.tabla === 'anual' ? 'anual' : 'mensual'

  const hrefCon = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const base: Record<string, string | null> = {
      vista: vista === 'carga' ? null : vista,
      corte: corte === 'hasta_hoy' ? null : corte,
      tabla: tabla === 'mensual' ? null : tabla,
      ...extra,
    }
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v)
    const q = p.toString()
    return q ? `/presupuesto?${q}` : '/presupuesto'
  }

  const supabase = await createClient()

  const [ambitosRes, lineasRes, catsRes, torneosRes, ejerciciosRes, sinPresupuestarRes] =
    await Promise.all([
      supabase.from('v_presupuesto_ambito').select('*').order('es_estructura'),
      // El detalle sale de v_presupuesto_linea y NO de v_presupuesto_total:
      // aquélla filtra `estado = 'aprobado'` —correcto para el cashflow— y esta
      // pantalla existe para editar BORRADORES. Leyendo la filtrada, un
      // borrador mostraba «2 líneas» en el encabezado y «sin líneas» en la
      // tabla, en el mismo bloque.
      supabase.from('v_presupuesto_linea').select('*'),
      supabase.from('cat_gasto').select('id, nombre, area, unidad_default').eq('activo', true).order('nombre'),
      supabase.from('torneo').select('id, nombre').order('anio', { ascending: false }),
      supabase.from('ejercicio').select('id, anio').order('anio', { ascending: false }),
      // El conteo lo hace la base, no el front: `head` no trae filas.
      supabase.from('cat_gasto').select('id', { count: 'exact', head: true }).eq('activo', true),
    ])

  const [kpiRes, mesRes, anualRes] =
    vista === 'vs-real'
      ? await Promise.all([
          supabase.from('v_presupuesto_vs_real_kpi').select('*'),
          supabase.from('v_presupuesto_vs_real').select('*').order('mes').order('categoria'),
          supabase.from('v_presupuesto_vs_real_anual').select('*').order('estado').order('categoria'),
        ])
      : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]

  const error =
    ambitosRes.error ?? lineasRes.error ?? catsRes.error ?? torneosRes.error ?? ejerciciosRes.error

  const ambitos = (ambitosRes.data ?? []) as FilaAmbito[]
  const lineas = (lineasRes.data ?? []) as FilaLinea[]
  const cats = catsRes.data ?? []

  // Cuántas categorías activas NO tienen ninguna línea. Es un conteo sobre dos
  // listas ya traídas —no un total de dinero— y sirve para el aviso de cobertura.
  const conLinea = new Set(lineas.map((l) => l.cat_gasto_id))
  const sinPresupuestar = cats.filter((c) => !conLinea.has(c.id)).length
  const totalCategorias = sinPresupuestarRes.count ?? cats.length

  const secciones: AmbitoPresupuesto[] = ambitos.map((a) => ({
    presupuesto_id: a.presupuesto_id!,
    ambito: a.ambito ?? '—',
    es_estructura: !!a.es_estructura,
    estado: a.estado ?? 'borrador',
    anio: a.anio ?? 0,
    lineas: a.lineas ?? 0,
    total: a.total ?? 0,
    // Se cuenta sobre el detalle y NO sobre `a.lineas_sin_calendario`: esa
    // columna se calcula contra v_presupuesto_total, que excluye borradores, y
    // justo un borrador es donde más importa avisar que el factor da 0. Es un
    // CONTEO de filas ya traídas, no un total de dinero.
    lineas_sin_calendario: 0,
    detalle: lineas
      .filter((l) => l.presupuesto_id === a.presupuesto_id)
      .map(
        (l): LineaPresupuesto => ({
          id: l.id!,
          cat_gasto_id: l.cat_gasto_id!,
          categoria: cats.find((c) => c.id === l.cat_gasto_id)?.nombre ?? '—',
          base: l.base ?? 0,
          cantidad: l.cantidad ?? 0,
          unidad: l.unidad ?? null,
          unidad_linea: l.unidad_linea ?? null,
          factor: l.factor ?? 0,
          total: l.total_presupuestado ?? 0,
        }),
      )
      .sort((a, b) => (b.total ?? 0) - (a.total ?? 0)),
  })).map((s) => ({ ...s, lineas_sin_calendario: s.detalle.filter((l) => l.factor === 0).length }))

  // Los ámbitos que TODAVÍA no tienen presupuesto, para ofrecer crearlo.
  const conPresupuesto = new Set(ambitos.map((a) => a.torneo_id))
  const torneosSinPresupuesto = (torneosRes.data ?? []).filter((t) => !conPresupuesto.has(t.id))
  const faltaEstructura = !ambitos.some((a) => a.es_estructura)

  return (
    <div className="pb-10">
      <header className="mb-5">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Presupuesto</h1>
        <p className="mt-1 max-w-[82ch] text-[12px] text-muted">
          Lo que se planea gastar, por categoría. Cada línea se multiplica por el calendario —
          partidos, días de cancha o meses — y así entra a{' '}
          <Link href="/proyeccion" className="font-semibold text-blue-d hover:underline">
            Proyección
          </Link>{' '}
          como egreso estimado. <strong className="font-semibold">Sólo el aprobado proyecta:</strong>{' '}
          un borrador se puede armar tranquilo sin mover la caja.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {/* ── Los KPIs ───────────────────────────────────────────────────────
          Uno por ámbito, con su total ya resuelto por v_presupuesto_ambito.
          No hay un "total general" sumado acá: sumar los ámbitos sería
          exactamente el .reduce() que la regla 1 prohíbe, y además mezclaría
          un torneo con la estructura anual, que no se comparan. */}
      {secciones.length > 0 && (
        <div className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
          {secciones.map((s) => (
            <KpiCard
              key={s.presupuesto_id}
              tono={s.estado === 'aprobado' ? 'info' : 'neutro'}
              titulo={s.ambito}
              valor={s.total}
              icon={s.es_estructura ? 'banco' : 'proyeccion'}
              subtitulo={
                s.estado === 'aprobado'
                  ? `${s.lineas} ${s.lineas === 1 ? 'línea' : 'líneas'} · proyectando`
                  : `${s.lineas} ${s.lineas === 1 ? 'línea' : 'líneas'} · en borrador, no proyecta`
              }
            />
          ))}
        </div>
      )}

      {/* ── Cobertura ──────────────────────────────────────────────────────
          Un aviso, no un error: presupuestar todo no es obligatorio. Pero lo
          que no está presupuestado NO se proyecta, y sin decirlo la curva de
          /proyeccion se lee como completa cuando no lo está. */}
      {/* ── Las dos pestañas ────────────────────────────────────────────────
          Cargar y controlar son dos tareas con ritmos distintos: una se hace
          una vez por torneo, la otra se mira seguido. El estado va en la URL. */}
      <div className="mb-4 inline-flex rounded-md border border-line bg-white p-0.5">
        {(
          [
            ['carga', 'Carga'],
            ['vs-real', 'Vs real'],
          ] as const
        ).map(([v, label]) => (
          <Link
            key={v}
            href={hrefCon({ vista: v === 'carga' ? null : v, corte: null, tabla: null })}
            scroll={false}
            className={`rounded-[5px] px-4 py-1.5 text-[11px] font-bold transition ${
              vista === v ? 'bg-blue-d text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {vista === 'vs-real' ? (
        <VsReal
          kpis={(kpiRes.data ?? []) as FilaKpi[]}
          meses={(mesRes.data ?? []) as unknown as FilaMes[]}
          anual={(anualRes.data ?? []) as unknown as FilaAnual[]}
          corte={corte}
          tabla={tabla}
          mesActual={`${hoyCordoba().slice(0, 7)}-01`}
          hrefCon={hrefCon}
        />
      ) : (
      <>
      {sinPresupuestar > 0 && (
        <p className="mb-4 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
          <strong className="font-bold">
            {sinPresupuestar} de {totalCategorias} categorías sin presupuestar.
          </strong>{' '}
          Lo que no tiene línea no se proyecta: esos gastos van a aparecer en la caja sin haber
          estado en la previsión. No es obligatorio presupuestar todo — pero conviene saber qué
          queda afuera.
        </p>
      )}

      <EditorPresupuesto
        puedeEditar={puede(await rolActual(), 'presupuesto.editar')}
        secciones={secciones}
        categorias={cats.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          area: c.area,
          unidad_default: c.unidad_default,
        }))}
        torneosSinPresupuesto={torneosSinPresupuesto}
        faltaEstructura={faltaEstructura}
        ejercicios={(ejerciciosRes.data ?? []).map((e) => ({ id: e.id, anio: e.anio }))}
      />

      </>
      )}

      {vista === 'carga' && (
      <p className="mt-5 text-[11px] text-muted">
        El <strong className="font-semibold">factor</strong> —partidos, días de cancha o meses— no
        se edita: sale del calendario del torneo y del ejercicio. Se muestra para que se vea de
        dónde sale cada total, no sólo el resultado.
      </p>
      )}
    </div>
  )
}
