'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'

/**
 * Alta y edición de proveedores.
 *
 * Sin función de Postgres para el update, por lo mismo que Clientes y Emisor:
 * la policy de `proveedor` es toda la regla —admin, operador y finanzas desde
 * la migración que les puso rol— y la validación que hace falta vive en la
 * base. Una capa plpgsql en el medio no cuidaría nada nuevo.
 *
 * El alta sí pasa por `crear_proveedor`, que ya existía.
 *
 * **La allowlist de columnas vale igual que allá**: RLS es por fila —dice
 * «este rol puede tocar esta fila», no qué columnas— así que el objeto se arma
 * campo por campo.
 */

interface Resultado {
  ok: boolean
  error?: string
  id?: string
}

const limpiar = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export interface DatosProveedor {
  nombre: string
  razon_social: string | null
  cuit: string | null
  domicilio: string | null
  email: string | null
  contacto: string | null
}

export async function crearProveedor(datos: DatosProveedor): Promise<Resultado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a entrar.' }

  if (!datos.nombre.trim()) return { ok: false, error: 'El proveedor necesita un nombre.' }

  const { data, error } = await supabase.rpc('crear_proveedor', {
    p_nombre: datos.nombre.trim(),
    p_razon_social: limpiar(datos.razon_social) ?? undefined,
    p_cuit: limpiar(datos.cuit) ?? undefined,
    p_domicilio: limpiar(datos.domicilio) ?? undefined,
    p_email: limpiar(datos.email) ?? undefined,
    p_contacto: limpiar(datos.contacto) ?? undefined,
  })

  if (error) {
    // El INSERT habla cuando RLS lo deniega, a diferencia del UPDATE.
    if (error.message.includes('row-level security')) {
      return { ok: false, error: 'Crear proveedores es de administrador, operador o finanzas.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/proveedores')
  return { ok: true, id: data as string }
}

export async function guardarProveedor(
  id: string,
  datos: DatosProveedor,
): Promise<Resultado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a entrar.' }

  const { data, error } = await supabase
    .from('proveedor')
    .update({
      nombre: datos.nombre.trim(),
      razon_social: limpiar(datos.razon_social),
      cuit: limpiar(datos.cuit),
      domicilio: limpiar(datos.domicilio),
      email: limpiar(datos.email),
      contacto: limpiar(datos.contacto),
    })
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, error: error.message }

  // 🔴 RLS deniega el UPDATE en SILENCIO, con 0 filas y sin excepción. Sin este
  // chequeo, un rol sin permiso vería «guardado» y no se habría guardado nada.
  if (!data?.length) {
    return { ok: false, error: 'No se guardó: editar proveedores es de administrador, operador o finanzas.' }
  }

  revalidatePath('/proveedores')
  return { ok: true, id }
}
