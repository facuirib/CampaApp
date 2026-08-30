import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { formatMoney } from '@/lib/format'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { Button, DataTable, KpiCard, type CeldaBadge, type ColumnDef } from '@/components/ui'
import ArmarReclamo from './ArmarReclamo'
import { PLANTILLA_POR_ETAPA, type EtapaCobranza } from '@/lib/reclamo/plantilla'
import type { Database } from '@/lib/db/database.types'

type Ficha = Database['public']['Views']['v_cuenta_corriente_equipo']['Row']
type CuotaRow = Database['public']['Views']['v_deuda_detalle']['Row']

/**
 * El segmento `[terceroId]` acepta cualquier texto, así que `/cobranza/kpis` o
 * `/cobranza/loquesea` llegan hasta acá. Se valida ANTES de consultar: si no
 * es un uuid, la consulta ni se hace y el error de Postgres —`invalid input
 * syntax for type uuid`— no llega a existir, mucho menos a pantalla.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Los estados de cuota, con rótulo legible.
 *
 * Acá SÍ corresponde este mapa: estas filas son cuotas, y `v_deuda_detalle`
 * trae la columna `estado`. En la lista de deudores no aplicaba porque
 * `v_deuda_equipo` lista importes por equipo, no situaciones de cuota.
 *
 * `vencida` y `parcial_vencida` comparten el rojo: las dos son plata que ya
 * tendría que estar. Se distinguen por el rótulo, que dice cuál es cuál.
 */
const ESTADOS: Record<string, CeldaBadge> = {
  al_dia: { estado: 'alDia', label: 'Al día' },
  pagada: { estado: 'ok', label: 'Pagada' },
  por_vencer: { estado: 'porVencer', label: 'Por vencer' },
  vencida: { estado: 'mora', label: 'Vencida' },
  parcial_vencida: { estado: 'mora', label: 'Parcial vencida' },
}

function estadoCuota(codigo: string | null): CeldaBadge {
  // Un estado que la vista agregue mañana cae en gris con su código, en vez
  // de romper o de mentir con un color que no le toca.
  return ESTADOS[codigo ?? ''] ?? { estado: 'neutro', label: codigo ?? '—' }
}

interface FilaCuota {
  cuota_id: string
  cuota_numero: number | null
  torneo: string | null
  vence_at: string | null
  monto: number | null
  pagado: number | null
  saldo: number | null
  estado: CeldaBadge
}

const COLUMNAS: ColumnDef<FilaCuota>[] = [
  { key: 'cuota_numero', label: 'Cuota', align: 'right', width: 70 },
  // El torneo también está como título de la sección, y aun así va en la fila.
  // El encabezado se pierde apenas la tabla scrollea: la cuota de la fila 30 no
  // dice de qué torneo es, y con un equipo anotado en dos torneos —que ahora
  // existe— eso es exactamente lo que hay que poder leer de un vistazo.
  { key: 'torneo', label: 'Torneo', width: 132 },
  { key: 'vence_at', label: 'Vence', format: 'date', width: 110 },
  { key: 'monto', label: 'Monto', format: 'money', width: 128 },
  { key: 'pagado', label: 'Pagado', format: 'money', width: 128 },
  { key: 'saldo', label: 'Saldo', format: 'money', width: 128 },
  { key: 'estado', label: 'Estado', format: 'badge' },
]

export default async function CuentaCorrientePage({
  params,
  searchParams,
}: {
  params: Promise<{ terceroId: string }>
  searchParams: Promise<{ torneo?: string }>
}) {
  const { terceroId } = await params
  const { torneo: torneoParam } = await searchParams

  // Un id que no es uuid no puede corresponder a ningún equipo: es un 404, y
  // así se corta antes de consultar. El error de Postgres ni se produce.
  if (!UUID.test(terceroId)) notFound()

  const supabase = await createClient()
  const rol = await rolActual()
  const puedeCobrar = puede(rol, 'cobro.registrar')
  const puedeRegistrarAviso = puede(rol, 'reclamo.registrar')
  const puedeMail = puede(rol, 'reclamo.mail')

  // Todo lo de este equipo en una sola tanda. `v_deuda_detalle` se pedía TRES
  // veces para la misma pantalla —acá, en el formulario de cobro y otra vez
  // desde el cliente al armar el aviso—; ahora sale una sola vez y baja por
  // props a lo que la necesite.
  const [fichasRes, cuotasRes, resumenRes, terceroRes, historialRes, momentoRes, actualRes] =
    await Promise.all([
      supabase.from('v_cuenta_corriente_equipo').select('*').eq('tercero_id', terceroId),
      supabase
        .from('v_deuda_detalle')
        .select('*')
        .eq('tercero_id', terceroId)
        .order('torneo')
        .order('cuota_numero'),
      supabase.from('v_deuda_equipo').select('*').eq('tercero_id', terceroId).maybeSingle(),
      // `v_deuda_equipo` trae el email pero no el contacto: el teléfono del que
      // sale el WhatsApp vive en `tercero`.
      supabase.from('tercero').select('contacto').eq('id', terceroId).maybeSingle(),
      supabase
        .from('reclamo')
        .select('*')
        .eq('tercero_id', terceroId)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      // La etapa que le toca hoy. Sale de `v_cobranza_momento` y NO de
      // `v_cobranza_cola`: la cola esconde a los que ya recibieron su aviso, y
      // acá se está mirando la ficha del equipo — si entró desde el buscador o
      // desde la cuenta corriente, tiene que poder avisarle igual. El candado
      // decide qué aparece en la cola, no qué se puede hacer desde la ficha.
      supabase
        .from('v_cobranza_momento')
        .select('etapa, cuota_ids')
        .eq('tercero_id', terceroId)
        .maybeSingle(),
      // El torneo actual, de la única definición.
      supabase.from('v_torneo_actual').select('id, nombre').maybeSingle(),
    ])

  const error = fichasRes.error ?? cuotasRes.error
  const fichas = fichasRes.data ?? []
  const cuotas = cuotasRes.data ?? []
  const resumen = resumenRes.data
  const historial = historialRes.data ?? []
  const etapa = (momentoRes.data?.etapa ?? null) as EtapaCobranza | null

  // La plantilla se elige por etapa, igual que en la Server Action: la de la
  // etapa si está en alguna cola, la de siempre si no.
  const { data: plantilla } = await supabase
    .from('plantilla_mail')
    .select('asunto, cuerpo, cuerpo_texto')
    .eq('clave', etapa ? PLANTILLA_POR_ETAPA[etapa] : 'reclamo_vencida')
    .maybeSingle()

  // Uuid válido pero sin ficha ni cuota: tampoco existe como recurso.
  if (!error && fichas.length === 0 && cuotas.length === 0) notFound()

  const equipo = fichas[0]?.equipo ?? cuotas[0]?.equipo ?? 'Equipo'

  // ── De qué torneo se muestra la cuenta ─────────────────────────────────
  //
  // La ficha mostraba TODAS las fichas apiladas, una sección por torneo. Con
  // dos ya se scrollea; a los diez torneos, las nueve viejas —todas pagadas—
  // tapan la que importa.
  //
  // El default es el torneo en curso. Si el equipo NO tiene ficha en él —jugó
  // los anteriores y éste no— cae a la suya más reciente: una ficha vacía con
  // el nombre del equipo arriba se lee como un error, no como «no está
  // inscripto».
  //
  // Y si no hay ninguno en curso NO se inventa uno: se muestra la más reciente
  // del equipo y el encabezado lo dice.
  const actual = actualRes.data
  const porTorneo = new Map<string, typeof fichas>()
  for (const f of fichas) {
    if (!f.torneo_id) continue
    porTorneo.set(f.torneo_id, [...(porTorneo.get(f.torneo_id) ?? []), f])
  }

  // El saldo de cada torneo, para poder mostrarlo en el selector: la deuda
  // vieja se ve SIN abrirla.
  const saldoPorTorneo = new Map<string, number>()
  for (const c of cuotas) {
    if (!c.torneo_id) continue
    saldoPorTorneo.set(c.torneo_id, (saldoPorTorneo.get(c.torneo_id) ?? 0) + (c.saldo ?? 0))
  }

  const torneosDelEquipo = [...porTorneo.entries()].map(([id, fs]) => ({
    id,
    nombre: fs[0].torneo ?? 'Torneo',
    saldo: saldoPorTorneo.get(id) ?? 0,
    esActual: id === actual?.id,
  }))
  // El actual primero, después los que deben, después el resto.
  torneosDelEquipo.sort((a, b) =>
    a.esActual !== b.esActual ? (a.esActual ? -1 : 1) : b.saldo - a.saldo,
  )

  const torneoMostrado =
    (torneoParam && porTorneo.has(torneoParam) ? torneoParam : null) ??
    (actual?.id && porTorneo.has(actual.id) ? actual.id : null) ??
    torneosDelEquipo[0]?.id ??
    null

  const fichasMostradas = torneoMostrado ? (porTorneo.get(torneoMostrado) ?? []) : fichas

  // Lo que se debe FUERA del torneo mostrado. Es lo que impide que el default
  // esconda deuda: el número está a la vista aunque las cuotas no.
  const deudaEnOtros = torneosDelEquipo
    .filter((t) => t.id !== torneoMostrado && t.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo)

  return (
    <div className="pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">{equipo}</h1>
          <p className="mt-1 text-[12px] text-muted">
            La ficha del equipo: lo que debe, cómo se le cobra y qué se le avisó.
          </p>

          {/* El selector, con el saldo al lado de cada torneo: la deuda vieja se
              ve SIN tener que abrirla. El actual va primero, después los que
              deben, después el resto. */}
          {torneosDelEquipo.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {torneosDelEquipo.map((t) => {
                const esta = t.id === torneoMostrado
                return (
                  <Link
                    key={t.id}
                    href={`/cobranza/${terceroId}?torneo=${t.id}`}
                    className={[
                      'rounded-pill border px-2.5 py-1 text-[10.5px] font-bold transition-colors',
                      esta
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-white text-muted hover:text-ink',
                    ].join(' ')}
                  >
                    {t.nombre}
                    {t.esActual && ' · en curso'}
                    <span className={esta ? 'font-semibold opacity-80' : 'font-semibold'}>
                      {t.saldo > 0 ? ` · debe ${formatMoney(t.saldo)}` : ' · al día'}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Sin torneo en curso NO se inventa uno: se dice. */}
          {!actual && (
            <p className="mt-2 text-[10.5px] text-muted">
              No hay ningún torneo en curso. Se muestra el más reciente de este equipo.
            </p>
          )}
        </div>
        {puedeCobrar && (
          <Link href={`/cobranza/${terceroId}/cobrar`}>
            <Button icon="plus">Registrar cobro</Button>
          </Link>
        )}
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {/* 🔴 Lo que impide que el default esconda deuda.
          La ficha muestra UN torneo, así que la deuda de los otros no se ve —
          y ésa es exactamente la plata que se pierde en silencio. El número va
          arriba, con el link para ir a verla. */}
      {deudaEnOtros.length > 0 && (
        <div className="mb-6 rounded-md bg-warnbg px-4 py-3 text-[11px] leading-relaxed text-warntx">
          <strong className="font-bold">Además debe en otros torneos.</strong>{' '}
          {deudaEnOtros.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ' · '}
              <Link href={`/cobranza/${terceroId}?torneo=${t.id}`} className="underline">
                {t.nombre}: {formatMoney(t.saldo)}
              </Link>
            </span>
          ))}
        </div>
      )}

      {fichasMostradas.map((ficha: Ficha) => {
        // Filtro, no cálculo: se reparten las cuotas ya traídas entre las
        // fichas del equipo. Ningún número sale de acá.
        const suyas = cuotas.filter((c: CuotaRow) => c.equipo_torneo_id === ficha.equipo_torneo_id)

        const filas: FilaCuota[] = suyas.map((c: CuotaRow) => ({
          cuota_id: c.cuota_id!,
          cuota_numero: c.cuota_numero,
          torneo: c.torneo,
          vence_at: c.vence_at,
          monto: c.monto,
          pagado: c.pagado,
          saldo: c.saldo,
          estado: estadoCuota(c.estado),
        }))

        const saldo = ficha.saldo ?? 0

        return (
          <section key={ficha.equipo_torneo_id} className="mb-8">
            <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
              {ficha.torneo}
            </h2>
            <p className="mb-3 text-[11px] text-muted">
              {ficha.categoria} · Serie {ficha.serie}
            </p>

            <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <KpiCard tono="neutro" titulo="Total del plan" valor={ficha.total_plan ?? 0} />
              <KpiCard tono="positivo" titulo="Pagado" valor={ficha.total_pagado ?? 0} />
              <KpiCard tono={saldo > 0 ? 'alerta' : 'positivo'} titulo="Saldo" valor={saldo} />
              <KpiCard
                tono="info"
                titulo="Cuotas pagadas"
                valor={ficha.cuotas_pagadas ?? 0}
                formato="entero"
                subtitulo={`de ${ficha.cuotas_total ?? 0} cuotas`}
              />
            </div>

            {/* La fila de total se PASA desde la ficha: total_plan, total_pagado
                y saldo de `v_cuenta_corriente_equipo` son exactamente la suma de
                las columnas de esta tabla —verificado sobre las 28 fichas del
                set— así que no hace falta sumarlas acá, ni se hace. */}
            <DataTable
              columns={COLUMNAS}
              rows={filas}
              rowKey="cuota_id"
              maxHeight={420}
              total={{
                cuota_numero: 'Total',
                monto: ficha.total_plan ?? 0,
                pagado: ficha.total_pagado ?? 0,
                saldo,
              }}
              emptyMessage="Esta ficha no tiene cuotas generadas."
            />
          </section>
        )
      })}

      {/* ── Comunicar, DEBAJO y separado del cobro ──────────────────────────
          Arriba está lo que mueve plata: el botón «Registrar cobro» y las
          cuotas. Acá abajo, lo que le habla al equipo.

          La línea de por medio no es decorativa. Cobrar es irreversible —crea
          asiento y recibo— y avisar no; dos acciones pegadas se aprietan por
          reflejo, y una de las dos no tiene vuelta atrás. Es el mismo criterio
          que separó la descarga del envío en /comprobantes.

          Y era, hasta hoy, OTRA PANTALLA: /reclamos/[id] mostraba el mismo
          equipo con su propia tabla de las mismas cuotas, sin un solo link
          entre las dos. El operador que veía a un deudor acá tenía que volver
          al menú y buscarlo de nuevo allá. */}
      {resumen && (
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="mb-1 text-[13px] font-extrabold tracking-[-.2px] text-ink">
            Avisos y reclamos
          </h2>
          <p className="mb-4 text-[11px] leading-snug text-muted">
            El mensaje sale de la plantilla y queda registrado en el historial del equipo.
            {' '}El mail lo manda el sistema; el WhatsApp lo abre y lo mandás vos.
          </p>

          <ArmarReclamo
            terceroId={terceroId}
            resumen={resumen}
            cuotas={cuotas}
            contacto={terceroRes.data?.contacto ?? null}
            historial={historial}
            plantilla={plantilla ?? null}
            etapa={etapa}
            cuotaIdsAviso={momentoRes.data?.cuota_ids ?? null}
            puedeRegistrar={puedeRegistrarAviso}
            puedeMail={puedeMail}
          />
        </section>
      )}
    </div>
  )
}
