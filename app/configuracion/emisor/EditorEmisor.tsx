"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui'
import {
  crearPunto,
  guardarEmisor,
  guardarPunto,
  type DatosEmisor,
  type DatosPunto,
} from './acciones'

export interface CondicionIva {
  id: number
  descripcion: string
}

export interface EditorEmisorProps {
  emisor: DatosEmisor
  puntos: DatosPunto[]
  condiciones: CondicionIva[]
  /**
   * Si el rol puede editar. Baja RESUELTO desde la Server Page: quién puede qué
   * ya se decidió en `lib/permisos` y está verificado contra las policies.
   */
  puedeEditar: boolean
}

const PUNTO_NUEVO: DatosPunto = { numero: 0, nombre: '', domicilio: '', activo: true }

/**
 * El emisor y sus puntos de venta.
 *
 * ── Por qué los puntos son una lista y no dos campos ──────────────────────
 *
 * CAMPA SRL es un CUIT y **dos domicilios**, y el domicilio determina Comercio
 * e Industria —un impuesto municipal por ubicación—. Por eso el punto se elige
 * al facturar, y por eso esto es una tabla ampliable: el día que haya un tercer
 * predio se agrega una fila, no se toca código.
 *
 * El número no se edita en un punto que ya existe: es el de ARCA y es lo que los
 * comprobantes emitidos guardan. Cambiarlo dejaría al histórico apuntando a otro
 * lugar. Se crea uno nuevo y se desactiva el viejo.
 */
export default function EditorEmisor({
  emisor: emisorInicial,
  puntos: puntosIniciales,
  condiciones,
  puedeEditar,
}: EditorEmisorProps) {
  const router = useRouter()

  const [emisor, setEmisor] = useState(emisorInicial)
  const [puntos, setPuntos] = useState(puntosIniciales)
  const [nuevo, setNuevo] = useState<DatosPunto | null>(null)
  const [cuitOk, setCuitOk] = useState<boolean | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function limpiarMensajes() {
    setAviso(null)
    setError(null)
  }

  /** Le pregunta a la base, que es la que después decide en el constraint. */
  async function revisarCuit(valor: string) {
    if (!valor.trim()) return setCuitOk(null)
    const { data } = await createClient().rpc('cuit_valido', { p_cuit: valor })
    setCuitOk(data ?? null)
  }

  async function correr(accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
    setOcupado(true)
    limpiarMensajes()
    const r = await accion()
    setOcupado(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo guardar.')
    setAviso(exito)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="mb-4 text-[13px] font-extrabold text-ink">Datos del emisor</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Razón social" required className="sm:col-span-2">
            <Input
              value={emisor.razon_social}
              readOnly={!puedeEditar}
              onChange={(e) => {
                setEmisor({ ...emisor, razon_social: e.target.value })
                limpiarMensajes()
              }}
            />
          </Field>

          <Field
            label="CUIT"
            required
            error={cuitOk === false ? 'El dígito verificador no cierra.' : null}
            hint={cuitOk === true ? 'CUIT válido.' : 'Se aceptan guiones y puntos.'}
          >
            <Input
              value={emisor.cuit}
              readOnly={!puedeEditar}
              onChange={(e) => {
                setEmisor({ ...emisor, cuit: e.target.value })
                revisarCuit(e.target.value)
                limpiarMensajes()
              }}
            />
          </Field>

          <Field label="Condición frente al IVA" required>
            <Select
              disabled={!puedeEditar}
              value={emisor.condicion_iva_id.toString()}
              onChange={(e) => {
                setEmisor({ ...emisor, condicion_iva_id: Number(e.target.value) })
                limpiarMensajes()
              }}
            >
              {condiciones.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.descripcion}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Ingresos brutos" hint="Se imprime en la Factura A.">
            <Input
              value={emisor.ingresos_brutos ?? ''}
              readOnly={!puedeEditar}
              onChange={(e) => {
                setEmisor({ ...emisor, ingresos_brutos: e.target.value })
                limpiarMensajes()
              }}
            />
          </Field>

          <Field label="Inicio de actividades">
            <Input
              type="date"
              value={emisor.inicio_actividades ?? ''}
              readOnly={!puedeEditar}
              onChange={(e) => {
                setEmisor({ ...emisor, inicio_actividades: e.target.value })
                limpiarMensajes()
              }}
            />
          </Field>
        </div>

        {puedeEditar && (
          <div className="mt-5">
            <Button
              icon="check"
              loading={ocupado}
              disabled={ocupado}
              onClick={() => correr(() => guardarEmisor(emisor), 'Emisor guardado.')}
            >
              Guardar emisor
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-[13px] font-extrabold text-ink">Puntos de venta</h2>
        <p className="mb-4 text-[11px] leading-snug text-muted">
          Cada punto tiene su domicilio, y <strong>el domicilio determina Comercio e Industria</strong>
          {' '}— por eso se elige el punto al facturar. Un punto que ya emitió no se borra: se
          desactiva, para que los comprobantes que lo usaron sigan teniendo a dónde apuntar.
        </p>

        <div className="space-y-3">
          {puntos.map((p, i) => (
            <div key={p.numero} className="rounded-md border border-line bg-white/60 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge estado="neutro">Punto {p.numero}</Badge>
                {!p.activo && <Badge estado="porVencer">Desactivado</Badge>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre">
                  <Input
                    value={p.nombre}
                    readOnly={!puedeEditar}
                    onChange={(e) => {
                      const copia = [...puntos]
                      copia[i] = { ...p, nombre: e.target.value }
                      setPuntos(copia)
                      limpiarMensajes()
                    }}
                  />
                </Field>
                <Field label="Domicilio" hint="El que define Comercio e Industria.">
                  <Input
                    value={p.domicilio}
                    readOnly={!puedeEditar}
                    onChange={(e) => {
                      const copia = [...puntos]
                      copia[i] = { ...p, domicilio: e.target.value }
                      setPuntos(copia)
                      limpiarMensajes()
                    }}
                  />
                </Field>
              </div>

              {puedeEditar && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="pill"
                    variant="secondary"
                    disabled={ocupado}
                    onClick={() => correr(() => guardarPunto(p), `Punto ${p.numero} guardado.`)}
                  >
                    Guardar
                  </Button>
                  <Button
                    size="pill"
                    variant="tertiary"
                    disabled={ocupado}
                    onClick={() =>
                      correr(
                        () => guardarPunto({ ...p, activo: !p.activo }),
                        p.activo ? `Punto ${p.numero} desactivado.` : `Punto ${p.numero} activado.`,
                      )
                    }
                  >
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {puedeEditar &&
          (nuevo ? (
            <div className="mt-3 rounded-md border border-line bg-white p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Número" required hint="El que habilitó ARCA.">
                  <Input
                    type="number"
                    value={nuevo.numero || ''}
                    onChange={(e) => setNuevo({ ...nuevo, numero: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Nombre" required>
                  <Input
                    value={nuevo.nombre}
                    onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                  />
                </Field>
                <Field label="Domicilio" required>
                  <Input
                    value={nuevo.domicilio}
                    onChange={(e) => setNuevo({ ...nuevo, domicilio: e.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  icon="check"
                  loading={ocupado}
                  disabled={ocupado || !nuevo.numero || !nuevo.nombre.trim() || !nuevo.domicilio.trim()}
                  onClick={() =>
                    correr(async () => {
                      const r = await crearPunto(nuevo)
                      if (r.ok) setNuevo(null)
                      return r
                    }, `Punto ${nuevo.numero} agregado.`)
                  }
                >
                  Agregar
                </Button>
                <Button variant="tertiary" onClick={() => setNuevo(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <Button variant="secondary" icon="plus" onClick={() => setNuevo(PUNTO_NUEVO)}>
                Agregar punto de venta
              </Button>
            </div>
          ))}

        {!puedeEditar && (
          <p className="mt-4 rounded-md bg-panel px-4 py-3 text-[11px] text-muted">
            Estás viendo la configuración en modo lectura. Editar el emisor y sus puntos de venta
            es de administrador.
          </p>
        )}
      </Card>

      {aviso && (
        <p className="rounded-md bg-okbg px-4 py-3 text-[11px] text-oktx">{aviso}</p>
      )}
      {error && (
        <p className="rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error}</p>
      )}
    </div>
  )
}
