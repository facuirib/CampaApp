import { Badge, Button, Card, Money } from '@/components/ui'

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
          Tanda 1 — tokens y las cuatro primitivas. Los valores salen del bloque{' '}
          <code className="rounded-sm bg-line2 px-1 py-0.5 font-mono text-[11px]">:root</code> del
          mockup, sin retoques.
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
    </div>
  )
}
