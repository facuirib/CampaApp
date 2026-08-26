import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import EditorEmisor from './EditorEmisor'

export const dynamic = 'force-dynamic'

/**
 * Los datos fiscales del club: el emisor y sus puntos de venta.
 *
 * Server Component delgado: trae las tres cosas —emisor, puntos, catálogo de
 * IVA—, resuelve el permiso y se lo pasa resuelto a la isla.
 *
 * La ruta es MIXTA y por eso no va a `RUTAS_PROTEGIDAS`: ver desde qué
 * domicilios factura el club es lectura, y las policies ya dejan leer a todos.
 * Lo que se esconde es el botón.
 */
export default async function EmisorPage() {
  const supabase = await createClient()

  const [{ data: emisor, error: errorEmisor }, { data: puntos, error: errorPuntos }, { data: condiciones }, rol] =
    await Promise.all([
      supabase.from('emisor').select('*').maybeSingle(),
      supabase.from('punto_venta').select('*').order('numero'),
      supabase.from('condicion_iva_receptor').select('id, descripcion').eq('activa', true).order('id'),
      rolActual(),
    ])

  const error = errorEmisor ?? errorPuntos

  return (
    <div className="pb-10">
      <Link href="/configuracion" className="text-[12px] text-muted hover:text-ink">
        ← Configuración
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Emisor y puntos de venta</h1>
        <p className="mt-1 text-[12px] text-muted">
          Con qué datos factura el club y desde qué domicilios. Es lo que viaja al comprobante
          cuando se emite.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      {!error && emisor && (
        <EditorEmisor
          emisor={{
            razon_social: emisor.razon_social,
            cuit: emisor.cuit,
            condicion_iva_id: emisor.condicion_iva_id,
            ingresos_brutos: emisor.ingresos_brutos,
            inicio_actividades: emisor.inicio_actividades,
          }}
          puntos={(puntos ?? []).map((p) => ({
            numero: p.numero,
            nombre: p.nombre,
            domicilio: p.domicilio,
            activo: p.activo,
          }))}
          condiciones={(condiciones ?? []).map((c) => ({ id: c.id, descripcion: c.descripcion }))}
          puedeEditar={puede(rol, 'emisor.editar')}
        />
      )}
    </div>
  )
}
