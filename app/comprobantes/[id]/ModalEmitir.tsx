'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card } from '@/components/ui'
import { formatMoneyExacto } from '@/lib/format'

import { emitirFacturaDeCobro, type ContextoEmision, type ResultadoEmision } from './emitir'

/**
 * El modal de emisión: cuatro pasos, y el último es una reconfirmación.
 *
 * **No es un botón con un «¿seguro?».** Emitir crea un documento fiscal real
 * ante ARCA: consume un número que no vuelve, existe desde el instante en que
 * se emite, y no se borra —se corrige con una nota de crédito, que es otro
 * comprobante—. Un flujo de un clic hace que eso pase por accidente.
 *
 * Los pasos no son burocracia: cada uno muestra algo que el usuario necesita
 * ver antes de decidir. El punto de venta decide el domicilio y con él un
 * impuesto municipal; la condición del receptor decide la letra; el resumen es
 * lo que va a quedar impreso. Recién después se pregunta.
 */

type Paso = 1 | 2 | 3 | 4

export default function ModalEmitir({
  comprobanteId,
  contexto,
  monto,
  detalle,
  fecha,
  onCerrar,
}: {
  comprobanteId: string
  contexto: ContextoEmision
  monto: number
  detalle: string | null
  fecha: string
  onCerrar: () => void
}) {
  const [paso, setPaso] = useState<Paso>(1)
  const [punto, setPunto] = useState<number | null>(null)
  const [emitiendo, setEmitiendo] = useState(false)
  const [resultado, setResultado] = useState<ResultadoEmision | null>(null)

  const puntoElegido = contexto.puntos.find((p) => p.numero === punto)
  const esA = contexto.letra === 'A'
  const neto = Math.round((monto / 1.21) * 100) / 100
  const iva = Math.round((monto - neto) * 100) / 100

  async function emitir() {
    if (!punto) return
    setEmitiendo(true)
    const r = await emitirFacturaDeCobro(comprobanteId, punto)
    setEmitiendo(false)
    setResultado(r)
  }

  // ── El resultado reemplaza al flujo: ya no hay nada que elegir ────────────
  if (resultado) {
    return (
      <Marco onCerrar={onCerrar} titulo={resultado.ok ? 'Factura emitida' : 'No se emitió'}>
        {resultado.ok ? (
          <>
            <div className="rounded-md bg-okbg px-4 py-3">
              <p className="text-[13px] font-extrabold text-oktx">
                Factura {resultado.letra} {String(resultado.puntoVenta).padStart(4, '0')}-
                {String(resultado.numero).padStart(8, '0')}
              </p>
              <p className="mt-1 text-[11.5px] text-oktx">
                CAE {resultado.cae}
                {resultado.caeVencimiento ? ` · vence ${resultado.caeVencimiento}` : ''}
              </p>
            </div>
            {!resultado.produccion && (
              <p className="mt-3 rounded-md bg-warnbg px-3 py-2 text-[11px] text-warntx">
                Emitida en <strong className="font-semibold">homologación</strong>: es un ensayo, no
                existe ante ARCA como comprobante fiscal.
              </p>
            )}
            <p className="mt-3 text-[11px] text-muted">
              Ya podés descargar el PDF desde esta pantalla. Recargá para verlo.
            </p>
          </>
        ) : resultado.pendiente ? (
          <>
            <p className="rounded-md bg-warnbg px-4 py-3 text-[12px] text-warntx">
              Se reservó el número{' '}
              <strong className="font-semibold">
                {String(resultado.puntoVenta).padStart(4, '0')}-
                {String(resultado.numero).padStart(8, '0')}
              </strong>{' '}
              y ARCA no llegó a contestar.
            </p>
            <p className="mt-3 text-[11.5px] leading-snug text-muted">
              El comprobante quedó en <strong className="font-semibold">pendiente</strong>. No se sabe
              desde acá si ARCA lo autorizó o no, y adivinarlo sería peor que decirlo: se resuelve
              preguntándole a ARCA si ese número existe, y cerrándolo o marcándolo como error según
              conteste.
            </p>
            <p className="mt-2 text-[11px] text-muted">{resultado.error}</p>
          </>
        ) : (
          <>
            <p className="rounded-md bg-errbg px-4 py-3 text-[12px] text-errtx">
              {resultado.rechazo ?? resultado.error}
            </p>
            {resultado.rechazo && (
              <p className="mt-3 text-[11.5px] leading-snug text-muted">
                <strong className="font-semibold">El número quedó liberado.</strong> El reintento
                vuelve a pedir el mismo, así que no queda un hueco en la numeración — que es lo que
                ARCA no perdona.
              </p>
            )}
          </>
        )}
        <div className="mt-5 flex justify-end">
          <Button onClick={onCerrar}>Cerrar</Button>
        </div>
      </Marco>
    )
  }

  return (
    <Marco onCerrar={onCerrar} titulo="Emitir factura" paso={paso}>
      {/* ── 1 · El punto de venta ──────────────────────────────────────── */}
      {paso === 1 && (
        <>
          <p className="mb-4 text-[11.5px] leading-snug text-muted">
            Elegí desde qué punto se factura.{' '}
            <strong className="font-semibold">El domicilio determina Comercio e Industria</strong>,
            un impuesto municipal que se paga según dónde se emite — por eso no hay uno por defecto.
          </p>
          <div className="space-y-2">
            {contexto.puntos.map((p) => (
              <button
                key={p.numero}
                onClick={() => setPunto(p.numero)}
                className={`w-full rounded-md border px-4 py-3 text-left transition ${
                  punto === p.numero
                    ? 'border-blue bg-infobg'
                    : 'border-line bg-white hover:border-blue/40'
                }`}
              >
                <span className="text-[12.5px] font-bold text-ink">
                  {String(p.numero).padStart(4, '0')} · {p.nombre}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">{p.domicilio}</span>
              </button>
            ))}
          </div>
          <Pie>
            <Button variant="tertiary" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button disabled={!punto} onClick={() => setPaso(2)}>
              Siguiente
            </Button>
          </Pie>
        </>
      )}

      {/* ── 2 · El receptor, y la letra que se deriva de él ────────────── */}
      {paso === 2 && (
        <>
          <Dato etiqueta="Se le factura a">{contexto.clienteNombre}</Dato>
          <Dato etiqueta="Condición frente al IVA">
            {contexto.condicionIva ?? <span className="text-muted">sin declarar</span>}
          </Dato>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Sale
            </span>
            <Badge estado="info">Factura {contexto.letra}</Badge>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            La letra no se elige: la determina la condición del receptor. Sólo un Responsable
            Inscripto recibe Factura A.
          </p>

          {!contexto.puedeEmitir && (
            <div className="mt-4 rounded-md bg-errbg px-4 py-3">
              <p className="text-[12px] font-bold text-errtx">
                Faltan datos para emitir una Factura A
              </p>
              <p className="mt-1 text-[11.5px] text-errtx">Falta: {contexto.falta}.</p>
              <Link
                href={`/clientes/${contexto.terceroId}`}
                className="mt-2 inline-block text-[11.5px] font-semibold text-errtx underline"
              >
                Completar la ficha del cliente →
              </Link>
            </div>
          )}

          {contexto.sinCondicion && contexto.puedeEmitir && (
            <div className="mt-4 rounded-md bg-warnbg px-4 py-3">
              <p className="text-[11.5px] leading-snug text-warntx">
                Este cliente no tiene condición de IVA declarada, así que se emitiría{' '}
                <strong className="font-semibold">Factura B a Consumidor Final sin identificar</strong>.
                Es válido, pero si el equipo la necesita a su nombre hay que cargarle los datos.
              </p>
              <Link
                href={`/clientes/${contexto.terceroId}`}
                className="mt-2 inline-block text-[11.5px] font-semibold text-warntx underline"
              >
                Cargar los datos del cliente →
              </Link>
            </div>
          )}

          <Pie>
            <Button variant="tertiary" onClick={() => setPaso(1)}>
              Atrás
            </Button>
            <Button disabled={!contexto.puedeEmitir} onClick={() => setPaso(3)}>
              Siguiente
            </Button>
          </Pie>
        </>
      )}

      {/* ── 3 · El resumen: lo que va a salir impreso ──────────────────── */}
      {paso === 3 && (
        <>
          <p className="mb-4 text-[11.5px] text-muted">Esto es lo que va a decir la factura.</p>
          <div className="space-y-3 rounded-md border border-line bg-panel/50 p-4">
            <Dato etiqueta="Cobro">
              {detalle ?? '—'} · {fecha}
            </Dato>
            <Dato etiqueta="Receptor">
              {contexto.clienteNombre} · {contexto.condicionIva ?? 'Consumidor Final'}
            </Dato>
            <Dato etiqueta="Punto de venta">
              {String(puntoElegido!.numero).padStart(4, '0')} · {puntoElegido!.nombre}
              <span className="mt-0.5 block text-[11px] text-muted">{puntoElegido!.domicilio}</span>
            </Dato>
            <div className="border-t border-line pt-3">
              {/* El neto y el IVA sólo se muestran en la A: en la B el precio va
                  con el impuesto adentro y discriminarlo no corresponde. */}
              {esA && (
                <>
                  <Linea etiqueta="Neto gravado" valor={formatMoneyExacto(neto)} />
                  <Linea etiqueta="IVA 21%" valor={formatMoneyExacto(iva)} />
                </>
              )}
              <Linea etiqueta="Total" valor={formatMoneyExacto(monto)} fuerte />
            </div>
          </div>
          <Pie>
            <Button variant="tertiary" onClick={() => setPaso(2)}>
              Atrás
            </Button>
            <Button onClick={() => setPaso(4)}>Siguiente</Button>
          </Pie>
        </>
      )}

      {/* ── 4 · La reconfirmación ──────────────────────────────────────── */}
      {paso === 4 && (
        <>
          {contexto.produccion ? (
            <div className="rounded-md border-2 border-errtx/30 bg-errbg px-4 py-4">
              <p className="text-[13px] font-extrabold text-errtx">
                Esto emite una factura FISCAL REAL ante ARCA
              </p>
              <ul className="mt-3 space-y-1.5 text-[11.5px] leading-snug text-errtx">
                <li>
                  · Consume un número del punto {String(puntoElegido!.numero).padStart(4, '0')}, y
                  ese número no se recupera.
                </li>
                <li>· Existe ante ARCA desde el instante en que se emite.</li>
                <li>
                  · <strong className="font-semibold">No se puede borrar</strong>: sólo se corrige
                  con una nota de crédito, que es otro comprobante.
                </li>
              </ul>
            </div>
          ) : (
            <div className="rounded-md border border-line bg-warnbg px-4 py-4">
              <p className="text-[13px] font-extrabold text-warntx">Ensayo en homologación</p>
              <p className="mt-2 text-[11.5px] leading-snug text-warntx">
                <code className="rounded bg-white/50 px-1">ARCA_PRODUCCION</code> no está en{' '}
                <code className="rounded bg-white/50 px-1">true</code>, así que esto va contra el
                entorno de prueba: <strong className="font-semibold">no emite nada real</strong> y no
                consume numeración fiscal.
              </p>
            </div>
          )}

          <Pie>
            <Button variant="tertiary" disabled={emitiendo} onClick={() => setPaso(3)}>
              Atrás
            </Button>
            {/* El botón nombra el acto entero —letra, monto y destino— en vez de
                decir «Confirmar». Un «OK» se aprieta sin leer; una frase que
                dice qué y por cuánto obliga a mirar antes. */}
            <Button loading={emitiendo} disabled={emitiendo} onClick={emitir}>
              Emitir Factura {contexto.letra} por {formatMoneyExacto(monto)}
              {contexto.produccion ? ' ante ARCA' : ' (ensayo)'}
            </Button>
          </Pie>
        </>
      )}
    </Marco>
  )
}

// ── Piezas del modal ───────────────────────────────────────────────────────

function Marco({
  titulo,
  paso,
  children,
  onCerrar,
}: {
  titulo: string
  paso?: Paso
  children: React.ReactNode
  onCerrar: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-[520px]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-extrabold text-ink">{titulo}</h2>
            {paso && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Paso {paso} de 4
              </span>
            )}
          </div>
          {children}
        </Card>
      </div>
      <button className="sr-only" onClick={onCerrar}>
        Cerrar
      </button>
    </div>
  )
}

const Pie = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-6 flex justify-between gap-3">{children}</div>
)

const Dato = ({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) => (
  <div className="mt-3 first:mt-0">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{etiqueta}</p>
    <p className="mt-0.5 text-[12.5px] text-ink">{children}</p>
  </div>
)

const Linea = ({
  etiqueta,
  valor,
  fuerte,
}: {
  etiqueta: string
  valor: string
  fuerte?: boolean
}) => (
  <div className="flex items-baseline justify-between py-0.5">
    <span className={`text-[11.5px] ${fuerte ? 'font-bold text-ink' : 'text-muted'}`}>
      {etiqueta}
    </span>
    <span className={fuerte ? 'text-[15px] font-extrabold text-ink' : 'text-[12px] text-ink'}>
      {valor}
    </span>
  </div>
)
