import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import EditorCatGasto from './EditorCatGasto'

/**
 * El catálogo de categorías de gasto — los dos ejes del gasto, editables.
 *
 * Cada categoría cruza naturaleza (cómo se repite: por fecha, recurrente,
 * eventual, inversión) con área (dónde pertenece: torneo, predio, bar,
 * administración), y apunta a la cuenta contable donde devenga. El trigger
 * `check_gasto_coherente` valida el cruce al cargar cada gasto — esta
 * pantalla arma las categorías; la coherencia la sigue garantizando la base.
 *
 * Las tres funciones del ABM existían sin pantalla: una categoría nueva
 * («Seguridad», «Riego del predio») era un pedido de SQL a mano.
 */
export default async function CatGastoPage() {
  const supabase = await createClient()
  const [catsRes, cuentasRes, rol] = await Promise.all([
    supabase.from('cat_gasto').select('*').order('area').order('nombre'),
    // Las cuentas donde un gasto puede devengar: egreso para el gasto común,
    // activo para la naturaleza inversión (bienes de uso).
    supabase.from('cuenta').select('id, codigo, nombre').in('tipo', ['egreso', 'activo']).order('codigo'),
    rolActual(),
  ])

  const error = catsRes.error ?? cuentasRes.error
  const puedeEditar = puede(rol, 'gasto.catalogo')
  const cuentaNombre = new Map((cuentasRes.data ?? []).map((c) => [c.id, `${c.codigo} · ${c.nombre}`]))

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Categorías de gasto</h1>
        <p className="mt-1 max-w-[82ch] text-[12px] text-muted">
          Cada categoría cruza <strong className="font-semibold text-ink">cómo se repite</strong>{' '}
          (naturaleza) con <strong className="font-semibold text-ink">dónde pertenece</strong>{' '}
          (área), y dice a qué cuenta contable va el devengo. Una categoría con gastos cargados no
          se borra: se desactiva, y su historia queda.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && puedeEditar && (
        <EditorCatGasto
          categorias={(catsRes.data ?? []).map((c) => ({
            id: c.id,
            nombre: c.nombre,
            naturaleza: c.naturaleza,
            area: c.area,
            cuenta_id: c.cuenta_id,
            cuenta: cuentaNombre.get(c.cuenta_id) ?? '—',
            imputacion_default: c.imputacion_default,
            unidad_default: c.unidad_default,
            activo: c.activo,
          }))}
          cuentas={(cuentasRes.data ?? []).map((c) => ({
            id: c.id,
            nombre: `${c.codigo} · ${c.nombre}`,
          }))}
        />
      )}

      {!error && !puedeEditar && (
        <p className="rounded-md bg-panel px-4 py-3 text-[11px] text-muted">
          Estás viendo el catálogo en modo lectura: editarlo es de administración, operación o
          finanzas. Las categorías se ven en cada pantalla de gastos.
        </p>
      )}
    </div>
  )
}
