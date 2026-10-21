"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/db/client'
import NuevoIngreso, { type CuentaIngreso, type Opcion } from '@/app/comprobantes/NuevoIngreso'

/**
 * El «Nuevo ingreso» de Comprobantes, embebido en el modal de cobro: carga
 * sus opciones del lado del cliente (misma consulta que la página — cuentas
 * de ingreso SIN circuito propio) y registra con la MISMA función
 * (registrar_ingreso_extraordinario). Cero motor nuevo: es el formulario de
 * siempre con otra percha.
 */
export default function NuevoIngresoModal({
  cuentaCodigo,
  onListo,
}: {
  /** Preseleccionar una categoría por código (ING_ESTACIONAMIENTO). */
  cuentaCodigo?: string
  onListo: () => void
}) {
  const [cuentas, setCuentas] = useState<CuentaIngreso[] | null>(null)
  const [terceros, setTerceros] = useState<Opcion[]>([])
  const [predios, setPredios] = useState<Opcion[]>([])
  const [torneos, setTorneos] = useState<Opcion[]>([])
  const [torneoActualId, setTorneoActualId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    const sb = createClient()
    async function cargar() {
      const [c, t, p, to, act] = await Promise.all([
        sb.from('cuenta').select('id, nombre, codigo').eq('tipo', 'ingreso').eq('imputable', true)
          .not('codigo', 'in', '("ING_INSCRIPCIONES","ING_PARTIDOS","ING_SPONSORS","ING_BAR")')
          .order('nombre'),
        sb.from('tercero').select('id, nombre').order('nombre'),
        sb.from('predio').select('id, nombre').order('nombre'),
        sb.from('torneo').select('id, nombre').eq('activo', true).order('anio', { ascending: false }),
        sb.from('v_torneo_actual').select('id').maybeSingle(),
      ])
      if (cancelado) return
      const err = c.error ?? t.error ?? p.error ?? to.error
      if (err) return setError(err.message)
      setCuentas((c.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre, codigo: x.codigo })))
      setTerceros((t.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre ?? '—' })))
      setPredios((p.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre ?? '—' })))
      setTorneos((to.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre ?? '—' })))
      setTorneoActualId(act.data?.id ?? null)
    }
    cargar()
    return () => { cancelado = true }
  }, [])

  if (error) return <p className="rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error}</p>
  if (!cuentas) return <p className="text-[11px] text-muted">Cargando…</p>

  return (
    <NuevoIngreso
      cuentas={cuentas}
      terceros={terceros}
      predios={predios}
      torneos={torneos}
      torneoActualId={torneoActualId}
      abiertoInicial
      cuentaInicial={cuentaCodigo ? cuentas.find((c) => c.codigo === cuentaCodigo)?.id : undefined}
      onListo={onListo}
    />
  )
}
