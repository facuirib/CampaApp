'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { exigirRol } from '@/lib/rol-actual'

/**
 * El comprobante del proveedor, adjunto a un gasto.
 *
 * Uno por gasto: `gasto.comprobante_path` es una columna, no una tabla de
 * adjuntos. Si hicieran falta varios comprobantes, lo que en realidad haría
 * falta es partir el gasto.
 *
 * ── Con qué cliente se sube ───────────────────────────────────────────────
 *
 * Con el del USUARIO, no con `service_role`. Las policies del bucket validan
 * `auth_rol()`, así que la sesión alcanza — y de paso la base vuelve a
 * verificar el permiso por su cuenta, en vez de que la única barrera sea el
 * `if` de acá arriba. Entrar con `service_role` sería esquivar justamente las
 * policies que existen para esto.
 */

const BUCKET = 'comprobantes-gasto'

/** Quién adjunta: los mismos que pueden cargar el gasto. */
const PUEDE_ADJUNTAR = ['admin', 'operador', 'finanzas'] as const
/** Quién lo ve: los que ven Gastos. */
const PUEDE_VER = ['admin', 'operador', 'read-only', 'finanzas'] as const

const MAX_BYTES = 10 * 1024 * 1024

interface Resultado {
  ok: boolean
  error?: string
  path?: string
  url?: string
}

/**
 * Los tipos que aceptamos, con su **firma real**.
 *
 * **No se confía en el `type` del `File`: lo pone el navegador y se puede
 * mentir.** Un ejecutable renombrado a `.pdf` llega declarando
 * `application/pdf` y pasaría cualquier chequeo de extensión o de MIME. Lo
 * único que no se puede falsificar sin dejar de ser el archivo son sus
 * primeros bytes.
 */
const FIRMAS: { ext: string; mime: string; bytes: number[] }[] = [
  { ext: 'pdf', mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { ext: 'jpg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
]

function reconocer(cabecera: Uint8Array) {
  return FIRMAS.find((f) => f.bytes.every((b, i) => cabecera[i] === b))
}

/** Deja el nombre en algo que no rompa una ruta ni sorprenda a nadie. */
function saneaNombre(nombre: string): string {
  return (
    nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+/, '')
      .slice(0, 60) || 'comprobante'
  )
}

export async function adjuntarComprobante(formData: FormData): Promise<Resultado> {
  // `exigirRol` devuelve un OBJETO {ok, ...}, no el rol: un `if (!permiso)`
  // sería siempre falso y la guarda no denegaría nunca.
  const permiso = await exigirRol(PUEDE_ADJUNTAR)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const gastoId = String(formData.get('gastoId') ?? '')
  const archivo = formData.get('archivo')

  if (!gastoId) return { ok: false, error: 'Falta el gasto.' }
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: 'Elegí un archivo.' }
  }
  if (archivo.size > MAX_BYTES) {
    return {
      ok: false,
      error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son 10 MB.`,
    }
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const firma = reconocer(bytes.subarray(0, 8))
  if (!firma) {
    return {
      ok: false,
      error:
        'El archivo no es un PDF ni una imagen JPG o PNG. ' +
        'Se mira el contenido, no la extensión: renombrar un archivo no lo convierte.',
    }
  }

  const supabase = await createClient()

  // El path viejo se lee ANTES de subir: si hay reemplazo, hay que borrarlo, y
  // si se leyera después ya estaría pisado en la fila.
  const { data: gasto } = await supabase
    .from('gasto')
    .select('id, comprobante_path')
    .eq('id', gastoId)
    .single()
  if (!gasto) return { ok: false, error: 'No encontré ese gasto.' }

  const path = `${gastoId}/${Date.now()}-${saneaNombre(archivo.name)}`

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: firma.mime, upsert: false })

  if (errorSubida) {
    if (/row-level security|not authorized|Unauthorized/i.test(errorSubida.message)) {
      return { ok: false, error: 'Adjuntar comprobantes es de administración, operación o finanzas.' }
    }
    return { ok: false, error: `No se pudo subir: ${errorSubida.message}` }
  }

  const { data: filas, error: errorUpdate } = await supabase
    .from('gasto')
    // Allowlist de UNA columna: RLS es por fila, no por columna, así que lo que
    // se puede tocar se decide acá.
    .update({ comprobante_path: path })
    .eq('id', gastoId)
    .select('id')

  if (errorUpdate || !filas?.length) {
    // Si la fila no se actualizó, el archivo subido quedaría huérfano: se
    // limpia antes de devolver el error, para no dejar basura en el bucket por
    // un fallo nuestro.
    await supabase.storage.from(BUCKET).remove([path])
    return {
      ok: false,
      // El UPDATE denegado por RLS no habla: devuelve 0 filas sin excepción.
      error: errorUpdate?.message ?? 'No se guardó la referencia al archivo (denegado por RLS).',
    }
  }

  // El viejo se borra RECIÉN ACÁ, con el nuevo ya guardado y referenciado. Al
  // revés —borrar primero— un fallo en la subida dejaría al gasto sin ninguno.
  if (gasto.comprobante_path && gasto.comprobante_path !== path) {
    await supabase.storage.from(BUCKET).remove([gasto.comprobante_path])
  }

  revalidatePath('/gastos')
  revalidatePath(`/gastos/${gastoId}/comprobante`)
  return { ok: true, path }
}

/**
 * Una URL firmada para ver o bajar el adjunto.
 *
 * El bucket es privado y el path nunca sale de acá: se entrega un link que vive
 * cinco minutos. Suficiente para abrirlo o bajarlo, y corto para que compartirlo
 * por accidente no sea compartir el archivo para siempre.
 */
export async function urlComprobante(gastoId: string): Promise<Resultado> {
  const permiso = await exigirRol(PUEDE_VER)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const supabase = await createClient()
  const { data: gasto } = await supabase
    .from('gasto')
    .select('comprobante_path')
    .eq('id', gastoId)
    .single()

  if (!gasto?.comprobante_path) return { ok: false, error: 'Este gasto no tiene comprobante.' }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(gasto.comprobante_path, 300)

  if (error || !data) return { ok: false, error: 'No se pudo generar el link.' }
  return { ok: true, url: data.signedUrl }
}
