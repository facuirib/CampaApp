/**
 * Quién hizo algo: avatar con inicial, color propio y nombre.
 *
 * ── Por qué el color sale del id y no de una tabla ────────────────────────
 *
 * El color no significa nada —no hay usuarios «buenos» ni «malos»— y su único
 * trabajo es que la misma persona se vea igual en todas las filas, para poder
 * seguirla con la vista en una lista larga sin leer cada nombre.
 *
 * Se deriva del uuid con un hash simple, así que es **estable sin guardarlo**:
 * no hay columna que mantener, ni un alta de usuario que tenga que acordarse de
 * elegir color, ni dos personas peleando por el azul.
 *
 * Los seis tonos salen de `globals.css`. No se inventa ninguno, y son los de la
 * paleta de gráficos por la misma razón: si el avatar de alguien fuera rojo
 * `--err`, se leería como alarma.
 */
const TONOS = [
  'var(--blue)',
  'var(--st-green)',
  'var(--flyway)',
  'var(--warn)',
  'var(--regale)',
  'var(--muted)',
]

function tonoDe(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return TONOS[h % TONOS.length]
}

export interface AutorProps {
  /** El uuid. Sin esto no hay a quién mostrar. */
  id: string | null
  /** El nombre ya resuelto. Viene de `v_usuario`, no se busca acá. */
  nombre?: string | null
  /** Sólo el avatar, para tablas apretadas. */
  soloAvatar?: boolean
  className?: string
}

export default function Autor({ id, nombre, soloAvatar = false, className }: AutorProps) {
  // Sin id es el sistema: un trigger, una migración, un proceso. Decirlo es
  // mejor que dejar la celda vacía — «nadie» y «el sistema» no son lo mismo.
  if (!id) {
    return <span className={`text-[11px] text-muted ${className ?? ''}`}>Sistema</span>
  }

  const visible = nombre?.trim() || id.slice(0, 8)
  const inicial = visible.charAt(0).toUpperCase()

  return (
    <span className={`flex items-center gap-1.5 ${className ?? ''}`} title={nombre ?? id}>
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-pill text-[9.5px] font-bold text-white"
        style={{ background: tonoDe(id) }}
        aria-hidden
      >
        {inicial}
      </span>
      {!soloAvatar && <span className="truncate text-[11px] text-ink">{visible}</span>}
    </span>
  )
}
