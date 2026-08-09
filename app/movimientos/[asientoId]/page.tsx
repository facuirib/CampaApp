import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { formatDate } from '@/lib/format'
import { formatPeriodo, rotuloOrigen } from '@/lib/domain/asiento'
import { Badge, DataTable, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type LineaRow = Database['public']['Views']['v_asiento_detalle']['Row']

/**
 * El segmento acepta cualquier texto, así que se valida ANTES de consultar: si
 * no es un uuid, el error de Postgres —`invalid input syntax for type uuid`—
 * ni se produce. Mismo criterio que la cuenta corriente de cobranza.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface FilaLinea {
  indice: number
  cuenta: string
  tercero: string | null
  debe: number | null
  haber: number | null
}

const COLUMNAS: ColumnDef<FilaLinea>[] = [
  { key: 'cuenta', label: 'Cuenta' },
  { key: 'tercero', label: 'Tercero', width: 180 },
  { key: 'debe', label: 'Debe', format: 'money', width: 150 },
  { key: 'haber', label: 'Haber', format: 'money', width: 150 },
]

export default async function AsientoPage({ params }: { params: Promise<{ asientoId: string }> }) {
  const { asientoId } = await params
  if (!UUID.test(asientoId)) notFound()

  const supabase = await createClient()
  const [cabeceraRes, lineasRes] = await Promise.all([
    supabase.from('v_libro_diario').select('*').eq('asiento_id', asientoId).maybeSingle(),
    supabase.from('v_asiento_detalle').select('*').eq('asiento_id', asientoId),
  ])

  const error = cabeceraRes.error ?? lineasRes.error
  const asiento = cabeceraRes.data

  if (!error && !asiento) notFound()

  const filas: FilaLinea[] = (lineasRes.data ?? []).map((l: LineaRow, i: number) => ({
    // `v_asiento_detalle` no trae el id de la línea, así que la key es el
    // índice. Es estable: las líneas de un asiento no se reordenan ni se
    // editan — el asiento es inmutable (regla 4).
    indice: i,
    cuenta: `${l.cuenta_codigo} · ${l.cuenta}`,
    tercero: l.tercero,
    // Una línea toca UN lado: el otro viene en 0 desde la vista y se muestra
    // vacío, que es como se lee un asiento. Un "$0" en la columna de al lado
    // parece un importe y obliga a leer dos veces cuál es el que cuenta.
    debe: l.debe || null,
    haber: l.haber || null,
  }))

  return (
    <div className="pb-10">
      <Link href="/movimientos" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver al libro diario
      </Link>

      {error && (
        <p className="mt-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {asiento && (
        <>
          <header className="mb-6 mt-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">
                {asiento.descripcion}
              </h1>
              {asiento.anulado && <Badge estado="neutro">Anulado</Badge>}
              {asiento.periodo_estado === 'cerrado' && <Badge estado="info">Período cerrado</Badge>}
            </div>
            <p className="mt-1 text-[12px] text-muted">
              {formatDate(asiento.fecha)} · {rotuloOrigen(asiento.origen)} ·{' '}
              {formatPeriodo(asiento.anio, asiento.mes)}
              {asiento.torneo && ` · ${asiento.torneo}`}
              {asiento.predio && ` · ${asiento.predio}`}
              {asiento.jornada != null && ` · fecha ${asiento.jornada}`}
            </p>
          </header>

          {asiento.anulado && (
            <p className="mb-4 rounded-md bg-line2 px-4 py-3 text-[11px] text-neutrotx">
              Este asiento fue anulado por contraasiento. Sus líneas siguen acá porque el asiento no
              se edita ni se borra: lo que lo deja sin efecto es otro asiento con las líneas
              invertidas.
            </p>
          )}

          {/* El total se PASA desde v_libro_diario: total_debe y total_haber son
              la suma de estas mismas líneas, hecha en SQL. Y el trigger
              trg_asiento_balanceado garantiza que sean iguales, así que no hace
              falta compararlos acá para decidir si mostrar un ✓. */}
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            rowKey="indice"
            maxHeight={520}
            total={{
              cuenta: 'Total',
              debe: asiento.total_debe ?? 0,
              haber: asiento.total_haber ?? 0,
            }}
            emptyMessage="Este asiento no tiene líneas."
          />
        </>
      )}
    </div>
  )
}
