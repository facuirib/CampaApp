import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { Card } from '@/components/ui'
import FichasEditor from './FichasEditor'

export default async function FichasPage({
  params,
}: {
  params: Promise<{ torneoId: string }>
}) {
  const { torneoId } = await params
  const supabase = await createClient()

  const [
    { data: torneo },
    { data: fichas, error: errorFichas },
    { data: series },
    { data: origenes },
  ] = await Promise.all([
      supabase.from('v_torneo_lista').select('*').eq('torneo_id', torneoId).maybeSingle(),
      supabase.from('v_ficha_torneo').select('*').eq('torneo_id', torneoId),
      supabase.from('v_estructura_torneo').select('*').eq('torneo_id', torneoId),
      // Candidatos a origen: cualquier otro torneo que TENGA fichas. Uno sin
      // fichas no sirve de origen, y ofrecerlo sería ofrecer un error.
      supabase.from('v_torneo_lista').select('*').neq('torneo_id', torneoId).gt('equipos', 0),
    ])

  if (!torneo) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/torneos" className="text-sm text-slate-500 hover:text-slate-700">
          ← Torneos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Inscriptos en {torneo.nombre}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada ficha es la inscripción de un equipo en este torneo, con su serie y sus
          opciones de pago. El equipo persiste entre torneos; la ficha no.
        </p>
      </div>

      {/* El error se MUESTRA. Sin esto, una consulta que falla —una vista
          recién creada que PostgREST todavía no tiene en su cache, por
          ejemplo— renderiza «este torneo no tiene inscriptos», que es una
          mentira sobre los datos y manda a buscar el problema al lugar
          equivocado. Pasó al construir esta pantalla. */}
      {errorFichas && (
        <Card>
          <p className="text-sm text-red-600">
            No se pudieron cargar las fichas: {errorFichas.message}
          </p>
        </Card>
      )}

      <Card>
        <FichasEditor
          torneoId={torneoId}
          torneo={torneo}
          fichas={fichas ?? []}
          series={series ?? []}
          origenes={origenes ?? []}
        />
      </Card>
    </div>
  )
}
