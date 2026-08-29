'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { exigirRol } from '@/lib/rol-actual'
import { PERMISOS } from '@/lib/permisos'

/**
 * Las dos maneras de tocar el sueldo de un socio — y son DOS a propósito.
 *
 * ── Por qué no es un solo formulario ───────────────────────────────────────
 *
 * Las dos escriben un monto contra un socio, así que la tentación es unificar
 * y poner una casilla «sólo por este mes». Sería el peor arreglo posible: la
 * diferencia entre las dos no es un detalle del formulario, es **qué queda
 * pasando de acá en adelante**.
 *
 *   cambiarSueldoAcordado  el acuerdo cambia. Rige este mes y todos los que
 *                          siguen, hasta que alguien lo vuelva a cambiar.
 *   ajustarSueldoDelMes    un mes, y sólo ese. El acuerdo queda intacto.
 *
 * Una casilla que se olvida de tildar convierte «este mes le pagamos menos» en
 * «le bajamos el sueldo para siempre», y nada avisa: los dos caminos aceptan el
 * mismo número y muestran el mismo cartel de éxito. El error aparece recién el
 * mes que viene, en la proyección, sin nadie que lo esté mirando.
 *
 * Por eso son dos acciones, dos formularios y dos botones con nombres que dicen
 * cuál es cuál.
 *
 * ── Por qué Server Action y no rpc ─────────────────────────────────────────
 *
 * Se escribe DIRECTO a la tabla: no hay función de Postgres que sea la puerta,
 * porque no hay nada que orquestar —ni asiento, ni imputación, ni número que
 * reservar—. Lo que sí hay son invariantes, y viven donde corresponde: los
 * constraints de `sueldo_socio_mes` (monto >= 0, motivo no vacío, uno por socio
 * y mes) y el trigger que frena el mes ya devengado. La acción no los repite:
 * los deja hablar y traduce el error.
 *
 * ── La guarda, y por qué está además de RLS ────────────────────────────────
 *
 * `PERMISOS['socio.ajuste_mes']` y `PERMISOS['socio.sueldo']` son la fuente:
 * los roles no se escriben acá, se leen de ahí, que es lo que el verificador
 * cruza contra las policies. RLS ya frena la escritura —está medido—, pero el
 * INSERT denegado por RLS habla en inglés y de row-level security; la guarda
 * está para que el que no puede lea *por qué* en castellano.
 *
 * ⚠️ `exigirRol` devuelve un OBJETO `{ok, ...}`. `if (!permiso)` es siempre
 * falso y no deniega nunca — el bug que ya apareció dos veces en este repo.
 */

interface Resultado {
  ok: boolean
  error?: string
}

/**
 * El acuerdo permanente: una fila nueva en el historial.
 *
 * No edita la anterior — ese es el punto del versionado. La vigencia vieja
 * queda, y es lo que permite recalcular un mes viejo con el sueldo que regía
 * entonces.
 */
export async function cambiarSueldoAcordado(
  socioId: string,
  monto: number,
  vigenteDesde: string,
): Promise<Resultado> {
  const permiso = await exigirRol(PERMISOS['socio.sueldo'].roles)
  if (!permiso.ok) return { ok: false, error: `Cambiar el sueldo acordado no está a tu alcance. ${permiso.error}` }

  if (!Number.isFinite(monto) || monto < 0) {
    return { ok: false, error: 'El monto tiene que ser un número de cero para arriba.' }
  }
  if (!vigenteDesde) {
    return { ok: false, error: 'Falta desde cuándo rige el sueldo nuevo.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('sueldo_socio').insert({
    socio_id: socioId,
    monto,
    vigente_desde: vigenteDesde,
  })

  if (error) {
    if (error.message.includes('row-level security')) {
      return { ok: false, error: 'Cambiar el sueldo acordado es de administrador o finanzas.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/socios')
  revalidatePath(`/socios/${socioId}`)
  revalidatePath('/proyeccion')
  return { ok: true }
}

/**
 * La excepción de un mes.
 *
 * El motivo viaja obligatorio desde acá y también desde el constraint. No es
 * redundancia inútil: el constraint garantiza que no entre vacío, y esta
 * validación le dice al operador qué falta antes de mandar el viaje.
 */
export async function ajustarSueldoDelMes(
  socioId: string,
  periodoId: string,
  monto: number,
  motivo: string,
): Promise<Resultado> {
  const permiso = await exigirRol(PERMISOS['socio.ajuste_mes'].roles)
  if (!permiso.ok) return { ok: false, error: `Ajustar el sueldo de un mes no está a tu alcance. ${permiso.error}` }

  if (!periodoId) return { ok: false, error: 'Elegí el mes que se ajusta.' }
  if (!Number.isFinite(monto) || monto < 0) {
    return { ok: false, error: 'El monto tiene que ser un número de cero para arriba.' }
  }
  if (!motivo.trim()) {
    return { ok: false, error: 'El motivo es obligatorio: es lo que distingue una excepción de un error de tipeo.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('sueldo_socio_mes').insert({
    socio_id: socioId,
    periodo_id: periodoId,
    monto,
    motivo: motivo.trim(),
  })

  if (error) {
    if (error.message.includes('row-level security')) {
      return { ok: false, error: 'Ajustar el sueldo de un mes es de administrador o finanzas.' }
    }
    if (error.message.includes('sueldo_socio_mes_unico')) {
      return { ok: false, error: 'Ese mes ya tiene un ajuste cargado.' }
    }
    // El trigger del mes ya devengado y el del período cerrado hablan en
    // castellano y dicen qué hacer: se muestran tal cual, sin traducir.
    return { ok: false, error: error.message }
  }

  revalidatePath('/socios')
  revalidatePath(`/socios/${socioId}`)
  revalidatePath('/proyeccion')
  return { ok: true }
}
