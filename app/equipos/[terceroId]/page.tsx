import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import { Badge } from '@/components/ui'
import FichaCliente from './FichaCliente'

export const dynamic = 'force-dynamic'

/**
 * La ficha de un cliente.
 *
 * Server Component delgado: trae el cliente y el catálogo, resuelve el permiso
 * y se lo pasa resuelto a la isla. El formulario es lo único que cruza al
 * cliente.
 *
 * La ruta es MIXTA —se lee sin poder escribir— así que no va a
 * `RUTAS_PROTEGIDAS`: `read-only` tiene que poder ver con qué datos se le va a
 * facturar a un equipo. Lo que se esconde es el botón.
 */
export default async function ClientePage({
  params,
}: {
  params: Promise<{ terceroId: string }>
}) {
  const { terceroId } = await params
  const supabase = await createClient()

  const [{ data: cliente, error }, { data: condiciones }, rol] = await Promise.all([
    supabase.from('v_cliente').select('*').eq('tercero_id', terceroId).maybeSingle(),
    supabase.from('condicion_iva_receptor').select('id, descripcion').eq('activa', true).order('id'),
    rolActual(),
  ])

  if (error) {
    return (
      <div className="pb-10">
        <h1 className="text-xl font-extrabold text-ink">Cliente</h1>
        <p className="mt-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      </div>
    )
  }

  if (!cliente) notFound()

  return (
    <div className="pb-10">
      <Link href="/equipos" className="text-[12px] text-muted hover:text-ink">
        ← Equipos
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">{cliente.nombre}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          {cliente.facturable ? (
            <Badge estado="ok">Listo para facturar</Badge>
          ) : (
            <>
              <Badge estado="porVencer">
                {cliente.estado_fiscal === 'sin_datos' ? 'Sin datos' : 'Incompleto'}
              </Badge>
              {/* Qué falta lo dice la vista, no esta pantalla: la misma frase
                  que muestra la lista, sin una segunda versión de la regla. */}
              <span>Falta {cliente.falta_texto}.</span>
            </>
          )}
        </p>
      </header>

      <FichaCliente
        terceroId={terceroId}
        nombre={cliente.nombre ?? ''}
        tipo={cliente.tipo ?? 'equipo'}
        condiciones={(condiciones ?? []).map((c) => ({ id: c.id, descripcion: c.descripcion }))}
        inicial={{
          razon_social: cliente.razon_social,
          doc_tipo_default: cliente.doc_tipo,
          doc_nro_default: cliente.doc_nro,
          condicion_iva_receptor_default: cliente.condicion_iva_id,
          domicilio_fiscal: cliente.domicilio_fiscal,
          email: cliente.email,
          telefono: cliente.telefono,
          delegado: cliente.delegado,
        }}
        puedeEditar={puede(rol, 'cliente.editar')}
      />
    </div>
  )
}
