import Link from 'next/link'
import { createClient } from '@/lib/db/server'
import LibroDiario from './LibroDiario'
import { formatDateTime, formatEntero } from '@/lib/format'
import { calcularCambios, comoRegistro, resumirCambios } from '@/lib/domain/auditoria'
import FiltrosUrl, { type FiltroUrl } from '@/components/FiltrosUrl'
import { Autor, DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'
import type { Database } from '@/lib/db/database.types'

type FilaAuditoria = Database['public']['Views']['v_auditoria']['Row']

/**
 * Cuántos eventos se traen. El log crece sin techo —1.134 en diez días de
 * pruebas— así que hay un corte; lo que no puede haber es un corte callado.
 * El subtítulo dice cuántos se muestran de cuántos hay.
 */
const LIMITE = 200

/**
 * El badge de cada operación.
 *
 * NO hay entrada para INSERT, y es a propósito: el trigger `fn_audit` está
 * declarado sólo para UPDATE y DELETE, así que un INSERT no se audita nunca.
 * El mapa anterior tenía un INSERT en verde que no podía aparecer jamás —el
 * mismo problema que el ✓ de balance que sacamos del libro diario— y de paso
 * sugería que las altas están cubiertas, que es peor que no decir nada.
 *
 * Si mañana el trigger cubre INSERT, cae en el fallback gris con su nombre:
 * se ve, sin mentir sobre el color.
 */
const OPERACIONES: Record<string, { estado: CeldaBadge['estado']; rotulo: string }> = {
  UPDATE: { estado: 'porVencer', rotulo: 'Modificado' },
  DELETE: { estado: 'mora', rotulo: 'Borrado' },
}

function rotuloOperacion(operacion: string | null): string {
  return OPERACIONES[operacion ?? '']?.rotulo ?? operacion ?? '—'
}

function badgeOperacion(operacion: string | null): CeldaBadge {
  const conocida = OPERACIONES[operacion ?? '']
  return {
    estado: conocida?.estado ?? 'neutro',
    label: rotuloOperacion(operacion),
  }
}

interface FilaEvento {
  id: number
  cuando: string
  operacion: CeldaBadge
  tabla: string | null
  registro: React.ReactNode
  usuario: React.ReactNode
  campos: number | null
  cambios: string
}

const COLUMNAS: ColumnDef<FilaEvento>[] = [
  { key: 'cuando', label: 'Cuándo', width: 132 },
  { key: 'operacion', label: 'Operación', format: 'badge', width: 116 },
  { key: 'tabla', label: 'Tabla', width: 130 },
  { key: 'registro', label: 'Registro', width: 92 },
  { key: 'usuario', label: 'Usuario', width: 92 },
  { key: 'campos', label: 'Campos', align: 'right', width: 76 },
  { key: 'cambios', label: 'Cambios' },
]

/**
 * Las dos caras de la trazabilidad, en la URL como en el resto del proyecto.
 *
 * «Cambios» es qué se modificó después de creado; «Libro diario», qué se
 * asentó. Eran dos módulos —/auditoria y /movimientos— y contestan la misma
 * pregunta desde dos ángulos: quién tocó qué. Separados, para saber si alguien
 * anduvo en algo había que mirar en dos lados y cruzar a mano.
 */
const VISTAS = [
  { vista: 'cambios', label: 'Cambios' },
  { vista: 'diario', label: 'Libro diario' },
] as const

type Vista = (typeof VISTAS)[number]['vista']

function Pestanas({ activa }: { activa: Vista }) {
  return (
    <div className="mb-5 inline-flex gap-1 rounded-md bg-line2 p-1" role="tablist">
      {VISTAS.map((v) => {
        const esActiva = v.vista === activa
        return (
          <Link
            key={v.vista}
            href={v.vista === 'cambios' ? '/auditoria' : `/auditoria?vista=${v.vista}`}
            role="tab"
            aria-selected={esActiva}
            className={[
              'rounded-sm px-3 py-1 text-[11px] font-bold transition-colors',
              esActiva ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {v.label}
          </Link>
        )
      })}
    </div>
  )
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    tabla?: string
    operacion?: string
    cambios?: string
    vista?: string
    origen?: string
    periodo?: string
    usuario?: string
  }>
}) {
  const params = await searchParams
  const { tabla, operacion, cambios } = params
  const activa: Vista = params.vista === 'diario' ? 'diario' : 'cambios'

  // La pestaña del diario se delega entera: es la pantalla que vivía en
  // /movimientos, movida tal cual. Cero cambio de contenido — es una mudanza.
  if (activa === 'diario') {
    return <LibroDiario params={params} pestanas={<Pestanas activa={activa} />} />
  }
  const soloConCambios = cambios === '1'

  const supabase = await createClient()

  // Las opciones salen de los datos, igual que en el libro diario.
  const [opcionesRes, usuariosRes] = await Promise.all([
    supabase.from('v_auditoria').select('tabla, operacion'),
    supabase.from('v_usuario').select('*'),
  ])
  const nombreDe = new Map((usuariosRes.data ?? []).map((u) => [u.id, u.nombre]))

  // El count viene de la base con `head: true` —cuenta sin traer filas— y NO de
  // medir el largo del array: el array está cortado en LIMITE, así que contarlo
  // daría 200 siempre y el "de cuántos" sería mentira.
  let conteo = supabase.from('v_auditoria').select('*', { count: 'exact', head: true })
  // Los no-ops bajo el MISMO filtro: decir "muchos no cambiaron nada" cuando se
  // está mirando sólo borrados sería falso —un borrado nunca es no-op—, así que
  // el número se cuenta en vez de estimarse con un adverbio.
  let conteoVacios = supabase
    .from('v_auditoria')
    .select('*', { count: 'exact', head: true })
    .eq('campos_cambiados', 0)
  let consulta = supabase
    .from('v_auditoria')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(LIMITE)

  if (tabla) {
    consulta = consulta.eq('tabla', tabla)
    conteo = conteo.eq('tabla', tabla)
    conteoVacios = conteoVacios.eq('tabla', tabla)
  }
  if (operacion) {
    consulta = consulta.eq('operacion', operacion)
    conteo = conteo.eq('operacion', operacion)
    conteoVacios = conteoVacios.eq('operacion', operacion)
  }
  if (soloConCambios) {
    consulta = consulta.gt('campos_cambiados', 0)
    conteo = conteo.gt('campos_cambiados', 0)
  }

  const [eventosRes, conteoRes, vaciosRes] = await Promise.all([consulta, conteo, conteoVacios])
  const error = eventosRes.error ?? conteoRes.error ?? opcionesRes.error

  const total = conteoRes.count ?? 0
  const vacios = soloConCambios ? 0 : (vaciosRes.count ?? 0)
  const eventos = eventosRes.data ?? []

  const tablas = [...new Set((opcionesRes.data ?? []).map((f) => f.tabla).filter(Boolean))]
    .sort()
    .map((t) => ({ valor: t as string, label: t as string }))

  const operaciones = [...new Set((opcionesRes.data ?? []).map((f) => f.operacion).filter(Boolean))]
    .sort()
    .map((o) => ({ valor: o as string, label: rotuloOperacion(o) }))

  const FILTROS: FiltroUrl[] = [
    { parametro: 'tabla', label: 'Tabla', todos: 'Todas las tablas', opciones: tablas },
    { parametro: 'operacion', label: 'Operación', todos: 'Todas', opciones: operaciones },
    {
      parametro: 'cambios',
      label: 'Contenido',
      todos: 'Todos los eventos',
      opciones: [{ valor: '1', label: 'Solo con cambios' }],
    },
  ]

  const filas: FilaEvento[] = eventos.map((e: FilaAuditoria) => {
    const detalle = calcularCambios(comoRegistro(e.anterior), comoRegistro(e.nuevo))

    return {
      id: e.id!,
      cuando: formatDateTime(e.created_at),
      operacion: badgeOperacion(e.operacion),
      tabla: e.tabla,
      registro: (
        <span className="font-mono text-[10px] text-muted">{e.registro_id?.slice(0, 8)}</span>
      ),
      // `fn_audit` guarda `auth.uid()`, que sin sesión es null. Hoy son todos
      // "sistema"; lo será hasta que exista auth (bloque 10).
      // Antes esto era `usuario_id.slice(0, 8)`: ocho caracteres de un uuid.
      // Sirve para distinguir a dos personas entre sí y para nada más — nadie
      // sabe quién es «a3f9c210». Ahora sale de v_usuario.
      usuario: <Autor id={e.usuario_id} nombre={nombreDe.get(e.usuario_id ?? '')} />,
      campos: e.campos_cambiados,
      cambios: resumirCambios(e.operacion ?? '', detalle),
    }
  })

  const hayFiltro = Boolean(tabla || operacion || soloConCambios)
  const mostrados = filas.length

  return (
    <div className="pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Auditoría</h1>
        <p className="mt-1 text-[12px] text-muted">
          Modificaciones y borrados sobre las tablas auditadas. Las altas no aparecen: el registro
          se lleva sólo de lo que cambia después de creado.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error.message}</p>
      )}

      <Pestanas activa={activa} />

      <FiltrosUrl filtros={FILTROS} />

      {/* El corte deja de ser mudo: si hay más de los que entran, se dice. */}
      <p className="mb-2 text-[11px] text-muted">
        {mostrados < total
          ? `Mostrando los ${formatEntero(mostrados)} más recientes de ${formatEntero(total)}.`
          : `${formatEntero(total)} ${total === 1 ? 'evento' : 'eventos'}.`}
        {vacios > 0 && ` ${formatEntero(vacios)} no cambiaron ningún campo.`}
      </p>

      <DataTable
        columns={COLUMNAS}
        rows={filas}
        rowKey="id"
        densidad="compacta"
        maxHeight={620}
        emptyMessage={
          hayFiltro
            ? 'Ningún evento coincide con el filtro.'
            : 'No hay registros de auditoría todavía.'
        }
      />
    </div>
  )
}
