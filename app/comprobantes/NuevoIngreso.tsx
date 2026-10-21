"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button, Field, Input, InputMonto, Select } from '@/components/ui'

export interface CuentaIngreso {
  id: string
  nombre: string
  codigo: string
}

export interface Opcion {
  id: string
  nombre: string
}

/**
 * Registrar un ingreso que no es cuota — y facturarlo si corresponde.
 *
 * Fase B del Grupo A (20/10): el botón que faltaba en Comprobantes. Un
 * alquiler del predio, el estacionamiento, un servicio a un tercero: se
 * registra acá (la plata ya entró — v1 es percibido: se factura JUNTO con el
 * cobro, no antes), nace su recibo interno, y si se marcó «emitir factura»
 * se navega directo al recibo, donde vive el botón de emisión de siempre.
 *
 * Las categorías son las cuentas de ingreso imputables SIN circuito propio
 * (la página las filtra): una cuenta nueva del contador aparece acá sola.
 * «Otros ingresos» existe, y por eso el concepto es obligatorio siempre —
 * el detalle descriptivo es lo que evita que «Otros» sea una bolsa vaga.
 */
export default function NuevoIngreso({
  cuentas,
  terceros,
  predios,
  torneos,
  torneoActualId,
  abiertoInicial = false,
  cuentaInicial,
  onListo,
}: {
  cuentas: CuentaIngreso[]
  terceros: Opcion[]
  predios: Opcion[]
  torneos: Opcion[]
  torneoActualId: string | null
  /** Arrancar con el formulario abierto (llegada con ?nuevo= — el acceso del modal de cobro). */
  abiertoInicial?: boolean
  /** La categoría ya elegida (id de cuenta) — ?nuevo=estacionamiento la trae puesta. */
  cuentaInicial?: string
  /** Montado en el modal de cobro: se llama al terminar o cancelar, en vez de colapsarse. */
  onListo?: () => void
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [cuenta, setCuenta] = useState(cuentaInicial ?? '')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState(0)
  const [medio, setMedio] = useState<'efectivo' | 'transferencia' | 'mercado_pago'>('transferencia')
  const [fecha, setFecha] = useState('')
  const [tercero, setTercero] = useState('')
  const [predio, setPredio] = useState('')
  const [torneo, setTorneo] = useState(torneoActualId ?? '')
  const [facturar, setFacturar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  async function registrar() {
    setOcupado(true)
    setError(null)
    const sb = createClient()
    const { data: ingresoId, error: err } = await sb.rpc('registrar_ingreso_extraordinario', {
      p_monto: monto,
      p_medio: medio,
      p_fecha: fecha,
      p_concepto: concepto.trim(),
      p_cuenta_ingreso: cuenta,
      ...(tercero ? { p_tercero_id: tercero } : {}),
      ...(torneo ? { p_torneo_id: torneo } : {}),
      ...(predio ? { p_predio_id: predio } : {}),
    })
    if (err) {
      setOcupado(false)
      return setError(err.message)
    }
    // El recibo nació en la misma transacción: se lo busca por su pata.
    const { data: recibo } = await sb
      .from('v_comprobante')
      .select('id')
      .eq('ingreso_extraordinario_id', ingresoId as string)
      .eq('tipo_comprobante', 0)
      .maybeSingle()
    setOcupado(false)
    if (facturar && recibo?.id) {
      // Para facturar hace falta el tercero con datos fiscales: el detalle
      // del recibo tiene el botón Emitir de siempre, con sus validaciones.
      onListo?.() // si vive en el modal de cobro, que se cierre antes de navegar
      router.push(`/comprobantes/${recibo.id}`)
      return
    }
    if (onListo) {
      onListo()
      return
    }
    setExito(`Ingreso registrado. Recibo generado${recibo?.id ? '' : ' (no se encontró el recibo)'}.`)
    setAbierto(false)
    setConcepto('')
    setMonto(0)
    router.refresh()
  }

  if (!abierto) {
    return (
      <div className="mb-6">
        {exito && <p className="mb-3 rounded-md bg-okbg px-4 py-2.5 text-[11px] text-oktx">{exito}</p>}
        <Button variant="secondary" icon="plus" onClick={() => { setExito(null); setAbierto(true) }}>
          Nuevo ingreso
        </Button>
        <span className="ml-3 text-[10.5px] text-muted">
          Un ingreso que no es cuota: alquiler, estacionamiento, un servicio.
        </span>
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-md border border-line bg-white p-4">
      <h2 className="mb-1 text-[13px] font-extrabold text-ink">Nuevo ingreso</h2>
      <p className="mb-3 max-w-prose text-[11px] leading-snug text-muted">
        Registra plata que <strong className="font-semibold text-ink">ya entró</strong> y genera su
        recibo. La factura, si hace falta, se emite sobre ese recibo — junto con el cobro, no antes.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Categoría" required>
          <Select placeholder="Elegir…" value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Concepto"
          required
          className="lg:col-span-2"
          hint="Qué es esta plata — en «Otros ingresos», el detalle es obligatorio por diseño."
        >
          <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Alquiler del predio Aeropuerto — evento 25/10" />
        </Field>
        <Field label="Monto" required>
          <InputMonto value={monto} onChange={setMonto} />
        </Field>
        <Field label="Medio" required>
          <Select value={medio} onChange={(e) => setMedio(e.target.value as 'efectivo' | 'transferencia' | 'mercado_pago')}>
            <option value="transferencia">Transferencia</option>
            <option value="mercado_pago">Mercado Pago</option>
            <option value="efectivo">Efectivo</option>
          </Select>
        </Field>
        <Field label="Fecha" required>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Field label="Predio" hint={medio === 'efectivo' ? 'Obligatorio con efectivo (arqueo).' : 'Opcional: de qué predio es el ingreso.'}>
          <Select value={predio} onChange={(e) => setPredio(e.target.value)}>
            <option value="">{medio === 'efectivo' ? 'Elegir…' : 'Sin predio'}</option>
            {predios.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </Select>
        </Field>
        <Field label="Cliente" hint="Opcional — necesario si se va a facturar.">
          <Select value={tercero} onChange={(e) => setTercero(e.target.value)}>
            <option value="">Sin cliente</option>
            {terceros.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </Select>
        </Field>
        <Field label="Torneo" hint="Vacío = estructura.">
          <Select value={torneo} onChange={(e) => setTorneo(e.target.value)}>
            <option value="">Estructura</option>
            {torneos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </Select>
        </Field>
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-ink">
        <input type="checkbox" checked={facturar} onChange={(e) => setFacturar(e.target.checked)} className="size-3.5 accent-blue" />
        <span>
          <strong className="font-bold">Emitir factura</strong> — al registrar, te lleva al recibo
          para emitirla (pide cliente con datos fiscales).
        </span>
      </label>

      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error}</p>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          icon="check"
          loading={ocupado}
          disabled={ocupado || !cuenta || !concepto.trim() || monto <= 0 || !fecha || (medio === 'efectivo' && !predio) || (facturar && !tercero)}
          onClick={registrar}
        >
          Registrar ingreso
        </Button>
        <Button variant="tertiary" disabled={ocupado} onClick={() => (onListo ? onListo() : setAbierto(false))}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
