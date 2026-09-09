"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Badge, Button, Field, Input, Select } from '@/components/ui'

export interface CatGastoFila {
  id: string
  nombre: string
  naturaleza: string
  area: string
  cuenta_id: string
  cuenta: string
  imputacion_default: string
  unidad_default: string | null
  activo: boolean
}

export interface CuentaElegible {
  id: string
  nombre: string
}

/**
 * Los dos ejes del gasto (concepto 4 del proyecto) son datos de estas listas:
 * naturaleza dice CÓMO se repite y area dice DÓNDE pertenece. Son constantes
 * del MODELO —los checks de la tabla las fijan—, no datos de un torneo, así
 * que escribirlas acá no viola la regla 12.
 */
const NATURALEZAS = [
  { valor: 'por_fecha', label: 'Por fecha' },
  { valor: 'recurrente', label: 'Recurrente' },
  { valor: 'eventual', label: 'Eventual' },
  { valor: 'inversion', label: 'Inversión' },
]
const AREAS = [
  { valor: 'torneo', label: 'Torneo' },
  { valor: 'predio', label: 'Predio' },
  { valor: 'bar', label: 'Bar' },
  { valor: 'administracion', label: 'Administración' },
]
const IMPUTACIONES = [
  { valor: 'torneo', label: 'Al torneo' },
  { valor: 'estructura', label: 'Estructura' },
]
// Sin opción vacía: la columna es NOT NULL — toda categoría dice cómo se
// presupuesta, aunque sea «única vez».
const UNIDADES = [
  { valor: 'por_partido', label: 'Por partido' },
  { valor: 'por_dia_cancha', label: 'Por día de cancha' },
  { valor: 'por_mes', label: 'Por mes' },
  { valor: 'anual', label: 'Anual' },
  { valor: 'unico', label: 'Única vez' },
]

interface Formulario {
  nombre: string
  naturaleza: string
  area: string
  cuenta_id: string
  imputacion_default: string
  unidad_default: string
}

const VACIO: Formulario = {
  nombre: '',
  naturaleza: 'eventual',
  area: 'torneo',
  cuenta_id: '',
  imputacion_default: 'torneo',
  unidad_default: 'unico',
}

/**
 * El ABM de categorías de gasto — las tres funciones existían sin pantalla.
 *
 * Desactivar y no borrar: una categoría con gastos cargados es historia. El
 * trigger `check_gasto_coherente` valida naturaleza × anclaje al CARGAR un
 * gasto, así que una categoría mal armada no rompe nada retroactivo — frena
 * el próximo gasto, con su mensaje.
 */
export default function EditorCatGasto({
  categorias,
  cuentas,
}: {
  categorias: CatGastoFila[]
  cuentas: CuentaElegible[]
}) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Formulario>(VACIO)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function llamar(fn: 'crear_cat_gasto' | 'editar_cat_gasto' | 'desactivar_cat_gasto', args: Record<string, unknown>) {
    setOcupado(true)
    setError(null)
    // @ts-expect-error — nombre dinámico entre tres firmas distintas
    const { error: err } = await createClient().rpc(fn, args)
    setOcupado(false)
    if (err) return setError(err.message)
    setEditando(null)
    setCreando(false)
    setForm(VACIO)
    router.refresh()
  }

  const campos = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Nombre" required>
        <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
      </Field>
      <Field label="Naturaleza" required hint="Cómo se repite.">
        <Select value={form.naturaleza} onChange={(e) => setForm({ ...form, naturaleza: e.target.value })}>
          {NATURALEZAS.map((n) => (
            <option key={n.valor} value={n.valor}>{n.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Área" required hint="A qué parte de la empresa pertenece.">
        <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
          {AREAS.map((a) => (
            <option key={a.valor} value={a.valor}>{a.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Cuenta contable" required hint="A dónde va el devengo.">
        <Select placeholder="Elegir…" value={form.cuenta_id} onChange={(e) => setForm({ ...form, cuenta_id: e.target.value })}>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </Select>
      </Field>
      <Field label="Imputación por defecto" required>
        <Select value={form.imputacion_default} onChange={(e) => setForm({ ...form, imputacion_default: e.target.value })}>
          {IMPUTACIONES.map((i) => (
            <option key={i.valor} value={i.valor}>{i.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Unidad para presupuestar" hint="Cómo la multiplica el presupuesto.">
        <Select value={form.unidad_default} onChange={(e) => setForm({ ...form, unidad_default: e.target.value })}>
          {UNIDADES.map((u) => (
            <option key={u.valor} value={u.valor}>{u.label}</option>
          ))}
        </Select>
      </Field>
    </div>
  )

  const args = () => ({
    p_nombre: form.nombre.trim(),
    p_naturaleza: form.naturaleza,
    p_area: form.area,
    p_cuenta_id: form.cuenta_id,
    p_imputacion_default: form.imputacion_default,
    p_unidad_default: form.unidad_default,
  })

  return (
    <div>
      {error && (
        <p className="mb-4 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-line bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-panel text-[9px] uppercase tracking-[.06em] text-muted">
            <tr>
              <th className="px-4 py-2 text-left font-bold">Categoría</th>
              <th className="px-3 py-2 text-left font-bold">Naturaleza</th>
              <th className="px-3 py-2 text-left font-bold">Área</th>
              <th className="px-3 py-2 text-left font-bold">Cuenta</th>
              <th className="px-3 py-2 text-left font-bold">Unidad</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {categorias.map((c) => (
              <tr key={c.id} className={`border-t border-line2 ${c.activo ? '' : 'opacity-50'}`}>
                <td className="px-4 py-2.5 font-semibold text-ink">
                  {c.nombre}
                  {!c.activo && (
                    <span className="ml-2"><Badge estado="neutro">Inactiva</Badge></span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted">
                  {NATURALEZAS.find((n) => n.valor === c.naturaleza)?.label ?? c.naturaleza}
                </td>
                <td className="px-3 py-2.5 text-muted">
                  {AREAS.find((a) => a.valor === c.area)?.label ?? c.area}
                </td>
                <td className="px-3 py-2.5 text-muted">{c.cuenta}</td>
                <td className="px-3 py-2.5 text-muted">
                  {UNIDADES.find((u) => u.valor === (c.unidad_default ?? ''))?.label ?? c.unidad_default}
                </td>
                <td className="px-4 py-1.5 text-right">
                  {c.activo && (
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="pill"
                        variant="secondary"
                        disabled={ocupado}
                        onClick={() => {
                          setEditando(c.id)
                          setCreando(false)
                          setForm({
                            nombre: c.nombre,
                            naturaleza: c.naturaleza,
                            area: c.area,
                            cuenta_id: c.cuenta_id,
                            imputacion_default: c.imputacion_default,
                            unidad_default: c.unidad_default ?? '',
                          })
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        size="pill"
                        variant="tertiary"
                        disabled={ocupado}
                        onClick={() => llamar('desactivar_cat_gasto', { p_cat_gasto_id: c.id })}
                      >
                        Desactivar
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(creando || editando) && (
        <div className="mt-4 rounded-md border border-line bg-white p-4">
          <h3 className="mb-3 text-[12.5px] font-extrabold text-ink">
            {creando ? 'Nueva categoría' : 'Editar la categoría'}
          </h3>
          {campos}
          <div className="mt-4 flex gap-2">
            <Button
              icon="check"
              loading={ocupado}
              disabled={ocupado || !form.nombre.trim() || !form.cuenta_id}
              onClick={() =>
                creando
                  ? llamar('crear_cat_gasto', args())
                  : llamar('editar_cat_gasto', { p_cat_gasto_id: editando, ...args() })
              }
            >
              Guardar
            </Button>
            <Button
              variant="tertiary"
              disabled={ocupado}
              onClick={() => {
                setCreando(false)
                setEditando(null)
                setForm(VACIO)
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {!creando && !editando && (
        <div className="mt-4">
          <Button variant="secondary" icon="plus" onClick={() => { setCreando(true); setForm(VACIO) }}>
            Nueva categoría
          </Button>
        </div>
      )}
    </div>
  )
}
