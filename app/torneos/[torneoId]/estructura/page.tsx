import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import PestanasTorneo from '../PestanasTorneo'
import { Card } from '@/components/ui'
import EstructuraEditor from './EstructuraEditor'

export default async function EstructuraPage({
  params,
}: {
  params: Promise<{ torneoId: string }>
}) {
  const { torneoId } = await params
  const supabase = await createClient()

  const [{ data: torneo }, { data: filas }, { data: otros }] = await Promise.all([
    supabase.from('v_torneo_lista').select('*').eq('torneo_id', torneoId).maybeSingle(),
    supabase.from('v_estructura_torneo').select('*').eq('torneo_id', torneoId),
    // Los candidatos a origen del clonado: cualquier otro torneo que TENGA
    // categorías. Uno vacío no sirve de origen y ofrecerlo sería ofrecer un
    // error.
    supabase.from('v_torneo_lista').select('*').neq('torneo_id', torneoId).gt('categorias', 0),
  ])

  if (!torneo) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/torneos" className="text-sm text-slate-500 hover:text-slate-700">
          ← Torneos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Estructura de {torneo.nombre}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Las categorías y series de este torneo. Son propias: las de un torneo no se
          comparten con otro, aunque se llamen igual.
        </p>

        <PestanasTorneo activa="estructura" torneoId={torneoId} />
      </div>

      <Card>
        <EstructuraEditor
          torneoId={torneoId}
          filas={filas ?? []}
          origenes={otros ?? []}
        />
      </Card>
    </div>
  )
}
