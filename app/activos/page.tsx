import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { formatPorcentaje } from '@/lib/format'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { Button, DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaActivo = Database['public']['Views']['v_activo']['Row']

/**
 * Las cinco del `check` de `activo.categoria`. Se listan a mano porque son un
 * dominio cerrado del schema, no datos: si mañana se agrega una, el `check`
 * falla primero y esto se actualiza con él.
 */
const CATEGORIAS = [
  { valor: 'herramientas', label: 'Herramientas' },
  { valor: 'maquinaria', label: 'Maquinaria' },
  { valor: 'equipamiento_bar', label: 'Equipamiento de bar' },
  { valor: 'infraestructura', label: 'Infraestructura' },
  { valor: 'otro', label: 'Otro' },
]

const ROTULO_CATEGORIA: Record<string, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.valor, c.label]),
)

interface Fila {
  activo_id: string
  nombre: string | null
  categoria: string | null
  predio: string | null
  valor_origen: number | null
  /** Ya formateado: `DataTable` no tiene formato porcentaje, y la regla 2 pide
      formatear en el punto de renderizado. El VALOR sale de la vista. */
  avance: string
  residual: number | null
  estado: CeldaBadge
}

const COLUMNAS: ColumnDef<Fila>[] = [
  { key: 'nombre', label: 'Activo' },
  { key: 'categoria', label: 'Categoría', width: 152 },
  { key: 'predio', label: 'Predio', width: 92 },
  { key: 'valor_origen', label: 'Valor de origen', format: 'money', width: 142 },
  // El avance va entre el valor y el residual porque es lo que explica la
  // diferencia entre los dos: cuánto de ese valor ya se consumió.
  { key: 'avance', label: 'Amortizado', align: 'right', width: 116 },
  { key: 'residual', label: 'Residual', format: 'money', width: 132 },
  { key: 'estado', label: 'Estado', format: 'badge', width: 104 },
]

export default async function ActivosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; predio?: string; estado?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  // El default es `activo`: los dados de baja existen y se pueden ver, pero no
  // son el caso frecuente y ensuciarían la posición actual.
  //
  // Se compara contra `undefined` y no con `??`: cadena vacía es el "Todos" del
  // filtro, y con `??` esa elección se perdería —el parámetro está, vale ''— y
  // volvería a filtrar por activo.
  const estado = params.estado === undefined ? 'activo' : params.estado

  let query = supabase.from('v_activo').select('*')
  if (params.categoria) query = query.eq('categoria', params.categoria)
  if (params.predio) query = query.eq('predio', params.predio)
  if (estado) query = query.eq('estado', estado)

  const [listaRes, kpiRes, prediosRes] = await Promise.all([
    query.order('nombre'),
    // Una fila siempre, también sin activos: es una agregación sin group by.
    supabase.from('v_activo_kpi').select('*').maybeSingle(),
    supabase.from('predio').select('codigo').order('codigo'),
  ])

  const error = listaRes.error ?? kpiRes.error
  const kpi = kpiRes.data

  const filas: Fila[] = (listaRes.data ?? []).map((a: FilaActivo) => ({
    activo_id: a.activo_id!,
    nombre: a.nombre,
    categoria: a.categoria ? (ROTULO_CATEGORIA[a.categoria] ?? a.categoria) : null,
    predio: a.predio,
    valor_origen: a.valor_origen,
    avance: formatPorcentaje(a.avance_pct ?? 0),
    residual: a.residual,
    estado:
      a.estado === 'baja'
        ? { estado: 'neutro', label: 'De baja' }
        : { estado: 'ok', label: 'Activo' },
  }))

  const filtros: FiltroUrl[] = [
    {
      parametro: 'categoria',
      label: 'Categoría',
      todos: 'Todas',
      opciones: CATEGORIAS,
    },
    {
      parametro: 'predio',
      label: 'Predio',
      todos: 'Todos',
      opciones: (prediosRes.data ?? []).map((p) => ({ valor: p.codigo, label: p.codigo })),
    },
    {
      parametro: 'estado',
      label: 'Estado',
      // El "sin filtrar" de este control ES ver todos, y por eso su opción vacía
      // se llama así. Pero el default de la pantalla es `activo`, así que
      // `valorPorDefecto` lo refleja: sin el parámetro en la URL el select tiene
      // que decir "Activos", que es lo que la tabla está mostrando.
      todos: 'Todos',
      opciones: [
        { valor: 'activo', label: 'Activos' },
        { valor: 'baja', label: 'De baja' },
      ],
      valorPorDefecto: 'activo',
    },
  ]

  const sinCompra = kpi?.sin_compra ?? 0
  const hayActivos = (kpi?.activos ?? 0) + (kpi?.dados_de_baja ?? 0) > 0

  return (
    <div className="pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Activos</h1>
          <p className="mt-1 text-[12px] text-muted">
            Los bienes del club y cuánto queda por amortizar de cada uno. La compra no toca el
            resultado —cambia un activo por otro—; lo que impacta el P&amp;L es la cuota mensual.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/activos/amortizar">
            <Button variant="secondary">Asentar amortización</Button>
          </Link>
          <Link href="/activos/nuevo">
            <Button>Dar de alta un activo</Button>
          </Link>
        </div>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {/* Los tres números salen de v_activo_kpi, que agrega la MISMA vista que
          la tabla de abajo: el encabezado y las filas no pueden discrepar.
          Sumar la columna en el front es lo que la regla 1 prohíbe. */}
      <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <KpiCard
          tono="neutro"
          titulo="En activos"
          valor={kpi?.en_activos ?? 0}
          icon="caja"
          subtitulo={`${kpi?.activos ?? 0} ${(kpi?.activos ?? 0) === 1 ? 'bien' : 'bienes'} en uso`}
        />
        <KpiCard
          tono="info"
          titulo="Amortizado"
          valor={kpi?.amortizado ?? 0}
          icon="monedas"
          subtitulo={
            (kpi?.cuota_mensual_total ?? 0) > 0
              ? `${kpi?.avance_pct ?? 0}% del valor de origen`
              : 'Todavía no se amortizó nada'
          }
        />
        <KpiCard
          tono="positivo"
          titulo="Residual"
          valor={kpi?.residual ?? 0}
          icon="banco"
          subtitulo="Lo que queda por amortizar"
        />
      </div>

      {/* El aviso sólo aparece si hay algo que avisar. Un activo dado de alta
          sin su compra cargada no está mal —el alta del bien y la carga de la
          compra son dos pasos— pero no debería quedarse así: hasta que el gasto
          no entra, el bien no existe en BIENES_USO. */}
      {sinCompra > 0 && (
        <p className="mb-6 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
          <strong className="font-bold">
            {sinCompra === 1
              ? 'Un activo sin compra registrada.'
              : `${sinCompra} activos sin compra registrada.`}
          </strong>{' '}
          El bien está dado de alta pero su compra todavía no se cargó como gasto, así que no figura
          en Bienes de uso ni se puede amortizar. Se carga desde Gastos, con una categoría de
          inversión.
        </p>
      )}

      {hayActivos && (
        <div className="mb-4">
          <FiltrosUrl filtros={filtros} />
        </div>
      )}

      {/* Entrega vacía: sin activos NO se muestra una tabla vacía con filtros
          arriba, que es lo que hace parecer que algo se rompió. Se muestra qué
          es esto y cómo empezar. */}
      {!error && !hayActivos ? (
        <div className="rounded-md border border-line bg-white px-4 py-12 text-center">
          <p className="text-[13px] font-bold text-ink">Todavía no hay activos cargados</p>
          <p className="mx-auto mt-2 max-w-[52ch] text-[11px] text-muted">
            Un activo es un bien que dura y se amortiza mes a mes en vez de impactar entero en el
            mes que se compra: una desmalezadora, unos arcos, una heladera. Por debajo de{' '}
            <strong className="font-semibold">$500.000</strong> conviene cargarlo como gasto común.
          </p>
          <div className="mt-5 flex justify-center">
            <Link href="/activos/nuevo">
              <Button>Registrá el primer activo</Button>
            </Link>
          </div>
        </div>
      ) : (
        <DataTable
          columns={COLUMNAS}
          rows={filas}
          rowKey="activo_id"
          rowHref={(f) => `/activos/${f.activo_id}`}
          maxHeight={560}
          emptyMessage="Ningún activo coincide con estos filtros."
        />
      )}

      {hayActivos && (
        <p className="mt-4 text-[11px] text-muted">
          El detalle de cada uno abre su plan de amortización.{' '}
          <Link href="/gastos" className="font-semibold text-blue-d hover:underline">
            La compra se carga desde Gastos
          </Link>
          , con una categoría de naturaleza inversión.
        </p>
      )}
    </div>
  )
}
