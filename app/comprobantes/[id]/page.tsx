import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/db/server'
import { rolActual } from '@/lib/rol-actual'
import { Badge, Card } from '@/components/ui'
import { formatDate, formatMoneyExacto } from '@/lib/format'

import BotonPdf from './BotonPdf'

const VE_LA_LISTA = ['admin', 'operador', 'read-only', 'finanzas']

/** Un par etiqueta/valor, que es casi todo lo que esta pantalla muestra. */
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-[12.5px] text-ink">{children ?? '—'}</p>
    </div>
  )
}

export default async function ComprobantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const rol = await rolActual()

  if (!rol || !VE_LA_LISTA.includes(rol)) {
    return (
      <main className="p-6">
        <p className="rounded-md bg-panel px-4 py-3 text-[12px] text-muted">
          Esta pantalla es de administración, operación y finanzas.
        </p>
      </main>
    )
  }

  const { data: c } = await supabase.from('v_comprobante').select('*').eq('id', id).single()
  if (!c) notFound()

  const esRecibo = !c.es_factura

  return (
    <main className="space-y-5 p-6">
      <div>
        <Link href="/comprobantes" className="text-[11px] text-muted hover:text-ink">
          ← Comprobantes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[19px] font-extrabold text-ink">
            {c.tipo_label} {c.numero_formateado}
          </h1>
          <Badge
            estado={
              c.estado === 'emitida' ? 'ok'
              : c.estado === 'generado' ? 'info'
              : c.estado === 'pendiente' ? 'porVencer'
              : 'mora'
            }
          >
            {c.estado_label}
          </Badge>
          {c.sin_origen && <Badge estado="neutro">Sin origen</Badge>}
        </div>
        <p className="mt-1 text-[12px] text-muted">
          Emitido el {formatDate(c.fecha_emision!)}
          {esRecibo
            ? ' · comprobante interno, sin validez fiscal'
            : ' · comprobante fiscal ante ARCA'}
        </p>
      </div>

      <Card>
        <h2 className="mb-4 text-[13px] font-extrabold text-ink">Receptor</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Dato label="Nombre">{c.receptor_nombre}</Dato>
          <Dato label="Documento">{c.receptor_doc}</Dato>
          <Dato label="Condición frente al IVA">{c.condicion_iva}</Dato>
          <Dato label="Domicilio">{c.receptor_domicilio}</Dato>
        </div>
        <p className="mt-4 text-[11px] leading-snug text-muted">
          Estos datos están <strong className="font-semibold">congelados</strong> en el comprobante:
          son los que tenía el receptor al emitirlo, no los de ahora. Por eso reimprimirlo dentro de
          diez años da el mismo papel.
        </p>
      </Card>

      <Card>
        <h2 className="mb-4 text-[13px] font-extrabold text-ink">Importes</h2>
        {/* El neto y el IVA sólo se muestran en la factura. En el recibo son
            NULL —el constraint sólo los exige para tipo <> 0— y pintarlos daría
            «$0,00», que no es «cero pesos de IVA» sino «este dato no existe».
            Mostrar un cero inventa una cifra. */}
        <div className={`grid gap-4 ${c.es_factura ? 'sm:grid-cols-3' : ''}`}>
          {c.es_factura && (
            <>
              <Dato label="Neto gravado">{formatMoneyExacto(Number(c.neto))}</Dato>
              <Dato label="IVA 21%">{formatMoneyExacto(Number(c.iva))}</Dato>
            </>
          )}
          <Dato label="Total">
            <span className="text-[16px] font-extrabold">
              {formatMoneyExacto(Number(c.monto))}
            </span>
          </Dato>
        </div>
        {c.detalle && (
          <div className="mt-4 border-t border-line pt-4">
            <Dato label="Detalle">{c.detalle}</Dato>
          </div>
        )}
        {esRecibo && (
          <p className="mt-4 text-[11px] text-muted">
            El recibo no discrimina IVA: no es un comprobante fiscal, y por eso sólo lleva el
            total.
          </p>
        )}
      </Card>

      {!esRecibo && (
        <Card>
          <h2 className="mb-4 text-[13px] font-extrabold text-ink">Datos fiscales</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Dato label="Punto de venta">{c.punto_venta}</Dato>
            <Dato label="Domicilio de emisión">{c.emisor_domicilio}</Dato>
            {/* El CAE completo va acá y no en la lista: es un número de 14 dígitos
                que nadie lee de un vistazo, y éste es el lugar donde se lo copia. */}
            <Dato label="CAE">
              <span className="font-mono">{c.cae}</span>
            </Dato>
            <Dato label="Vencimiento del CAE">
              {c.cae_vencimiento ? (
                formatDate(c.cae_vencimiento)
              ) : (
                <span className="text-muted">A completar</span>
              )}
            </Dato>
          </div>
          <p className="mt-4 text-[11px] leading-snug text-muted">
            El domicilio de emisión es el del punto de venta{' '}
            <strong className="font-semibold">al momento de emitir</strong>, congelado en el
            comprobante. Es el que determina Comercio e Industria.
          </p>
        </Card>
      )}

      {c.sin_origen && (
        <Card>
          <h2 className="mb-2 text-[13px] font-extrabold text-ink">Sin origen</h2>
          <p className="text-[12px] text-ink">{c.motivo_sin_origen}</p>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            Este comprobante existe en ARCA pero no nació de un cobro del sistema: se cargó a mano
            para que el registro esté completo. Es la única excepción a la regla de que todo
            comprobante se rastrea hasta su cobro, y hay que marcarla activamente.
          </p>
        </Card>
      )}

      {/* ── Qué se puede hacer, según el estado ───────────────────────────── */}
      {c.tiene_pdf ? (
        <Card>
          <h2 className="mb-3 text-[13px] font-extrabold text-ink">Documento</h2>
          <BotonPdf comprobanteId={c.id!} />
          <p className="mt-3 text-[11px] leading-snug text-muted">
            El PDF se genera en el momento a partir de esta fila. No se guarda en ningún lado: como
            la fila no cambia, bajarlo de nuevo da siempre el mismo documento.
          </p>
        </Card>
      ) : c.estado === 'pendiente' ? (
        <Card>
          <h2 className="mb-2 text-[13px] font-extrabold text-ink">Esperando a ARCA</h2>
          <p className="text-[12px] text-ink">
            Reservó el número <strong className="font-semibold">{c.numero_formateado}</strong> y
            todavía no recibió el CAE.
          </p>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            No hay PDF para bajar, y no es una limitación: sin CAE no hay comprobante emitido, y un
            papel con este formato <strong className="font-semibold">parecería una factura</strong>{' '}
            sin serlo.
            <br />
            Se resuelve preguntándole a ARCA si ese número existe —con{' '}
            <code className="rounded bg-panel px-1">FECompConsultar</code>— y cerrándolo con el CAE
            o marcándolo como error según conteste.
          </p>
        </Card>
      ) : (
        <Card>
          <h2 className="mb-2 text-[13px] font-extrabold text-ink">ARCA lo rechazó</h2>
          {c.error_detalle && (
            <p className="rounded-md bg-errbg px-3 py-2 text-[11.5px] text-errtx">
              {c.error_detalle}
            </p>
          )}
          <p className="mt-3 text-[11px] leading-snug text-muted">
            No hay PDF: nunca se emitió. La fila queda como registro del intento.
            <br />
            <strong className="font-semibold">El número quedó liberado</strong> — los únicos de
            comprobante excluyen las filas en error, así que el reintento vuelve a pedir el mismo
            número. No queda un hueco en la numeración, que es lo que ARCA no perdona.
          </p>
        </Card>
      )}
    </main>
  )
}
