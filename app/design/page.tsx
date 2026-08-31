import {
  AsientoPreview,
  Badge,
  Button,
  Card,
  ChartArea,
  ChartBarras,
  ChartTorta,
  DataTable,
  Field,
  Input,
  KpiCard,
  KpiHero,
  Money,
  Select,
  Waterfall,
  type CeldaBadge,
  type ColumnDef,
  type LineaAsiento,
  type PasoWaterfall,
  type GajoTorta,
  type SerieBarras,
  type PuntoSerie,
  type ValorKpi,
} from '@/components/ui'

/**
 * Referencia visual del sistema de diseño.
 *
 * No es una pantalla del producto: es donde se mira si un componente quedó
 * bien antes de usarlo. Cada pieza aparece en todas sus variantes, incluidas
 * las que casi nunca se ven —deshabilitado, cargando, cifras negativas— que
 * son justo las que se rompen sin que nadie se entere.
 */

const MARCA = [
  ['--blue', 'Azul de marca'],
  ['--blue-d', 'Azul hover'],
  ['--night', 'Navy'],
  ['--flyway', 'Azul medio'],
  ['--regale', 'Azul claro'],
] as const

const ESTADOS = [
  ['--ok', '--okbg', '--oktx', 'Al día'],
  ['--warn', '--warnbg', '--warntx', 'Por vencer'],
  ['--err', '--errbg', '--errtx', 'Mora'],
] as const

const NEUTROS = [
  ['--ink', 'Texto'],
  ['--muted', 'Texto secundario'],
  ['--line', 'Borde'],
  ['--line2', 'Borde suave'],
  ['--bg', 'Fondo'],
] as const

const RADIOS = [
  ['--r-lg', '20px'],
  ['--r-md', '14px'],
  ['--r-sm', '10px'],
  ['--r-pill', '999px'],
] as const

// ── Datos de los ejemplos de DataTable ──────────────────────────────────────

interface FilaCobranza {
  id: string
  equipo: string
  estado: CeldaBadge
  vence: string
  deuda: number
}

const COL_COBRANZA: ColumnDef<FilaCobranza>[] = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'estado', label: 'Estado', format: 'badge' },
  { key: 'vence', label: 'Vence', format: 'date' },
  { key: 'deuda', label: 'Deuda', format: 'money', width: 120 },
]

const COBRANZA: FilaCobranza[] = [
  {
    id: '1',
    equipo: 'El Ciclón',
    estado: { estado: 'alDia', label: 'Al día' },
    vence: '2026-09-12',
    deuda: 0,
  },
  {
    id: '2',
    equipo: 'Escalera FC',
    estado: { estado: 'porVencer', label: 'Por vencer' },
    vence: '2026-08-28',
    deuda: 850000,
  },
  {
    id: '3',
    equipo: 'Delirio FC',
    estado: { estado: 'mora', label: 'En mora' },
    vence: '2026-07-15',
    deuda: 3050000,
  },
  {
    id: '4',
    equipo: 'Africa United +30',
    estado: { estado: 'mora', label: 'En mora' },
    vence: '2026-06-30',
    deuda: 4860000,
  },
]

interface FilaMovimiento {
  id: string
  fecha: string
  concepto: string
  medio: string
  importe: number
}

const COL_MOVIMIENTOS: ColumnDef<FilaMovimiento>[] = [
  { key: 'fecha', label: 'Fecha', format: 'date', width: 96 },
  { key: 'concepto', label: 'Concepto' },
  { key: 'medio', label: 'Medio' },
  { key: 'importe', label: 'Importe', format: 'money', width: 120 },
]

const MOVIMIENTOS: FilaMovimiento[] = [
  {
    id: '1',
    fecha: '2026-08-03',
    concepto: 'Cobro fecha 4',
    medio: 'Transferencia',
    importe: 1750000,
  },
  {
    id: '2',
    fecha: '2026-08-02',
    concepto: 'Alquiler de cancha',
    medio: 'Efectivo',
    importe: -420000,
  },
  {
    id: '3',
    fecha: '2026-08-01',
    concepto: 'Arbitraje fecha 4',
    medio: 'Efectivo',
    importe: -310000,
  },
]

interface FilaCuota {
  id: string
  equipo: string
  cuota: string
  vence: string
  monto: number
}

const COL_CUOTAS: ColumnDef<FilaCuota>[] = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'cuota', label: 'Cuota' },
  { key: 'vence', label: 'Vence', format: 'date' },
  { key: 'monto', label: 'Monto', format: 'money', width: 110 },
]

// Generadas, no al azar: el build tiene que dar siempre lo mismo.
const EQUIPOS_LARGO = [
  'El Ciclón',
  'Escalera FC',
  'Delirio FC',
  'Africa United +30',
  'La Sociedad',
  'Bazinga',
  'La Pausa',
  'Alfiado',
]

const CUOTAS: FilaCuota[] = Array.from({ length: 24 }, (_, i) => ({
  id: `c${i}`,
  equipo: EQUIPOS_LARGO[i % EQUIPOS_LARGO.length],
  cuota: `${(i % 3) + 1} de 3`,
  vence: `2026-0${(i % 4) + 6}-${String((i % 27) + 1).padStart(2, '0')}`,
  monto: 250000 + (i % 7) * 125000,
}))

// ── Asientos de ejemplo ─────────────────────────────────────────────────────

// Tal como los devuelve `preview_cobro` hoy: la cuenta viene como CÓDIGO.
const ASIENTO_COBRO: LineaAsiento[] = [
  { cuenta: 'CAJA_TRANSFERENCIA', debe: 525000 },
  { cuenta: 'ING_PARTIDOS', haber: 400000 },
  { cuenta: 'ING_INSCRIPCIONES', haber: 125000 },
]

// Con `nombre` resuelto: así se vería si la función de preview hiciera el join
// contra `cuenta`. Es el mismo componente, sin cambios.
const ASIENTO_GASTO: LineaAsiento[] = [
  { cuenta: 'GAS_ARBITRAJE', nombre: 'Arbitraje', debe: 310000 },
  { cuenta: 'PROVEEDORES_A_PAGAR', nombre: 'Proveedores a pagar', haber: 310000 },
]

const ASIENTO_LARGO: LineaAsiento[] = [
  { cuenta: 'CAJA_EFECTIVO', nombre: 'Caja Efectivo', debe: 1750000 },
  { cuenta: 'ING_PARTIDOS', nombre: 'Ingresos por partidos', haber: 900000 },
  { cuenta: 'ING_INSCRIPCIONES', nombre: 'Ingresos por inscripciones', haber: 500000 },
  { cuenta: 'ING_SPONSORS', nombre: 'Ingresos por sponsors', haber: 250000 },
  { cuenta: 'ING_BAR', nombre: 'Ingresos del bar', haber: 100000 },
]

// ── KPIs de ejemplo ─────────────────────────────────────────────────────────

// Serie de las últimas 7 fechas, para el sparkline. Fija, no al azar.
const SERIE_CAJA = [42, 45, 44, 51, 58, 56, 68]

const RESUMEN: ValorKpi[] = [
  { titulo: 'Resultado del torneo', valor: 81200000, tono: 'neutro' },
  { titulo: 'En caja', valor: 79700000, tono: 'info' },
  { titulo: 'Por cobrar', valor: 8760000, tono: 'alerta' },
]

// ── Series de ejemplo ───────────────────────────────────────────────────────

// 14 semanas: 8 reales y 6 proyectadas, como las devuelve v_cashflow.
const SALDOS = [
  4_200_000, 5_100_000, 4_800_000, 6_300_000, 7_900_000, 7_400_000, 9_100_000, 10_600_000,
  9_800_000, 11_200_000, 12_900_000, 12_100_000, 14_400_000, 16_800_000,
]

const SERIE_CAJA_SEM: PuntoSerie[] = SALDOS.map((valor, i) => ({
  fecha: `2026-0${Math.floor(i / 4) + 6}-${String((i % 4) * 7 + 1).padStart(2, '0')}`,
  valor,
  proyectado: i >= 8,
}))

// La misma forma pero con un quiebre de caja, para ver el tramo bajo cero.
const SERIE_QUIEBRE: PuntoSerie[] = [
  3_100_000, 2_200_000, 900_000, -600_000, -1_800_000, -900_000, 400_000, 2_600_000,
].map((valor, i) => ({
  fecha: `2026-0${Math.floor(i / 4) + 8}-${String((i % 4) * 7 + 1).padStart(2, '0')}`,
  valor,
  proyectado: i >= 4,
}))

// El puente cierra: 88,46 − 8,76 = 79,7. Los tres números de la decisión 6d no
// reconcilian entre sí (742,5 − 8,76 ≠ 79,7), y /design es documentación.
/** Composición de ingresos, con los colores por posición (categorías neutras). */
const GAJOS_INGRESO: GajoTorta[] = [
  { label: 'Partidos', valor: 18400000 },
  { label: 'Inscripciones', valor: 9200000 },
  { label: 'Sponsors', valor: 4100000 },
  { label: 'Bar', valor: 2350000 },
  { label: 'Otros ingresos', valor: 480000 },
]

/** El mismo gráfico con color SEMÁNTICO: acá el color dice algo. */
const GAJOS_ESTADO: GajoTorta[] = [
  { label: 'Al día', valor: 19, color: 'var(--ok)' },
  { label: 'Por vencer', valor: 5, color: 'var(--warn)' },
  { label: 'Vencido', valor: 4, color: 'var(--err)' },
]

/** Con cola larga: dispara el agrupado en «Otros». */
const GAJOS_LARGO: GajoTorta[] = [
  { label: 'Árbitros', valor: 4200000 },
  { label: 'Predio', valor: 3100000 },
  { label: 'Coordinación', valor: 1800000 },
  { label: 'Medicinal', valor: 900000 },
  { label: 'Tribunal', valor: 600000 },
  { label: 'Operativos', valor: 480000 },
  { label: 'Imprenta', valor: 220000 },
  { label: 'Limpieza', valor: 180000 },
  { label: 'Varios', valor: 90000 },
]

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago']

/** Ingresos vs gastos: el caso de `agrupadas`, y con meses en rojo. */
const SERIES_IVG: SerieBarras[] = [
  {
    label: 'Ingresos',
    color: 'var(--ok)',
    valores: [8200000, 9100000, 7400000, 11200000, 10050000, 6800000, 12400000, 9900000],
  },
  {
    label: 'Gastos',
    color: 'var(--err)',
    valores: [-6100000, -7300000, -9800000, -8400000, -7100000, -9200000, -8800000, -10050000],
  },
]

/** Deuda por antigüedad: el caso de `apiladas` — los tramos SÍ se suman. */
const SERIES_DEUDA: SerieBarras[] = [
  { label: 'Por vencer', color: 'var(--warn)', valores: [2400000, 1800000, 3100000, 900000] },
  { label: 'Vencido', color: 'var(--err)', valores: [1200000, 3400000, 800000, 2600000] },
]

const PUENTE: PasoWaterfall[] = [
  { titulo: 'Facturado', valor: 88_460_000, rol: 'suma' },
  { titulo: 'Por cobrar', valor: 8_760_000, rol: 'resta' },
  { titulo: 'En caja', valor: 79_700_000, rol: 'resultado' },
]

function Muestra({ token, nombre }: { token: string; nombre: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="size-9 shrink-0 rounded-sm border border-line"
        style={{ background: `var(${token})` }}
      />
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-bold text-ink">{nombre}</span>
        <span className="block truncate font-mono text-[10px] text-muted">{token}</span>
      </span>
    </div>
  )
}

/**
 * Un ejemplo con título, para lo que NO va adentro de una Card.
 *
 * El DataTable ya es su propio contenedor —borde, radio, overflow-hidden—,
 * así que envolverlo en Card da dos bordes. El título va arriba, no
 * envolviendo.
 */
function Ejemplo({
  titulo,
  aside,
  children,
}: {
  titulo: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[12.5px] font-extrabold tracking-[-.2px] text-ink">{titulo}</h3>
        {aside}
      </div>
      {children}
    </div>
  )
}

function Seccion({
  n,
  titulo,
  children,
}: {
  n: string
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-7">
      <h2 className="mb-3 flex items-baseline gap-2">
        <span className="font-mono text-[10px] font-bold text-blue">{n}</span>
        <span className="text-[13px] font-extrabold tracking-[-.2px] text-ink">{titulo}</span>
      </h2>
      {children}
    </section>
  )
}

export default function DesignPage() {
  return (
    <div className="pb-10">
      <header className="mb-7">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Sistema de diseño</h1>
        <p className="mt-1 text-[12px] text-muted">
          Tokens y componentes, cada uno en todas sus variantes. Los valores salen del bloque{' '}
          <code className="rounded-sm bg-line2 px-1 py-0.5 font-mono text-[11px]">:root</code> del
          mockup, sin retoques. Si una variante existe en el código y no está acá, es un bug.
        </p>
      </header>

      <Seccion n="01" titulo="Tokens">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card title="Marca">
            <div className="grid gap-2.5">
              {MARCA.map(([token, nombre]) => (
                <Muestra key={token} token={token} nombre={nombre} />
              ))}
            </div>
          </Card>

          <Card title="Estado">
            <div className="grid gap-3">
              {ESTADOS.map(([base, fondo, texto, nombre]) => (
                <div key={base} className="flex items-center gap-2">
                  <span
                    className="size-9 shrink-0 rounded-sm"
                    style={{ background: `var(${base})` }}
                  />
                  <span
                    className="flex h-9 flex-1 items-center rounded-sm px-2.5 text-[11px] font-bold"
                    style={{
                      background: `var(${fondo})`,
                      color: `var(${texto})`,
                    }}
                  >
                    {nombre}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Neutros">
            <div className="grid gap-2.5">
              {NEUTROS.map(([token, nombre]) => (
                <Muestra key={token} token={token} nombre={nombre} />
              ))}
            </div>
          </Card>

          <Card title="Radios">
            <div className="flex flex-wrap items-end gap-3">
              {RADIOS.map(([token, valor]) => (
                <div key={token} className="text-center">
                  <div
                    className="size-14 border border-line bg-bg"
                    style={{ borderRadius: `var(${token})` }}
                  />
                  <div className="mt-1 font-mono text-[9.5px] text-muted">{valor}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Sombras">
            {/* Sobre --bg y no sobre el blanco de la card: --sh-sm es tan suave
                que contra blanco no se ve, que es justo lo que hay que juzgar. */}
            <div className="flex flex-wrap gap-5 rounded-sm bg-bg px-4 py-4">
              {(['--sh-sm', '--sh-md'] as const).map((token) => (
                <div key={token} className="text-center">
                  <div
                    className="size-14 rounded-md bg-white"
                    style={{ boxShadow: `var(${token})` }}
                  />
                  <div className="mt-1.5 font-mono text-[9.5px] text-muted">{token}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Tipografía">
            <p className="text-[11px] text-muted">Asap, eje de peso 400 a 800.</p>
            <div className="mt-2 grid gap-1 text-ink">
              <span className="text-[13px] font-extrabold tracking-[-.2px]">800 · títulos</span>
              <span className="text-[11px] font-bold">700 · botones y cifras</span>
              <span className="text-[11px] font-semibold">600 · labels</span>
              <span className="text-[11px]">400 · cuerpo</span>
            </div>
          </Card>
        </div>
      </Seccion>

      <Seccion n="02" titulo="Money">
        <Card>
          {/* Apila en pantalla chica. Con flex-wrap los párrafos conservaban su
              max-width de 448px y se salían del ancho del teléfono. */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-10">
            <div className="grid gap-1 text-right text-[13px] font-bold text-ink">
              {[1750000, 111111, 890, 0, -850000].map((v) => (
                <Money key={v} value={v} className="block" />
              ))}
            </div>
            <p className="min-w-0 text-[11px] leading-relaxed text-muted md:max-w-md">
              El formateo lo hace <code className="font-mono">formatMoney()</code>, el único lugar
              de la app donde se decide cómo se escribe la plata. El componente pone la otra mitad,
              que es tipográfica: la utilidad <code className="font-mono">cifra</code>, que activa{' '}
              <code className="font-mono">tabular-nums</code>.
            </p>
            <p className="min-w-0 text-[11px] leading-relaxed text-muted md:max-w-md">
              Acá no se nota, y conviene saber por qué:{' '}
              <strong className="font-bold text-ink">
                Asap ya dibuja las cifras al mismo ancho
              </strong>
              . Medido sobre el render, las cinco filas dan idéntico con la utilidad y sin ella. No
              sobra igual: si Asap no llega a cargar y entra la fuente del sistema, que tiene cifras
              de ancho variable, la columna sigue alineada.
            </p>
          </div>
        </Card>
      </Seccion>

      <Seccion n="03" titulo="Button">
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="Jerarquía">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon="plus">
                Registrar cobro
              </Button>
              <Button variant="secondary" icon="editar">
                Editar
              </Button>
              <Button variant="tertiary">Cancelar</Button>
            </div>
            <p className="mt-3 text-[10.5px] text-muted">
              Una acción primaria por pantalla. El ícono siempre va a la izquierda.
            </p>
          </Card>

          <Card title="Tamaño pill">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="pill" icon="plus">
                Cobro
              </Button>
              <Button size="pill" variant="secondary" icon="filtro">
                Filtros
              </Button>
              <Button size="pill" variant="secondary" icon="descargar">
                Exportar
              </Button>
            </div>
            <p className="mt-3 text-[10.5px] text-muted">
              Para barras con varias acciones en fila.
            </p>
          </Card>

          <Card title="Cargando" className="lg:col-span-1">
            <div className="flex flex-wrap items-center gap-2">
              <Button loading>Guardando</Button>
              <Button loading variant="secondary">
                Guardando
              </Button>
              <Button loading size="pill">
                Guardando
              </Button>
            </div>
            <p className="mt-3 text-[10.5px] text-muted">
              El spinner ocupa el lugar del ícono y el botón deja de aceptar clicks. Con{' '}
              <code className="font-mono">prefers-reduced-motion</code> gira más lento, pero no se
              detiene: es información de estado.
            </p>
          </Card>

          <Card title="Deshabilitado">
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled icon="plus">
                Registrar cobro
              </Button>
              <Button disabled variant="secondary">
                Editar
              </Button>
              <Button disabled variant="tertiary">
                Cancelar
              </Button>
            </div>
            <p className="mt-3 text-[10.5px] text-muted">
              Los tres se ven igual deshabilitados: el botón deja de ser un botón.
            </p>
          </Card>
        </div>
      </Seccion>

      <Seccion n="04" titulo="Badge">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge estado="alDia">Al día</Badge>
            <Badge estado="ok">Cobrada</Badge>
            <Badge estado="porVencer">Por vencer</Badge>
            <Badge estado="mora">En mora</Badge>
            <Badge estado="vencido">Vencido</Badge>
            <Badge estado="info">Anticipo</Badge>
            <Badge estado="neutro">Sin ficha</Badge>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge estado="alDia" mayuscula>
              Al día
            </Badge>
            <Badge estado="porVencer" mayuscula>
              Por vencer
            </Badge>
            <Badge estado="mora" mayuscula>
              En mora
            </Badge>
          </div>
          <p className="mt-3 text-[10.5px] text-muted">
            La prop es el estado del dominio, no el color. <code className="font-mono">alDia</code>{' '}
            y <code className="font-mono">ok</code> son el mismo verde, igual que{' '}
            <code className="font-mono">mora</code> y <code className="font-mono">vencido</code>:
            cada pantalla usa la palabra que se dice ahí.
          </p>
        </Card>
      </Seccion>

      <Seccion n="05" titulo="Card">
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="Con título e ícono" icon="caja">
            <p className="text-[11px] text-muted">
              El header aparece si viene <code className="font-mono">title</code>,{' '}
              <code className="font-mono">icon</code> o <code className="font-mono">action</code> —
              cualquiera de los tres. Sin ninguno, la card es solo el contenedor.
            </p>
          </Card>

          <Card icon="monedas">
            <p className="text-[11px] text-muted">
              Solo <code className="font-mono">icon</code>, sin título. Antes esta card descartaba
              el ícono en silencio: el header únicamente se dibujaba con{' '}
              <code className="font-mono">title</code> o <code className="font-mono">action</code>.
              Lo que se pasa explícito no puede desaparecer sin aviso.
            </p>
          </Card>

          <Card
            title="Con acción"
            icon="comprobante"
            action={
              <Button size="pill" variant="secondary" icon="externo">
                Ver todo
              </Button>
            }
          >
            <p className="text-[11px] text-muted">
              La acción va a la derecha del título, alineada con él.
            </p>
          </Card>

          <Card
            title="Sin padding, con tabla"
            icon="equipos"
            noPadding
            className="lg:col-span-2"
            action={
              <Button size="pill" variant="tertiary">
                Ver deudores
              </Button>
            }
          >
            {/* Una <table> no encoge por debajo del ancho de su contenido: sin
                este contenedor, en un teléfono estira la página entera y el
                texto de TODA la pantalla se sale. Scrollea la tabla, no la
                página. DataTable se lo va a llevar puesto en la tanda 2. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-[11px]">
                <thead>
                  <tr className="bg-line2/60 text-left">
                    <th className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-[.04em] text-muted">
                      Equipo
                    </th>
                    <th className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-[.04em] text-muted">
                      Estado
                    </th>
                    <th className="px-4 py-2.5 text-right text-[9px] font-bold uppercase tracking-[.04em] text-muted">
                      Deuda
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      equipo: 'El Ciclón',
                      estado: 'alDia',
                      texto: 'Al día',
                      deuda: 0,
                    },
                    {
                      equipo: 'Escalera FC',
                      estado: 'porVencer',
                      texto: 'Por vencer',
                      deuda: 850000,
                    },
                    {
                      equipo: 'Delirio FC',
                      estado: 'mora',
                      texto: 'En mora',
                      deuda: 3050000,
                    },
                  ].map((f, i) => (
                    <tr key={f.equipo} className={i % 2 ? 'bg-bg/50' : ''}>
                      <td className="px-4 py-2.5 font-semibold text-ink">{f.equipo}</td>
                      <td className="px-4 py-2.5">
                        <Badge estado={f.estado as 'alDia' | 'porVencer' | 'mora'}>{f.texto}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-ink">
                        <Money value={f.deuda} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Fuera de la card a propósito: si el texto fuera adentro, la última
              fila no tocaría el borde y la card no demostraría lo que dice. */}
          <p className="text-[10.5px] text-muted lg:col-span-2">
            Con <code className="font-mono">noPadding</code> la tabla llega a los bordes y el radio
            de la card la recorta, así la última fila cierra en la esquina en vez de quedar con las
            puntas cuadradas.
          </p>
        </div>
      </Seccion>

      <Seccion n="06" titulo="DataTable">
        <div className="grid gap-3">
          <p className="rounded-md border border-line bg-white px-4 py-3 text-[10.5px] leading-relaxed text-muted">
            <strong className="font-bold text-ink">No va envuelta en Card.</strong> La tabla ya es
            su propio contenedor: trae borde, radio y{' '}
            <code className="font-mono">overflow-hidden</code>. Adentro de una Card quedan dos
            bordes, y con <code className="font-mono">noPadding</code> quedan pegados y se ve una
            línea doble. Si necesita título, el título va{' '}
            <strong className="font-bold text-ink">arriba</strong> de la tabla, no envolviéndola —
            que es como están armados los ejemplos de acá abajo.
          </p>
          <Ejemplo
            titulo="Cobranza — texto, badge, fecha, plata y total"
            aside={
              <span className="text-[9.5px] font-semibold text-muted">
                filas clickeables · rowHref
              </span>
            }
          >
            <DataTable
              columns={COL_COBRANZA}
              rows={COBRANZA}
              rowKey="id"
              rowHref={() => '/cobranza'}
              total={{ equipo: 'Total', deuda: 8760000 }}
            />
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
              El total se <strong className="font-bold text-ink">pasa</strong>, no se calcula. La
              tabla no suma nunca y no tiene un camino alternativo que lo haga: el número correcto
              sale de la vista SQL con los centavos completos, mientras que la columna muestra
              importes ya redondeados a peso. La fila navy anclada dice eso mismo sin texto —viene
              de otro lado, no es una fila más.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Movimientos — sin total">
            <DataTable columns={COL_MOVIMIENTOS} rows={MOVIMIENTOS} rowKey="id" />
            <p className="mt-3 text-[10.5px] text-muted">
              Sin <code className="font-mono">total</code> no hay fila navy. Los importes negativos
              salen del formato, no de una regla de la tabla.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Cuotas — densidad compacta, header sticky">
            <DataTable
              columns={COL_CUOTAS}
              rows={CUOTAS}
              rowKey="id"
              densidad="compacta"
              maxHeight={260}
              total={{ equipo: 'Total del período', monto: 12750000 }}
            />
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
              24 filas en 260px de alto: scroleá adentro de la tabla y mirá el header, que se queda
              arriba, y el total, que se queda abajo. El total va en{' '}
              <code className="font-mono">tfoot</code> con{' '}
              <code className="font-mono">position: sticky</code> en vez de un bloque aparte, así
              sigue alineado con las columnas cuando la tabla scrollea al costado.
            </p>
          </Ejemplo>

          <div className="grid gap-3 lg:grid-cols-2">
            <Ejemplo titulo="Sin filas">
              <DataTable
                columns={COL_MOVIMIENTOS}
                rows={[]}
                rowKey="id"
                emptyMessage="Todavía no hay movimientos en el período."
              />
              <p className="mt-3 text-[10.5px] text-muted">
                <code className="font-mono">emptyMessage</code> es del dominio: dice qué falta, no
                &ldquo;sin datos&rdquo;.
              </p>
            </Ejemplo>

            <Ejemplo titulo="Colapso mobile">
              {/* iframe y no una explicación: el corte es por breakpoint CSS, así
                  que hace falta un viewport angosto de verdad. Con 360px acá
                  adentro, la variante se ve sin achicar la ventana. */}
              <iframe
                src="/design/mobile"
                title="La misma tabla a 360px de ancho"
                width={360}
                height={420}
                className="mx-auto block w-[360px] rounded-md border border-line bg-bg"
              />
              <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
                Abajo de 768px la tabla no scrollea al costado: cada fila pasa a ser una card con
                label y valor, y el total a un bloque navy. Los formatos se respetan —el badge sigue
                siendo badge y la plata sigue en <code className="font-mono">Money</code>.
              </p>
            </Ejemplo>
          </div>
        </div>
      </Seccion>

      <Seccion n="07" titulo="AsientoPreview">
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="Cobro — como lo usa la pantalla de cobranza" icon="caja">
            <AsientoPreview
              colapsable
              defaultAbierto
              descripcion="La Pausa · cuotas 2 y 3"
              fecha="2026-08-06"
              lineas={ASIENTO_COBRO}
              totalDebe={525000}
              totalHaber={525000}
              balanceado
            />
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
              Es lo que devuelve <code className="font-mono">preview_cobro</code> hoy, sin retocar:
              la cuenta viene como <strong className="font-bold text-ink">código</strong>. El
              plegado usa <code className="font-mono">&lt;details&gt;</code> nativo — anda con
              teclado y sin JavaScript, así que el componente no necesita{' '}
              <code className="font-mono">&quot;use client&quot;</code>.
            </p>
          </Card>

          <Card title="Gasto — con el nombre de cuenta resuelto" icon="comprobante">
            <AsientoPreview
              descripcion="Arbitraje fecha 4"
              lineas={ASIENTO_GASTO}
              totalDebe={310000}
              totalHaber={310000}
              balanceado
            />
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
              El mismo componente, sin cambios, cuando la línea trae{' '}
              <code className="font-mono">nombre</code>. Así se vería el cobro de al lado el día que{' '}
              <code className="font-mono">preview_cobro</code> haga el join contra{' '}
              <code className="font-mono">cuenta</code>. Sin{' '}
              <code className="font-mono">colapsable</code>, el asiento está siempre a la vista.
            </p>
          </Card>

          <Card title="Cinco líneas" icon="documento">
            <AsientoPreview
              descripcion="Recaudación de la fecha"
              lineas={ASIENTO_LARGO}
              totalDebe={1750000}
              totalHaber={1750000}
              balanceado
            />
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
              Las líneas al haber van indentadas y con &ldquo;a&rdquo;, como se escribe un asiento a
              mano. El lado que no corresponde queda{' '}
              <strong className="font-bold text-ink">en blanco</strong> y no con{' '}
              <code className="font-mono">—</code>: no es un dato que falta, es la estructura.
            </p>
          </Card>

          <div className="grid gap-3">
            <Card title="Cargando" icon="reloj">
              <AsientoPreview
                cargando
                descripcion="La Pausa · cuota 3"
                lineas={[]}
                totalDebe={0}
                totalHaber={0}
                balanceado={false}
              />
            </Card>

            <Card title="Con error" icon="alerta">
              <AsientoPreview
                error="La imputación suma 400000 y el pago es de 525000. Tienen que coincidir."
                lineas={[]}
                totalDebe={0}
                totalHaber={0}
                balanceado={false}
              />
            </Card>

            <Card title="Sin balancear" icon="alerta">
              <AsientoPreview
                descripcion="Solo puede pasar si la función de preview lo informa"
                lineas={[
                  { cuenta: 'CAJA_EFECTIVO', nombre: 'Caja Efectivo', debe: 500000 },
                  { cuenta: 'ING_PARTIDOS', nombre: 'Ingresos por partidos', haber: 400000 },
                ]}
                totalDebe={500000}
                totalHaber={400000}
                balanceado={false}
              />
              <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
                El componente dibuja el balance tal como lo recibe, no lo recalcula.{' '}
                <code className="font-mono">preview_cobro</code> hoy manda{' '}
                <code className="font-mono">balanceado: true</code> literal, así que por esa vía
                este estado no aparece — y eso es cosa de la función, no del componente.
              </p>
            </Card>
          </div>
        </div>
      </Seccion>

      <Seccion n="08" titulo="KpiCard / KpiHero">
        <div className="grid gap-3">
          <Ejemplo titulo="Resumen financiero — KpiHero">
            <KpiHero valores={RESUMEN} />
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Recibe un array de valores, no <code className="font-mono">children</code>: así los
              separadores y el espaciado quedan del lado del componente y el resumen se ve igual en
              toda la app. Es el mismo <code className="font-mono">--night</code> del isologo y de
              la fila de total del DataTable — el fondo oscuro ya significa &ldquo;esto es el total,
              no una parte&rdquo;. Sobre navy el tono <code className="font-mono">info</code> usa{' '}
              <code className="font-mono">--flyway</code> y no{' '}
              <code className="font-mono">--blue</code>: el azul de marca da 3,94:1 ahí y el otro
              6,10:1.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Los cuatro tonos">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard tono="positivo" titulo="En caja hoy" valor={79700000} icon="caja" />
              <KpiCard tono="alerta" titulo="Deuda vencida" valor={8760000} icon="alerta" />
              <KpiCard tono="info" titulo="Comprometido" valor={31500000} icon="calendario" />
              <KpiCard tono="neutro" titulo="Anticipos" valor={1250000} icon="monedas" />
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              La prop es qué <strong className="font-bold text-ink">significa</strong> el número, no
              de qué color va: la pantalla dice que la deuda vencida es{' '}
              <code className="font-mono">alerta</code> y el sistema elige el rojo. Mismo criterio
              que el <code className="font-mono">estado</code> del Badge.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Formato, subtítulo, sparkline y variación">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                tono="info"
                titulo="Equipos inscriptos"
                valor={304}
                formato="entero"
                icon="equipos"
                subtitulo="Padrón completo"
              />
              <KpiCard
                tono="positivo"
                titulo="En caja hoy"
                valor={79700000}
                icon="caja"
                subtitulo="Caja real, sin proyectar"
              />
              <KpiCard
                tono="positivo"
                titulo="Recaudado"
                valor={68400000}
                icon="monedas"
                sparkline={SERIE_CAJA}
                subtitulo="Últimas 7 fechas"
              />
              <KpiCard
                tono="alerta"
                titulo="Deuda vencida"
                valor={8760000}
                icon="alerta"
                variacion={{ porcentaje: -12, base: 'vs. la fecha anterior' }}
              />
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              <code className="font-mono">formato=&quot;entero&quot;</code> es un conteo y no lleva{' '}
              <code className="font-mono">$</code> — 304 equipos, no $304. El sparkline muestra la
              forma de la serie y{' '}
              <strong className="font-bold text-ink">ninguna cifra sale de él</strong>. Y la
              variación lleva la base pegada al porcentaje porque{' '}
              <code className="font-mono">▼12%</code> solo no dice nada: el tipo la exige, así que
              un porcentaje sin contra-qué-compara no compila.
            </p>
          </Ejemplo>
        </div>
      </Seccion>

      <Seccion n="09" titulo="ChartArea / Waterfall">
        <div className="grid gap-3">
          <Ejemplo titulo="Evolución de caja — real y proyectado">
            <ChartArea serie={SERIE_CAJA_SEM} titulo="Evolución del saldo de caja por semana" />
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              El tramo sólido en <code className="font-mono">--night</code> es lo que ya pasó; el
              punteado en <code className="font-mono">--flyway</code> es lo proyectado. La marca va{' '}
              <strong className="font-bold text-ink">por punto</strong> (
              <code className="font-mono">proyectado</code>), que es como viene{' '}
              <code className="font-mono">futura</code> de{' '}
              <code className="font-mono">v_cashflow</code>, así que la pantalla no tiene que
              calcular dónde parte la serie. Lo que agregó respecto del SVG a mano que{' '}
              <code className="font-mono">/proyeccion</code> tenía antes —y que este componente
              reemplazó—: el relleno degradado, la grilla y{' '}
              <strong className="font-bold text-ink">el marco que cierra el plot</strong> — antes
              quedaba abierto arriba y a los costados.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Con quiebre de caja">
            <ChartArea serie={SERIE_QUIEBRE} titulo="Saldo proyectado con quiebre de caja" />
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Bajo cero el tramo se repinta en <code className="font-mono">--err</code> y se marcan
              los puntos, sin perder el punteado donde además es proyectado. La escala siempre
              incluye el cero: un gráfico de saldo que no lo muestra esconde justo lo que hay que
              mirar. Se apaga con <code className="font-mono">marcarNegativo={'{false}'}</code>.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Compacto — para poco ancho">
            <div className="max-w-[440px]">
              <ChartArea
                compacto
                serie={SERIE_CAJA_SEM}
                titulo="Evolución del saldo, en versión compacta"
              />
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              <code className="font-mono">compacto</code> no agranda las letras:{' '}
              <strong className="font-bold text-ink">achica el lienzo</strong>, de 800 a 440. El SVG
              escala por <code className="font-mono">viewBox</code>, así que en un contenedor
              angosto el lienzo grande se dibuja al 0,545 y una etiqueta de 11px termina midiendo 6.
              Con el lienzo chico la escala queda en ~1 y todo aterriza en su tamaño nominal — no
              solo el texto, también los trazos y los puntos, que subiendo fuentes seguirían finos.
              Además bajan las marcas de 5 a 4 y las fechas de 8 a 4, porque en poco ancho el otro
              problema es el amontonamiento. Va acá dentro de un contenedor de 440px para que se vea
              como se vería en un teléfono.
            </p>
          </Ejemplo>

          <div className="grid gap-3 lg:grid-cols-2">
            <Ejemplo titulo="Sin serie">
              <ChartArea serie={[]} />
              <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                Es lo que muestra el dashboard con la base en cero.
              </p>
            </Ejemplo>

            <Ejemplo titulo="Puente en cero">
              <Waterfall
                pasos={[
                  { titulo: 'Comprometido', valor: 0, rol: 'suma' },
                  { titulo: 'Por cobrar', valor: 0, rol: 'resta' },
                  { titulo: 'Cobrado', valor: 0, rol: 'resultado' },
                ]}
              />
              <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                Con los tres pasos en cero el gráfico dibujaría tres hilos sobre la línea de base y
                un recuadro vacío del alto completo: no está roto, pero ocupa como si dijera algo.
              </p>
            </Ejemplo>
          </div>

          <Ejemplo titulo="Puente devengado → caja">
            <Waterfall pasos={PUENTE} titulo="De lo facturado a lo que hay en caja" />
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Cada barra arranca donde terminó la anterior; el resultado se dibuja desde cero con{' '}
              <strong className="font-bold text-ink">su</strong> valor, no con el acumulado. El
              componente{' '}
              <strong className="font-bold text-ink">no verifica que el puente cierre</strong>: si
              los números no reconcilian, la barra final no coincide con donde llegó el acumulado y
              se ve. Taparlo calculando el resultado acá convertiría un error visible en uno mudo.
            </p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Todavía no tiene consumidor: haría falta una vista que combine devengado, por cobrar y
              caja, y no existe. Los números son de ejemplo — y el facturado es{' '}
              <strong className="font-bold text-ink">88,46M</strong> y no los 742,5M del mockup,
              porque con aquéllos la resta no daba y esta página es documentación.
            </p>
          </Ejemplo>
        </div>
      </Seccion>

      <Seccion n="10" titulo="Field / Input / Select">
        <div className="grid gap-3">
          <p className="rounded-md border border-line bg-white px-4 py-3 text-[10.5px] leading-relaxed text-muted">
            <strong className="font-bold text-ink">Field envuelve al control</strong>, no lo
            renderiza: <code className="font-mono">Input</code> extiende{' '}
            <code className="font-mono">InputHTMLAttributes</code>, así que vestir un campo que ya
            existe es cambiar <code className="font-mono">&lt;input&gt;</code> por{' '}
            <code className="font-mono">&lt;Input&gt;</code> — el{' '}
            <code className="font-mono">value</code> y el{' '}
            <code className="font-mono">onChange</code> siguen siendo los mismos. El{' '}
            <code className="font-mono">id</code> lo genera Field y lo comparte por contexto, así
            que la asociación label ↔ control es el default y no algo que haya que recordar.
            <br />
            <br />
            Son los únicos del sistema con <code className="font-mono">&quot;use client&quot;</code>
            : un control con <code className="font-mono">value</code> es cliente por definición. Los
            de presentación pura siguen siendo server-renderable.
          </p>

          <Ejemplo titulo="Una fila de campos — la baseline pareja de 8a">
            <div className="rounded-md border border-line bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Monto">
                  <Input type="number" defaultValue={525000} />
                </Field>
                <Field label="Medio">
                  <Select defaultValue="transferencia">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                  </Select>
                </Field>
                <Field label="Fecha">
                  <Input type="date" defaultValue="2026-08-07" />
                </Field>
                <Field label="Predio" hint="Solo si el medio es efectivo">
                  <Select placeholder="Elegir predio…" defaultValue="">
                    <option value="1">Tirolesa</option>
                    <option value="2">Aeropuerto</option>
                  </Select>
                </Field>
              </div>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Los cuatro controles miden{' '}
              <strong className="font-bold text-ink">34px exactos</strong> y el label tiene alto
              fijo de una línea: por eso la fila alinea arriba y abajo aunque los rótulos midan
              distinto. El <code className="font-mono">hint</code> del último crece hacia abajo sin
              descolgar a los vecinos. Y el monto lleva{' '}
              <code className="font-mono">tabular-nums</code> solo por ser{' '}
              <code className="font-mono">type=&quot;number&quot;</code>.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Con error">
            <div className="rounded-md border border-line bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Monto" required error="El monto tiene que ser mayor a cero.">
                  <Input type="number" defaultValue={0} />
                </Field>
                <Field label="Predio" required error="Un cobro en efectivo necesita predio.">
                  <Select placeholder="Elegir predio…" defaultValue="">
                    <option value="1">Tirolesa</option>
                  </Select>
                </Field>
                <Field label="Concepto" hint="Sin error: el hint queda visible">
                  <Input placeholder="Arbitraje fecha 4" />
                </Field>
              </div>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              El borde pasa a <code className="font-mono">--err</code> y el mensaje va en{' '}
              <code className="font-mono">--errtx</code>. El error reemplaza al hint, no se suma: si
              el campo está mal, lo que hay que leer es qué está mal.{' '}
              <code className="font-mono">--errbg</code> queda para el recuadro de error del
              formulario entero — un bloque de fondo rojo por campo pesa demasiado en una fila.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Deshabilitados">
            <div className="rounded-md border border-line bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Monto">
                  <Input type="number" defaultValue={525000} disabled />
                </Field>
                <Field label="Medio">
                  <Select defaultValue="efectivo" disabled>
                    <option value="efectivo">Efectivo</option>
                  </Select>
                </Field>
                <Field label="Fecha">
                  <Input type="date" defaultValue="2026-08-07" disabled />
                </Field>
              </div>
            </div>
            <p className="mt-2 text-[10.5px] text-muted">
              Mismo tratamiento que el Button deshabilitado: fondo{' '}
              <code className="font-mono">--bg</code>, texto{' '}
              <code className="font-mono">--disabled-tx</code>, sin hover.
            </p>
          </Ejemplo>
        </div>
      </Seccion>

      <Seccion n="10" titulo="ChartTorta / ChartBarras">
        <div className="grid gap-4 lg:grid-cols-2">
          <Ejemplo titulo="Dona — categorías sin semántica">
            <ChartTorta gajos={GAJOS_INGRESO} titulo="Composición de ingresos" />
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              El agujero del medio lleva el <strong className="font-bold text-ink">total</strong>: una
              torta maciza obliga a sumar los gajos con la vista para saber sobre qué se reparte. Los
              colores salen de la paleta <strong className="font-bold text-ink">por posición</strong>,
              que es lo correcto cuando las categorías no significan bueno ni malo — pintar de rojo a
              «Bar» le inventaría una alarma que no tiene.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Dona — color semántico y centro propio">
            <ChartTorta
              gajos={GAJOS_ESTADO}
              centro={{ valor: '28', nota: 'equipos' }}
              titulo="Estado de los equipos"
            />
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Acá el color <strong className="font-bold text-ink">sí</strong> dice algo: verde al día,
              ámbar por vencer, rojo vencido — los mismos tokens que los badges. Y el centro se pisa
              con <code className="rounded-sm bg-line2 px-1 font-mono text-[10px]">centro</code>,
              porque el total útil son 28 equipos y no la suma de pesos.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Dona — cola larga">
            <ChartTorta gajos={GAJOS_LARGO} tope={5} titulo="Gastos por categoría" />
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Con nueve categorías, las que pasan de <code className="rounded-sm bg-line2 px-1 font-mono text-[10px]">tope</code>{' '}
              se juntan en «Otros», en gris, para que no compita con una categoría real. Sin esto los
              gajos finos se vuelven ilegibles y la leyenda ocupa más que el gráfico.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Dona vacía">
            <ChartTorta gajos={[]} />
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Sin gajos dibujables dice por qué está vacía, en vez de dejar un recuadro mudo del alto
              completo. Mismo criterio que ChartArea y Waterfall.
            </p>
          </Ejemplo>
        </div>

        <div className="mt-4 grid gap-4">
          <Ejemplo titulo="Barras agrupadas — comparar">
            <ChartBarras
              ejeX={MESES}
              series={SERIES_IVG}
              modo="agrupadas"
              titulo="Ingresos contra gastos, por mes"
            />
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              <strong className="font-bold text-ink">Agrupadas</strong> es para comparar dos
              magnitudes que no se suman entre sí. El cero no está pegado abajo: los gastos entran en
              negativo y bajan de la línea, que es como se leen. Un eje apoyado en cero exageraría las
              diferencias — el error clásico del eje truncado.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Barras apiladas — componer">
            <ChartBarras
              ejeX={['Clausura 25', 'Apertura 26', 'Clausura 26', 'Apertura 27']}
              series={SERIES_DEUDA}
              modo="apiladas"
              alto={220}
              titulo="Deuda por torneo, vencida y por vencer"
            />
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              <strong className="font-bold text-ink">Apiladas</strong> es para componer: vencido más
              por vencer <strong className="font-bold text-ink">sí</strong> dan el total adeudado.
              No es una preferencia visual — apilar cosas que no se suman dibuja un total que no
              existe.
            </p>
          </Ejemplo>

          <Ejemplo titulo="Compacto">
            <div className="max-w-sm">
              <ChartBarras ejeX={MESES} series={SERIES_IVG} compacto alto={200} />
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              <code className="rounded-sm bg-line2 px-1 font-mono text-[10px]">compacto</code> achica
              el <strong className="font-bold text-ink">lienzo</strong>, no las letras: el SVG escala
              por viewBox, así que un lienzo de 440 en vez de 800 deja cada texto en su tamaño
              nominal. De paso baja el tope de etiquetas del eje, porque en poco ancho el problema
              además es el amontonamiento.
            </p>
          </Ejemplo>
        </div>
      </Seccion>
    </div>
  )
}
