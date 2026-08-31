"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Button, Field, Input, Select, type CeldaBadge } from '@/components/ui'
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

export default function UsuariosEditor({ usuarios }: { usuarios: FilaUsuario[] }) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [abriendo, setAbriendo] = useState(false)
  // El usuario que se está editando. `null` = popup cerrado.
  const [editando, setEditando] = useState<FilaUsuario | null>(null)
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [activo, setActivo] = useState(true)

  const [email, setEmail] = useState('')
  const [rolNuevo, setRolNuevo] = useState<Rol>('operador')

  function onGuardarUsuario() {
    if (!editando) return
    setError(null)
    setAviso(null)
    const id = editando.id
    startTransition(async () => {
      const r = await editarUsuario(id, { nombre, apellido, activo })
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar.')
        return
      }
      setEditando(null)
      setAviso('Usuario actualizado.')
      router.refresh()
    })
  }

  function onCambiarRol(id: string, rol: string) {
    setError(null)
    setAviso(null)
    startTransition(async () => {
      const r = await cambiarRol(id, rol)
      if (!r.ok) {
        setError(r.error ?? 'No se pudo cambiar el rol.')
        return
      }
      setAviso('Rol cambiado. Le aplica cuando su sesión se renueve.')
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

      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-3">Email</th>
            <th className="py-2 pr-3">Estado</th>
            <th className="py-2 pr-3">Nombre</th>
            <th className="py-2 pr-3">Último ingreso</th>
            <th className="py-2 pr-3">Alta</th>
            <th className="py-2 pr-3">Rol</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="border-b border-line last:border-0">
              <td className="py-2 pr-3 font-medium text-ink">{u.email}</td>
              <td className="py-2 pr-3">
                {u.desactivado ? (
                  <Badge estado="vencido">Desactivado</Badge>
                ) : (
                  <Badge estado="ok">Activo</Badge>
                )}
              </td>
              <td className="py-2 pr-3 text-ink">
                {[u.nombre, u.apellido].filter(Boolean).join(' ') || (
                  <span className="text-disabled">—</span>
                )}
              </td>
              <td className="py-2 pr-3 text-muted">{fecha(u.ultimo_login)}</td>
              <td className="py-2 pr-3 text-muted">{fecha(u.creado)}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <Select
                    value={u.rol ?? ''}
                    disabled={pendiente}
                    onChange={(e) => onCambiarRol(u.id, e.target.value)}
                    className="w-44"
                  >
                    {/* La opción vacía existe solo mientras HAY alguien sin rol:
                        ofrecerla siempre sería ofrecer quitarle el rol a alguien,
                        que no es una operación que esta pantalla haga. */}
                    {!u.rol && <option value="">(sin rol)</option>}
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROL_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  {u.rol && (
                    <Badge estado={ROL_BADGE[u.rol]}>{ROL_LABEL[u.rol]}</Badge>
                  )}
                </div>
              </td>
              <td className="py-2">
                {/* El rol se cambia en su Select y esto NO lo toca: son dos
                    cosas distintas y ya tienen dos puertas. Nombre, apellido y
                    estado son datos de la persona; el rol es un permiso. */}
                <Button
                  size="pill"
                  variant="tertiary"
                  disabled={pendiente}
                  onClick={() => {
                    setEditando(u)
                    setNombre(u.nombre)
                    setApellido(u.apellido)
                    setActivo(!u.desactivado)
                  }}
                >
                  Editar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {abriendo ? (
        <div className="flex items-end gap-3 rounded-md border border-line bg-white p-4">
          <Field label="Email" className="flex-1">
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
        <Button
          variant="secondary"
          icon="plus"
          onClick={() => setAbriendo(true)}
        >
          Invitar usuario
        </Button>
      )}

      {/* ── El popup de edición ────────────────────────────────────────────
          Modal y no una fila expandible: editar un usuario es una operación
          puntual sobre UNO, y una fila que crece empuja a las demás mientras se
          escribe.

          El ROL no está acá aunque el barrido lo pedía junto: ya tiene su
          Select en la fila y funciona. Duplicarlo acá daría dos lugares para lo
          mismo con dos estados que pueden discrepar — y el rol es la operación
          que más manda, la última que conviene tener por duplicado. */}
      {editando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-md border border-line bg-white p-5 shadow-lg">
            <h2 className="text-[13px] font-extrabold text-ink">Editar usuario</h2>
            <p className="mt-1 text-[11px] text-muted">{editando.email}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </Field>
              <Field label="Apellido">
                <Input value={apellido} onChange={(e) => setApellido(e.target.value)} />
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
              <Button icon="check" loading={pendiente} disabled={pendiente} onClick={onGuardarUsuario}>
                Guardar
              </Button>
              <Button variant="tertiary" disabled={pendiente} onClick={() => setEditando(null)}>
                Cancelar
              </Button>
            </div>

            <p className="mt-4 border-t border-line pt-3 text-[10.5px] leading-snug text-muted">
              El rol se cambia desde la lista, en su propio selector.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
