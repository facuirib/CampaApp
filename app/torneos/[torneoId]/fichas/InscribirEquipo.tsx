"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Button, Field, Select } from '@/components/ui'

export interface SerieInscribible {
  serie_id: string
  label: string
  genero: string
}

export interface PlanElegible {
  id: string
  genero: string
  concepto: string
  nombre: string
}

export interface EquipoInscribible {
  id: string
  nombre: string
}

/**
 * Inscribir un equipo a este torneo — el debutante, o el que no vino arrastrado.
 *
 * La pieza que cerraba el ciclo y no existía: `crear_equipo_torneo` es LA
 * puerta de alta de fichas desde el primer día, y ninguna pantalla la llamaba.
 * El único camino era `arrastrar_fichas` (masivo, desde el torneo anterior):
 * un equipo que nunca jugó no se podía inscribir desde la app.
 *
 * ── Los planes se filtran por el género de la serie ───────────────────────
 *
 * No es cosmética: es el candado de la base dibujado antes del error. La
 * función rechaza un plan de otro género o de otro torneo; ofrecerlos en el
 * desplegable sería ofrecer opciones que van a fallar. Se muestran las del
 * género de la serie elegida, activas, y de este torneo — que es lo único que
 * la puerta acepta.
 *
 * ── La ficha genera sus cuotas EN EL ACTO ─────────────────────────────────
 *
 * A diferencia del arrastre (que deja fichas sin cuotas hasta Confirmar),
 * `crear_equipo_torneo` valida el calendario de la serie y genera las cuotas
 * al crear. El texto del formulario lo dice, porque es la diferencia que
 * importa: de acá se sale con un compromiso de pago armado.
 */
export default function InscribirEquipo({
  torneoId,
  series,
  planes,
  equipos,
}: {
  torneoId: string
  series: SerieInscribible[]
  planes: PlanElegible[]
  equipos: EquipoInscribible[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [equipo, setEquipo] = useState('')
  const [serie, setSerie] = useState('')
  const [planInscripcion, setPlanInscripcion] = useState('')
  const [planPartidos, setPlanPartidos] = useState('')
  const [medio, setMedio] = useState<'efectivo' | 'transferencia'>('transferencia')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  const serieElegida = series.find((s) => s.serie_id === serie)
  const deInscripcion = planes.filter(
    (p) => p.concepto === 'inscripcion' && (!serieElegida || p.genero === serieElegida.genero),
  )
  const dePartidos = planes.filter(
    (p) => p.concepto === 'partidos' && (!serieElegida || p.genero === serieElegida.genero),
  )

  function elegirSerie(id: string) {
    setSerie(id)
    // Cambiar de serie puede cambiar de género: los planes elegidos pueden
    // dejar de ser válidos, y dejarlos puestos sería mandar a la función un
    // cruce que va a rechazar.
    setPlanInscripcion('')
    setPlanPartidos('')
  }

  async function inscribir() {
    setOcupado(true)
    setError(null)
    const { error: err } = await createClient().rpc('crear_equipo_torneo', {
      p_tercero_id: equipo,
      p_serie_id: serie,
      p_plan_inscripcion_id: planInscripcion,
      p_plan_partidos_id: planPartidos,
      p_medio_previsto: medio,
    })
    setOcupado(false)
    if (err) return setError(err.message)
    const nombre = equipos.find((e) => e.id === equipo)?.nombre ?? 'El equipo'
    setExito(`${nombre} quedó inscripto, con sus cuotas generadas.`)
    setEquipo('')
    setSerie('')
    setPlanInscripcion('')
    setPlanPartidos('')
    setAbierto(false)
    router.refresh()
  }

  if (!abierto) {
    return (
      <div className="border-t border-line pt-4">
        {exito && (
          <p className="mb-3 rounded-md bg-okbg px-4 py-2.5 text-[11px] text-oktx">{exito}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" icon="plus" onClick={() => { setExito(null); setAbierto(true) }}>
            Inscribir equipo
          </Button>
          <span className="text-[10.5px] text-muted">
            Para el que no vino arrastrado — un debutante, o uno que vuelve.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-line pt-4">
      <h3 className="mb-3 text-[12.5px] font-extrabold text-ink">Inscribir un equipo</h3>

      {equipos.length === 0 ? (
        <p className="rounded-md bg-panel px-4 py-3 text-[11px] text-muted">
          Todos los equipos cargados ya tienen ficha en este torneo. Un equipo nuevo se da de alta
          primero en el padrón:{' '}
          <Link href="/equipos/nuevo" className="font-semibold text-blue-d hover:underline">
            Nuevo equipo
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Equipo" required>
              <Select placeholder="Elegir…" value={equipo} onChange={(e) => setEquipo(e.target.value)}>
                {equipos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Serie" required>
              <Select placeholder="Elegir…" value={serie} onChange={(e) => elegirSerie(e.target.value)}>
                {series.map((s) => (
                  <option key={s.serie_id} value={s.serie_id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Inscripción" required hint={serieElegida ? undefined : 'Elegí la serie primero.'}>
              <Select
                placeholder="Elegir…"
                disabled={!serieElegida}
                value={planInscripcion}
                onChange={(e) => setPlanInscripcion(e.target.value)}
              >
                {deInscripcion.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Partidos" required hint={serieElegida ? undefined : 'Elegí la serie primero.'}>
              <Select
                placeholder="Elegir…"
                disabled={!serieElegida}
                value={planPartidos}
                onChange={(e) => setPlanPartidos(e.target.value)}
              >
                {dePartidos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Medio previsto" required hint="Define el precio de cada cuota.">
              <Select
                value={medio}
                onChange={(e) => setMedio(e.target.value as 'efectivo' | 'transferencia')}
              >
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
              </Select>
            </Field>
          </div>

          <p className="mt-3 text-[10.5px] leading-snug text-muted">
            La ficha genera sus cuotas <strong className="font-semibold">en el acto</strong>, del
            tarifario y el calendario de la serie — a diferencia del arrastre, que espera a
            Confirmar. Si el calendario de la serie está incompleto, la inscripción avisa y no crea
            nada.
          </p>

          {error && (
            <p className="mt-3 whitespace-pre-wrap rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button
              icon="check"
              loading={ocupado}
              disabled={ocupado || !equipo || !serie || !planInscripcion || !planPartidos}
              onClick={inscribir}
            >
              Inscribir
            </Button>
            <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
