import {
  AsientoPreview,
  Badge,
  Button,
  Card,
  DataTable,
  Money,
  type CeldaBadge,
  type ColumnDef,
  type LineaAsiento,
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
              El header es opcional: sin <code className="font-mono">title</code> ni{' '}
              <code className="font-mono">action</code>, la card es solo el contenedor.
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
          <Card
            title="Cobranza — texto, badge, fecha, plata y total"
            icon="equipos"
            action={
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
          </Card>

          <Card title="Movimientos — sin total" icon="comprobante">
            <DataTable columns={COL_MOVIMIENTOS} rows={MOVIMIENTOS} rowKey="id" />
            <p className="mt-3 text-[10.5px] text-muted">
              Sin <code className="font-mono">total</code> no hay fila navy. Los importes negativos
              salen del formato, no de una regla de la tabla.
            </p>
          </Card>

          <Card title="Cuotas — densidad compacta, header sticky" icon="calendario">
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
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Sin filas" icon="alerta">
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
            </Card>

            <Card title="Colapso mobile" icon="ver">
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
            </Card>
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
    </div>
  )
}
