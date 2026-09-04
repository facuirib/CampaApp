import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { formatMoney } from '@/lib/format'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import Trasladar from './Trasladar'
import { Icon, KpiHero, type NombreIcono } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaCaja = Database['public']['Views']['v_saldo_caja']['Row']

/**
 * Qué es cada tipo de caja, y a qué familia pertenece.
 *
 * La familia no es decoración: separa las cajas que tienen **predio** —las de
 * efectivo, que se cuadran con arqueo por fecha y predio (regla 9)— de las que
 * no lo tienen ni pueden tenerlo. Agrupar por ahí explica de una por qué unas
 * muestran predio y otras no, que en la tabla anterior parecía un dato faltante.
 *
 * Los rótulos son «Efectivo» y «Transferencia», que es como se dice acá y en
 * toda la app (regla 5).
 */
const TIPO: Record<string, { label: string; icon: NombreIcono; familia: string }> = {
  efectivo: { label: 'Efectivo', icon: 'caja', familia: 'efectivo' },
  bar_efectivo: { label: 'Efectivo del bar', icon: 'bar', familia: 'efectivo' },
  transferencia: { label: 'Transferencia', icon: 'banco', familia: 'digital' },
  mercado_pago: { label: 'Mercado Pago', icon: 'monedas', familia: 'digital' },
  tarjeta: { label: 'Tarjeta', icon: 'monedas', familia: 'digital' },
  usd: { label: 'Dólares', icon: 'usd', familia: 'usd' },
}

const FAMILIAS: { clave: string; titulo: string; bajada: string }[] = [
  {
    clave: 'efectivo',
    titulo: 'Efectivo',
    bajada: 'Plata física, en un predio. Se cuadra con el arqueo del día.',
  },
  {
    clave: 'digital',
    titulo: 'Cuentas y medios digitales',
    bajada: 'Sin predio: no hay nada que contar a mano al cierre.',
  },
  { clave: 'usd', titulo: 'Dólares', bajada: 'Valuada al promedio ponderado de compra.' },
]

/**
 * Caja · los saldos, como una lista de cuentas.
 *
 * ── Por qué tarjetas y no una tabla ───────────────────────────────────────
 *
 * Una tabla trata a las cuatro columnas como igual de importantes, y acá no lo
 * son: el saldo es el número por el que se entra a esta pantalla, y el tipo y
 * el predio existen para ubicar a cuál pertenece. En la tabla el saldo salía en
 * el mismo cuerpo de 12px que el resto y había que buscarlo en la última
 * columna. Acá es lo más grande de cada tarjeta.
 *
 * ── Lo que se mantiene ────────────────────────────────────────────────────
 *
 * La tarjeta entera es el link a `/caja/[id]` —el historial de cómo se llegó a
 * ese saldo— y el negativo sigue en rojo, que era lo que la tabla ya hacía bien.
 * Un negativo además se marca con una banda al costado, porque el color solo no
 * alcanza para quien no lo distingue.
 *
 * ── Sin subtotales por familia ────────────────────────────────────────────
 *
 * Tentador, y sería sumar en el front (regla 1). El único total que se muestra
 * es el de `v_saldo_caja_total`, que lo calcula la base. Los encabezados de
 * familia cuentan cajas, que no es plata.
 */
export default async function CajaPage() {
  const supabase = await createClient()

  const [{ data: cajas, error: errorCajas }, { data: total, error: errorTotal }] =
    await Promise.all([
      supabase.from('v_saldo_caja').select('*').order('saldo', { ascending: false }),
      supabase.from('v_saldo_caja_total').select('*').maybeSingle(),
    ])

  const error = errorCajas ?? errorTotal
  const puedeTrasladar = puede(await rolActual(), 'caja.trasladar')

  const filas = (cajas ?? []) as FilaCaja[]
  // Una caja de un tipo que el front todavía no conoce cae igual en «digital»
  // en vez de desaparecer: es preferible verla mal agrupada que no verla.
  const familiaDe = (f: FilaCaja) => TIPO[f.tipo ?? '']?.familia ?? 'digital'

  return (
    <div className="pb-10">
      <header className="mb-5">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Caja</h1>
        <p className="mt-1 text-[12px] text-muted">
          Lo que hay disponible en cada caja. Tocá una para ver cómo llegó a ese número.
        </p>
      </header>

      {error && (
        <pre className="mb-4 rounded-md bg-errbg p-3 text-[11px] text-errtx">{error.message}</pre>
      )}

      {!error && (
        <>
          <KpiHero
            className="mb-6"
            valores={[
              { titulo: 'SALDO TOTAL EN CAJA', valor: total?.saldo_total ?? null, tono: 'info' },
              { titulo: 'CAJAS', valor: total?.cajas ?? null, formato: 'entero' },
            ]}
          />

          {puedeTrasladar && (
            <Trasladar
              cajas={filas.map((c) => ({
                caja_id: c.caja_id!,
                nombre: c.nombre ?? 'Caja',
                saldo: c.saldo ?? 0,
                predio_id: c.predio_id,
                predio: c.predio,
              }))}
            />
          )}

          {filas.length === 0 && (
            <p className="rounded-md border border-dashed border-line bg-panel px-4 py-10 text-center text-[11px] text-muted">
              No hay cajas registradas.
            </p>
          )}

          {FAMILIAS.map((fam) => {
            const suyas = filas.filter((f) => familiaDe(f) === fam.clave)
            if (suyas.length === 0) return null

            return (
              <section key={fam.clave} className="mb-7">
                <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <h2 className="text-[13px] font-extrabold tracking-[-.2px] text-ink">
                    {fam.titulo}
                  </h2>
                  <span className="text-[11px] text-muted">
                    · {suyas.length === 1 ? '1 caja' : `${suyas.length} cajas`} · {fam.bajada}
                  </span>
                </div>

                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(268px,1fr))]">
                  {suyas.map((c) => {
                    const saldo = c.saldo ?? 0
                    const negativo = saldo < 0
                    const t = TIPO[c.tipo ?? '']

                    return (
                      <Link
                        key={c.caja_id}
                        href={`/caja/${c.caja_id}`}
                        className={[
                          'group relative flex flex-col overflow-hidden rounded-md border bg-white pl-4 pr-4 py-3.5',
                          'transition-colors hover:border-ink/25 hover:bg-panel/40',
                          negativo ? 'border-errtx/30' : 'border-line',
                        ].join(' ')}
                      >
                        {/* La banda: un negativo no se distingue sólo por el
                            color del número, que es lo único que tenía la
                            tabla. Misma lógica que los badges. */}
                        <span
                          aria-hidden
                          className={`absolute inset-y-0 left-0 w-[3px] ${
                            negativo ? 'bg-errtx' : 'bg-line2'
                          }`}
                        />

                        <div className="flex items-start gap-2">
                          <Icon
                            name={t?.icon ?? 'caja'}
                            size={16}
                            className="mt-[1px] shrink-0 text-muted"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12.5px] font-extrabold leading-tight text-ink">
                              {c.nombre ?? 'Caja'}
                            </div>
                            <div className="mt-0.5 truncate text-[10.5px] text-muted">
                              {t?.label ?? c.tipo}
                              {c.predio && ` · ${c.predio}`}
                            </div>
                          </div>
                        </div>

                        {/* El saldo: lo más grande de la tarjeta, porque es el
                            número por el que se entra a esta pantalla. */}
                        <div
                          className={`cifra mt-3.5 text-[21px] font-extrabold leading-none tracking-[-.6px] ${
                            negativo ? 'text-errtx' : saldo === 0 ? 'text-muted' : 'text-ink'
                          }`}
                        >
                          {formatMoney(saldo)}
                        </div>

                        <div className="mt-3 flex items-center gap-1 text-[10.5px] font-semibold text-muted group-hover:text-blue-d">
                          Ver movimientos
                          <Icon
                            name="externo"
                            size={12}
                            className="transition-transform group-hover:translate-x-0.5"
                          />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
