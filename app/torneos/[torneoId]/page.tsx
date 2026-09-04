import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { formatDate } from '@/lib/format'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { Badge, Card, Icon, KpiCard } from '@/components/ui'
import PestanasTorneo from './PestanasTorneo'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ESTADO: Record<string, { estado: 'ok' | 'info' | 'neutro'; label: string }> = {
  planificado: { estado: 'info', label: 'Planificado' },
  en_curso: { estado: 'ok', label: 'En curso' },
  cerrado: { estado: 'neutro', label: 'Cerrado' },
}

/** Una línea de la lista de control. */
function Control({ ok, titulo, detalle }: { ok: boolean; titulo: string; detalle: string }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      <Icon
        name={ok ? 'check' : 'alerta'}
        size={15}
        className={`mt-0.5 shrink-0 ${ok ? 'text-oktx' : 'text-errtx'}`}
      />
      <span className="min-w-0">
        <span className="text-[12px] font-semibold text-ink">{titulo}</span>
        <span className="ml-1.5 text-[11px] text-muted">{detalle}</span>
      </span>
    </li>
  )
}

/**
 * El detalle de un torneo.
 *
 * ── Por qué faltaba, y qué resuelve ───────────────────────────────────────
 *
 * `/torneos/[id]/estructura` y `/torneos/[id]/fichas` existían y funcionaban,
 * pero **no había puerta de entrada**: se llegaba desde dos botones de la lista
 * y no había forma de ver un torneo entero. Un torneo es estructura + equipos +
 * tarifario + calendario, y ninguna pantalla mostraba las cuatro cosas juntas.
 *
 * ── La lista de control es el corazón ─────────────────────────────────────
 *
 * `clonar_torneo` clona estructura, tarifario y fichas — pero NO el calendario.
 * Y `confirmar_torneo_clonado` llama a `generar_cuotas_ficha`, que frena con
 * «la serie no tiene ninguna jornada en ese rango: sembrá el calendario antes
 * de generar cuotas».
 *
 * O sea que hoy confirmar un torneo clonado FALLA, y el operador se entera al
 * apretar el botón, con un error de Postgres. Esta pantalla existe para que se
 * entere antes, con la lista de lo que falta y el link a resolverlo.
 */
export default async function TorneoDetallePage({
  params,
}: {
  params: Promise<{ torneoId: string }>
}) {
  const { torneoId } = await params
  if (!UUID.test(torneoId)) notFound()

  const supabase = await createClient()
  const [{ data: listo }, { data: torneo }, rol] = await Promise.all([
    supabase.from('v_torneo_listo').select('*').eq('torneo_id', torneoId).maybeSingle(),
    supabase.from('v_torneo_lista').select('*').eq('torneo_id', torneoId).maybeSingle(),
    rolActual(),
  ])

  if (!listo) notFound()

  const falta = listo.falta ?? []
  const puedeConfirmar = puede(rol, 'torneo.confirmar')
  const estado = ESTADO[listo.estado ?? ''] ?? { estado: 'neutro' as const, label: listo.estado ?? '—' }

  return (
    <div className="pb-10">
      <Link href="/torneos" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Torneos
      </Link>

      <header className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-extrabold tracking-[-.4px] text-ink">
            {listo.nombre}
            <Badge estado={estado.estado}>{estado.label}</Badge>
            {listo.confirmado && <Badge estado="ok">Confirmado</Badge>}
          </h1>
          <p className="mt-1 text-[12px] text-muted">
            {torneo?.fecha_desde && torneo?.fecha_hasta
              ? `${formatDate(torneo.fecha_desde)} → ${formatDate(torneo.fecha_hasta)}`
              : 'Sin período definido'}{' '}
            · La estructura, los equipos, el tarifario y el calendario de este torneo.
          </p>
        </div>
      </header>

      <PestanasTorneo activa="resumen" torneoId={torneoId} />

      <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        <KpiCard tono="neutro" titulo="Categorías" valor={listo.categorias ?? 0} formato="entero" />
        <KpiCard tono="neutro" titulo="Series" valor={listo.series ?? 0} formato="entero" />
        <KpiCard tono="neutro" titulo="Equipos" valor={listo.fichas ?? 0} formato="entero" />
        <KpiCard
          tono={(listo.jornadas ?? 0) === 0 ? 'alerta' : 'neutro'}
          titulo="Jornadas"
          valor={listo.jornadas ?? 0}
          formato="entero"
        />
        <KpiCard
          tono={listo.confirmado ? 'positivo' : 'info'}
          titulo="Cuotas"
          valor={listo.cuotas ?? 0}
          formato="entero"
          subtitulo={listo.confirmado ? 'ya generadas' : 'se generan al confirmar'}
        />
      </div>

      <Card>
        <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
          Lista de control
        </h2>
        <p className="mb-3 text-[11px] leading-snug text-muted">
          Lo que un torneo necesita para poder confirmarse. Confirmar genera las cuotas de cada
          equipo a partir del tarifario y del calendario — por eso el calendario tiene que estar
          sembrado antes.
        </p>

        <ul className="mb-4">
          <Control
            ok={(listo.categorias ?? 0) > 0 && (listo.series ?? 0) > 0}
            titulo="Estructura"
            detalle={`${listo.categorias ?? 0} categorías · ${listo.series ?? 0} series`}
          />
          <Control
            ok={(listo.planes ?? 0) > 0}
            titulo="Tarifario"
            detalle={`${listo.planes ?? 0} planes activos`}
          />
          <Control
            ok={(listo.fichas ?? 0) > 0}
            titulo="Equipos"
            detalle={`${listo.fichas ?? 0} fichas`}
          />
          <Control
            ok={(listo.jornadas ?? 0) > 0 && (listo.jornadas_sin_fecha ?? 0) === 0}
            titulo="Calendario"
            detalle={
              (listo.jornadas ?? 0) === 0
                ? 'sin jornadas — las cuotas por fecha cuelgan de ellas'
                : (listo.jornadas_sin_fecha ?? 0) > 0
                  ? `${listo.jornadas_sin_fecha} jornadas sin fecha`
                  : `${listo.jornadas} jornadas, todas con fecha`
            }
          />
        </ul>

        {falta.length > 0 ? (
          <div className="rounded-md bg-warnbg px-4 py-3">
            <p className="text-[11.5px] font-bold text-warntx">
              Todavía no se puede confirmar. Falta:
            </p>
            <ul className="mt-1.5 space-y-1">
              {falta.map((f) => (
                <li key={f} className="text-[11px] leading-snug text-warntx">
                  · {f}
                </li>
              ))}
            </ul>
            {(listo.jornadas ?? 0) === 0 && (
              <Link
                href={`/calendario?torneo=${torneoId}`}
                className="mt-2 inline-block text-[11px] font-semibold text-blue-d hover:underline"
              >
                Ir al calendario →
              </Link>
            )}
          </div>
        ) : listo.confirmado ? (
          <p className="rounded-md bg-okbg px-4 py-3 text-[11.5px] text-oktx">
            <strong className="font-bold">Torneo confirmado.</strong> Sus {listo.cuotas} cuotas ya
            están generadas. Para cambiar el medio de pago o sacar una ficha con cuotas hay que
            anularlas primero.
          </p>
        ) : (
          <p className="rounded-md bg-okbg px-4 py-3 text-[11.5px] text-oktx">
            <strong className="font-bold">Listo para confirmar.</strong> Al confirmar se generan
            las cuotas de las {listo.fichas} fichas.
            {!puedeConfirmar && ' Confirmar es de administrador.'}
          </p>
        )}
      </Card>
    </div>
  )
}
