'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'

/**
 * Los datos fiscales del club: el emisor y sus puntos de venta.
 *
 * Sin función de Postgres, por lo mismo que en Clientes: las dos tablas tienen
 * su policy de escritura —admin y sólo admin— y la validación vive en la base
 * como constraint (`emisor_cuit_valido`, `punto_venta_numero_valido`, el FK al
 * catálogo de IVA). Una capa plpgsql en el medio no cuidaría nada nuevo.
 *
 * **La allowlist de columnas vale igual que allá.** RLS es por fila: la policy
 * dice «admin puede tocar esta fila», no dice qué puede cambiarle. Los objetos
 * se arman campo por campo.
 *
 * `numero` no es editable en un punto existente: es el número de ARCA y es lo
 * que los comprobantes ya emitidos guardan. Cambiarlo dejaría al histórico
 * apuntando a otro lugar. Se crea uno nuevo y se desactiva el viejo.
 */

interface Resultado {
  ok: boolean
  error?: string
}

const limpiar = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export interface DatosEmisor {
  razon_social: string
  cuit: string
  condicion_iva_id: number
  ingresos_brutos: string | null
  inicio_actividades: string | null
}

export async function guardarEmisor(datos: DatosEmisor): Promise<Resultado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a entrar.' }

  const { data, error } = await supabase
    .from('emisor')
    .update({
      razon_social: datos.razon_social.trim(),
      cuit: datos.cuit.trim(),
      condicion_iva_id: datos.condicion_iva_id,
      ingresos_brutos: limpiar(datos.ingresos_brutos),
      inicio_actividades: limpiar(datos.inicio_actividades),
    })
    .eq('id', true)
    .select('id')

  if (error) {
    if (error.message.includes('emisor_cuit_valido')) {
      return { ok: false, error: 'El CUIT no es válido: revisá el dígito verificador.' }
    }
    return { ok: false, error: error.message }
  }

  // RLS deniega el UPDATE en silencio, con 0 filas y sin excepción.
  if (!data?.length) {
    return { ok: false, error: 'No se guardó: editar el emisor es de administrador.' }
  }

  revalidatePath('/configuracion/emisor')
  return { ok: true }
}

export interface DatosPunto {
  numero: number
  nombre: string
  domicilio: string
  activo: boolean
}

export async function guardarPunto(datos: DatosPunto): Promise<Resultado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a entrar.' }

  const { data, error } = await supabase
    .from('punto_venta')
    .update({
      nombre: datos.nombre.trim(),
      domicilio: datos.domicilio.trim(),
      activo: datos.activo,
    })
    .eq('numero', datos.numero)
    .select('numero')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) {
    return { ok: false, error: 'No se guardó: editar un punto de venta es de administrador.' }
  }

  revalidatePath('/configuracion/emisor')
  return { ok: true }
}

export async function crearPunto(datos: DatosPunto): Promise<Resultado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a entrar.' }

  const { error } = await supabase.from('punto_venta').insert({
    numero: datos.numero,
    nombre: datos.nombre.trim(),
    domicilio: datos.domicilio.trim(),
    activo: datos.activo,
  })

  if (error) {
    // El INSERT sí habla cuando RLS lo deniega, a diferencia del UPDATE.
    if (error.message.includes('row-level security')) {
      return { ok: false, error: 'Agregar un punto de venta es de administrador.' }
    }
    if (error.message.includes('duplicate key')) {
      return { ok: false, error: `El punto de venta ${datos.numero} ya está cargado.` }
    }
    if (error.message.includes('punto_venta_numero_valido')) {
      return { ok: false, error: 'El número tiene que ser mayor que cero. El 0 lo usa el recibo interno.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/configuracion/emisor')
  return { ok: true }
}
