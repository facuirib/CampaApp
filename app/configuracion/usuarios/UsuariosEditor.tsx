"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Button, Field, Input, Select, tonoDeId, type CeldaBadge } from '@/components/ui'
import { ROLES, ROL_LABEL, type Rol } from '@/lib/roles'
import { cambiarRol, editarUsuario, invitar } from './acciones'

export interface FilaUsuario {
  id: string
  email: string
  rol: Rol | null
  ultimo_login: string | null
  creado: string
  desactivado: boolean
  nombre: string
  apellido: string
}

const ROL_BADGE: Record<Rol, CeldaBadge['estado']> = {
  admin: 'info',
  // Finanzas comparte color con admin: son los dos que pueden lo sensible
  // —rechazar un cheque, anular un asiento, operar dólares— y conviene que se
  // lean como el mismo peso al mirar la lista de usuarios.
  finanzas: 'info',
  operador: 'ok',
  'read-only': 'neutro',
  bar: 'porVencer',
}

function fecha(f: string | null): string {
  if (!f) return '—'
  return new Date(f).toLocaleDateString('es-AR')
}

/**
 * Las iniciales: nombre y apellido si están, y si no las dos primeras del
 * email — «fb» para facuubosch@ es más reconocible que una letra sola.
 */
function iniciales(u: FilaUsuario): string {
  const n = u.nombre.trim()
  const a = u.apellido.trim()
  if (n && a) return (n[0] + a[0]).toUpperCase()
  if (n) return n.slice(0, 2).toUpperCase()
  return u.email.slice(0, 2).toUpperCase()
}

/** La burbujita. Mismo hash de color que el avatar de `Autor`: la misma
 *  persona se ve del mismo tono acá y en el libro diario. */
function Burbuja({ u, grande = false }: { u: FilaUsuario; grande?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-pill font-bold text-white ${
        grande ? 'h-11 w-11 text-[15px]' : 'h-8 w-8 text-[11px]'
      }`}
      style={{ background: tonoDeId(u.id) }}
      aria-hidden
    >
      {iniciales(u)}
    </span>
  )
}

/**
 * Usuarios: la lista dice QUIÉN ES y QUÉ PUEDE; todo lo demás vive en la ficha.
 *
 * Rediseño pedido por Facu (10/09): afuera, burbujita con iniciales + nombre +
 * rol — nada más. El último ingreso, el alta, el estado y TODA la edición
 * (incluido el rol, que antes se cambiaba desde la lista) se mudan adentro de
 * la ficha de cada uno. Un solo lugar para editar a una persona, en vez de un
 * select suelto en la fila y un modal aparte para el resto.
 */
export default function UsuariosEditor({ usuarios }: { usuarios: FilaUsuario[] }) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [abriendo, setAbriendo] = useState(false)
  // La ficha abierta. `null` = ninguna.
  const [ficha, setFicha] = useState<FilaUsuario | null>(null)
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [activo, setActivo] = useState(true)
  const [rol, setRol] = useState<Rol | ''>('')

  const [email, setEmail] = useState('')
  const [rolNuevo, setRolNuevo] = useState<Rol>('operador')

  function abrir(u: FilaUsuario) {
    setError(null)
    setAviso(null)
    setFicha(u)
    setNombre(u.nombre)
    setApellido(u.apellido)
    setActivo(!u.desactivado)
    setRol(u.rol ?? '')
  }

  function onGuardar() {
    if (!ficha) return
    setError(null)
    setAviso(null)
    const u = ficha
    const rolCambio = rol !== '' && rol !== u.rol
    startTransition(async () => {
      // Dos puertas, un botón: los datos de la persona van por editarUsuario y
      // el permiso por cambiarRol — sólo si de verdad cambió. Si la primera
      // falla, la segunda no se intenta: mejor un error entero que medio
      // guardado.
      const r1 = await editarUsuario(u.id, { nombre, apellido, activo })
      if (!r1.ok) {
        setError(r1.error ?? 'No se pudo guardar.')
        return
      }
      if (rolCambio) {
        const r2 = await cambiarRol(u.id, rol)
        if (!r2.ok) {
          setError(`Los datos se guardaron, pero el rol no: ${r2.error ?? 'error desconocido'}`)
          router.refresh()
          return
        }
      }
      setFicha(null)
      setAviso(
        rolCambio
          ? 'Usuario actualizado. El rol nuevo le aplica cuando su sesión se renueve.'
          : 'Usuario actualizado.',
      )
      router.refresh()
    })
  }

  function onInvitar() {
    setError(null)
    setAviso(null)
    startTransition(async () => {
      const r = await invitar(email, rolNuevo)
      if (!r.ok) {
        setError(r.error ?? 'No se pudo enviar la invitación.')
        return
      }
      setAviso(`Invitación enviada a ${email}. Cuando acepte, define su clave.`)
      setEmail('')
      setAbriendo(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-errbg px-3 py-2 text-[11px] text-errtx">{error}</p>}
      {aviso && (
        <p className="rounded-md bg-okbg px-3 py-2 text-[11px] text-oktx">{aviso}</p>
      )}

      {/* La lista: cada fila ES el botón que abre la ficha. El desactivado se
          ve atenuado —tratamiento visual, no una columna— y el detalle de por
          qué está así vive adentro, como todo lo demás. */}
      <ul className="divide-y divide-line2">
        {usuarios.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => abrir(u)}
              className={`group flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-panel/50 ${
                u.desactivado ? 'opacity-50' : ''
              }`}
            >
              <Burbuja u={u} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-ink group-hover:text-blue-d">
                  {[u.nombre, u.apellido].filter(Boolean).join(' ') || u.email}
                </span>
                {(u.nombre || u.apellido) && (
                  <span className="block truncate text-[10.5px] text-muted">{u.email}</span>
                )}
              </span>
              {u.rol ? (
                <Badge estado={ROL_BADGE[u.rol]}>{ROL_LABEL[u.rol]}</Badge>
              ) : (
                <Badge estado="neutro">Sin rol</Badge>
              )}
            </button>
          </li>
        ))}
      </ul>

      {abriendo ? (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-4">
          <Field label="Email" className="min-w-56 flex-1">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@campa.com.ar"
            />
          </Field>
          <Field label="Rol">
            <Select value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as Rol)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROL_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={onInvitar} loading={pendiente} disabled={!email.includes('@')}>
            Enviar invitación
          </Button>
          <Button variant="tertiary" onClick={() => setAbriendo(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button variant="secondary" icon="plus" onClick={() => setAbriendo(true)}>
          Invitar usuario
        </Button>
      )}

      {/* ── La ficha ───────────────────────────────────────────────────────
          Todo lo del usuario en un lugar: identidad, último ingreso, alta,
          estado, y la edición completa — rol incluido. Antes el rol se
          cambiaba con un select suelto en la fila y el resto en un modal
          aparte; Facu lo unificó acá (10/09): una persona, una ficha. */}
      {ficha && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-md border border-line bg-white p-5 shadow-lg">
            <div className="flex items-center gap-3">
              <Burbuja u={ficha} grande />
              <div className="min-w-0">
                <h2 className="truncate text-[14px] font-extrabold text-ink">
                  {[ficha.nombre, ficha.apellido].filter(Boolean).join(' ') || ficha.email}
                </h2>
                <p className="truncate text-[11px] text-muted">{ficha.email}</p>
              </div>
              {ficha.desactivado && <Badge estado="vencido">Desactivado</Badge>}
            </div>

            {/* Ingreso y alta: los dos datos que antes eran columnas de la
                lista. Son de la ficha — cuentan la historia de ESTA cuenta. */}
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-panel px-3 py-2.5">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Último ingreso
                </div>
                <div className="text-[11.5px] text-ink">{fecha(ficha.ultimo_login)}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                  Alta
                </div>
                <div className="text-[11.5px] text-ink">{fecha(ficha.creado)}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </Field>
              <Field label="Apellido">
                <Input value={apellido} onChange={(e) => setApellido(e.target.value)} />
              </Field>
            </div>

            <div className="mt-3">
              <Field
                label="Rol"
                hint="El permiso viaja en la sesión: el cambio le aplica cuando se renueve."
              >
                <Select value={rol} onChange={(e) => setRol(e.target.value as Rol | '')}>
                  {/* La opción vacía existe sólo mientras NO tiene rol:
                      ofrecerla siempre sería ofrecer quitárselo, que no es una
                      operación de esta pantalla. */}
                  {!ficha.rol && <option value="">(sin rol)</option>}
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROL_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2 text-[11px] text-ink">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="mt-0.5 size-3.5 accent-blue"
              />
              <span>
                <strong className="font-bold">Puede entrar al sistema</strong>
                <br />
                <span className="text-muted">
                  Desactivar impide el ingreso y deja la cuenta y toda su historia en pie. No se
                  borra: los asientos que creó tienen que seguir apuntando a alguien.
                </span>
              </span>
            </label>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button icon="check" loading={pendiente} disabled={pendiente} onClick={onGuardar}>
                Guardar
              </Button>
              <Button variant="tertiary" disabled={pendiente} onClick={() => setFicha(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
