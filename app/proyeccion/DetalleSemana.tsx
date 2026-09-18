"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { formatDate, formatMoney } from '@/lib/format'
import { Badge, Field, Select, type EstadoBadge } from '@/components/ui'
import { etiquetaOrigen, hrefOrigenComprometido } from '@/lib/domain/cashflow'

type Nivel = 'real' | 'comprometido' | 'estimado'

interface FilaDetalle {
  nivel: Nivel
  fecha: string
  origen: string | null
  detalle: string | null
  monto: number
  arrastrada: boolean
  href: string | null
}

const BADGE_NIVEL: Record<Nivel, { estado: EstadoBadge; label: string }> = {
  real: { estado: 'ok', label: 'Real' },
  comprometido: { estado: 'info', label: 'Comprometido' },
  estimado: { estado: 'neutro', label: 'Estimado' },
}

/**
 * El detalle de un período, cargado al abrirlo — no de arrancada.
 *
 * Reemplaza a `/proyeccion/[periodo]`, que hacía esta misma consulta (las
 * tres vistas, filtradas por fecha) pero en su propia ruta. Acá vive inline,
 * así que el fetch es del cliente y no del servidor: si se trajera server-side
 * para las N filas de la tabla, sería 3×N consultas en cada carga de
 * `/proyeccion` aunque nadie despliegue ninguna. Se trae UNA vez, la primera
 * vez que esta fila se abre, y se cachea en el estado de este componente —
 * cerrar y volver a abrir no dispara una segunda consulta porque
 * `FilaPeriodo` no desmonta este componente, sólo lo esconde.
 *
 * Los filtros de origen/nivel son EN MEMORIA sobre lo ya traído: es un
 * período (una semana, un mes) de movimientos, no una tabla completa —
 * filtrar de nuevo en la base por cada cambio de `<select>` sería una
 * consulta de red por cada click en algo que ya está en el navegador.
 */
export default function DetalleSemana({ desde, hasta }: { desde: string; hasta: string }) {
  const [filas, setFilas] = useState<FilaDetalle[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtroNivel, setFiltroNivel] = useState('')
  const [filtroOrigen, setFiltroOrigen] = useState('')

  useEffect(() => {
    let cancelado = false
    setFilas(null)
    setError(null)

    async function cargar() {
      const supabase = createClient()
      const [real, comprometido, estimado] = await Promise.all([
        supabase.from('v_cashflow_real').select('*').gte('fecha', desde).lt('fecha', hasta).order('fecha'),
        supabase
          .from('v_cashflow_comprometido')
          .select('*')
          .gte('fecha', desde)
          .lt('fecha', hasta)
          .order('fecha'),
        supabase
          .from('v_cashflow_estimado')
          .select('*')
          .gte('fecha', desde)
          .lt('fecha', hasta)
          .order('fecha'),
      ])

      if (cancelado) return

      const err = real.error ?? comprometido.error ?? estimado.error
      if (err) {
        setError(err.message)
        return
      }

      const combinadas: FilaDetalle[] = [
        ...(real.data ?? []).map((f) => ({
          nivel: 'real' as const,
          fecha: f.fecha ?? desde,
          origen: f.origen,
          detalle: null,
          monto: f.monto ?? 0,
          arrastrada: false,
          href: null,
        })),
        ...(comprometido.data ?? []).map((f) => ({
          nivel: 'comprometido' as const,
          // La fecha ORIGINAL, no la corrida a hoy: acá se está mirando el
          // detalle de ESTE período, y `fecha` (con GREATEST) puede caer en
          // otra semana si está vencida y arrastrada.
          fecha: f.fecha_original ?? f.fecha ?? desde,
          origen: f.origen,
          detalle: f.detalle,
          monto: f.monto ?? 0,
          arrastrada: !!f.arrastrada,
          href: hrefOrigenComprometido(f.origen, f.tercero_id, f.origen_id),
        })),
        ...(estimado.data ?? []).map((f) => ({
          nivel: 'estimado' as const,
          fecha: f.fecha ?? desde,
          origen: f.origen,
          detalle: f.detalle,
          monto: f.monto ?? 0,
          arrastrada: false,
          href: null,
        })),
      ].sort((a, b) => a.fecha.localeCompare(b.fecha))

      setFilas(combinadas)
    }

    cargar()
    return () => {
      cancelado = true
    }
  }, [desde, hasta])

  if (error) {
    return <p className="px-4 py-4 text-[11px] text-errtx">{error}</p>
  }

  // El estado de carga que faltaba: sin esto, el click en "expandir" no se
  // sentía como que hizo algo hasta que la consulta volvía — nada cambiaba en
  // pantalla durante ese medio segundo.
  if (filas === null) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-[11px] text-muted">
        <span
          aria-hidden
          className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-blue"
        />
        Cargando el detalle…
      </div>
    )
  }

  if (filas.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-[11px] text-muted">
        Nada proyectado en este período.
      </p>
    )
  }

  const origenesDisponibles = [...new Set(filas.map((f) => f.origen).filter((o): o is string => !!o))]
    .sort((a, b) => etiquetaOrigen(a).localeCompare(etiquetaOrigen(b)))

  const filtradas = filas.filter(
    (f) => (!filtroNivel || f.nivel === filtroNivel) && (!filtroOrigen || f.origen === filtroOrigen),
  )

  return (
    <div className="px-4 py-3">
      <div className="mb-3 flex flex-wrap gap-2">
        <Field label="Tipo" className="w-36">
          <Select placeholder="Todos" value={filtroNivel} onChange={(e) => setFiltroNivel(e.target.value)}>
            <option value="real">Real</option>
            <option value="comprometido">Comprometido</option>
            <option value="estimado">Estimado</option>
          </Select>
        </Field>
        <Field label="Origen" className="w-56">
          <Select placeholder="Todos" value={filtroOrigen} onChange={(e) => setFiltroOrigen(e.target.value)}>
            {origenesDisponibles.map((o) => (
              <option key={o} value={o}>
                {etiquetaOrigen(o)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {filtradas.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-muted">Nada con ese filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-white">
          <table className="w-full text-[11px]">
            <thead className="bg-panel text-[8.5px] uppercase tracking-[.06em] text-muted">
              <tr>
                <th className="px-3 py-1.5 text-left font-bold">Tipo</th>
                <th className="px-3 py-1.5 text-left font-bold">Fecha</th>
                <th className="px-3 py-1.5 text-left font-bold">Origen</th>
                <th className="px-3 py-1.5 text-left font-bold">Detalle</th>
                <th className="px-3 py-1.5 text-right font-bold">Monto</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((f, i) => (
                <tr key={i} className="border-t border-line2">
                  <td className="px-3 py-1.5">
                    <Badge estado={BADGE_NIVEL[f.nivel].estado}>{BADGE_NIVEL[f.nivel].label}</Badge>
                  </td>
                  <td className="px-3 py-1.5 text-muted">
                    {formatDate(f.fecha)}
                    {f.arrastrada && ' · arrastrada'}
                  </td>
                  <td className="px-3 py-1.5 text-muted">{etiquetaOrigen(f.origen)}</td>
                  <td className="px-3 py-1.5 text-ink">
                    {f.href ? (
                      <Link href={f.href} className="text-blue-d hover:underline">
                        {f.detalle ?? etiquetaOrigen(f.origen)}
                      </Link>
                    ) : (
                      (f.detalle ?? '—')
                    )}
                  </td>
                  <td
                    className={`cifra px-3 py-1.5 text-right font-bold ${
                      f.monto < 0 ? 'text-errtx' : 'text-oktx'
                    }`}
                  >
                    {f.monto > 0 ? '+' : ''}
                    {formatMoney(f.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
