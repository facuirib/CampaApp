import { createClient } from '@/lib/db/server'

interface CampoCambiado {
  campo: string
  antes: unknown
  despues: unknown
}

/** Fecha y hora en Córdoba: "02/08/2026 14:35". */
function formatFechaHora(valor: string): string {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha)
}

function comoRegistro(valor: unknown): Record<string, unknown> | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null
  return valor as Record<string, unknown>
}

function formatValor(v: unknown): string {
  if (v === undefined) return '—'
  if (v === null) return 'null'
  if (typeof v === 'object') {
    const texto = JSON.stringify(v)
    return texto.length > 60 ? `${texto.slice(0, 57)}…` : texto
  }
  return String(v)
}

/** Solo los campos que difieren entre dos snapshots. anterior=null → insert; nuevo=null → delete. */
function calcularCambios(
  anterior: Record<string, unknown> | null,
  nuevo: Record<string, unknown> | null
): CampoCambiado[] {
  const claves = new Set([...Object.keys(anterior ?? {}), ...Object.keys(nuevo ?? {})])
  const cambios: CampoCambiado[] = []

  for (const campo of claves) {
    const antes = anterior?.[campo]
    const despues = nuevo?.[campo]
    if (JSON.stringify(antes) !== JSON.stringify(despues)) {
      cambios.push({ campo, antes, despues })
    }
  }

  return cambios.sort((a, b) => a.campo.localeCompare(b.campo))
}

const OPERACION_BADGE: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
}

export default async function AuditoriaPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  const eventos = data ?? []

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">Auditoría</h1>
      <p className="text-sm text-gray-500 mb-6">Registro de cambios en el sistema.</p>

      {error && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">{error.message}</pre>
      )}

      {!error && eventos.length === 0 && (
        <p className="text-sm text-gray-500">No hay registros de auditoría todavía.</p>
      )}

      {!error && eventos.length > 0 && (
        <div className="space-y-3">
          {eventos.map((evento) => {
            const cambios = calcularCambios(comoRegistro(evento.anterior), comoRegistro(evento.nuevo))
            const badge = OPERACION_BADGE[evento.operacion] ?? 'bg-gray-100 text-gray-700'

            return (
              <div key={evento.id} className="border border-gray-200 rounded p-4">
                <div className="flex flex-wrap items-center gap-3 mb-2 text-sm">
                  <span className="text-gray-500">{formatFechaHora(evento.created_at)}</span>
                  <span className={`text-xs font-semibold rounded px-2 py-0.5 ${badge}`}>
                    {evento.operacion}
                  </span>
                  <span className="font-medium">{evento.tabla}</span>
                  <span className="text-gray-400 font-mono text-xs">
                    {evento.registro_id.slice(0, 8)}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {evento.usuario_id ? evento.usuario_id.slice(0, 8) : 'sistema'}
                  </span>
                </div>

                {cambios.length > 0 ? (
                  <ul className="text-sm space-y-0.5">
                    {cambios.map((cambio) => (
                      <li key={cambio.campo} className="text-gray-700">
                        <span className="font-mono text-xs text-gray-500">{cambio.campo}</span>
                        {': '}
                        {formatValor(cambio.antes)} → {formatValor(cambio.despues)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400">Sin cambios de campos</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}