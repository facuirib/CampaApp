"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import { Badge, Button, Field, Input, Select } from '@/components/ui'
import { guardarDatosFiscales, type DatosFiscales } from './acciones'

export interface CondicionIva {
  id: number
  descripcion: string
}

export interface FormularioFiscalProps {
  terceroId: string
  nombre: string
  tipo: string
  condiciones: CondicionIva[]
  inicial: DatosFiscales
  /**
   * Si el rol puede editar. Baja RESUELTO desde la Server Page —booleano, no el
   * rol— porque quién puede qué ya se decidió en `lib/permisos` y está
   * verificado contra la policy de `tercero`. Repetir esa decisión acá es la
   * forma más silenciosa de que las dos se separen.
   *
   * Y esto ESCONDE, no protege: quien mande el POST igual se topa con RLS.
   */
  puedeEditar: boolean
  /**
   * Se llama después de guardar con éxito, luego de `router.refresh()`. Para
   * cuando este formulario se usa fuera de su propia ruta —un modal, por
   * ejemplo— y quien lo envuelve necesita reaccionar sin depender del router.
   */
  onGuardado?: () => void
}

/** El 80 es CUIT, y es el único que valida dígito verificador. */
const DOC_TIPOS = [
  { valor: 80, label: 'CUIT' },
  { valor: 96, label: 'DNI' },
  { valor: 99, label: 'Consumidor Final sin identificar' },
]

const RESPONSABLE_INSCRIPTO = 1

/**
 * El formulario de datos fiscales de un cliente.
 *
 * ── El CUIT se valida contra la MISMA función que el constraint ────────────
 *
 * `cuit_valido()` vive en la base y la pantalla la llama por `rpc` mientras se
 * tipea. Reescribir el algoritmo del dígito verificador en TypeScript daría dos
 * versiones que hay que mantener iguales, y la que decide de verdad es la de la
 * base: el aviso de acá sirve para no llegar al error, no para reemplazarlo.
 */
export default function FormularioFiscal({
  terceroId,
  nombre,
  tipo,
  condiciones,
  inicial,
  puedeEditar,
  onGuardado,
}: FormularioFiscalProps) {
  const router = useRouter()

  const [datos, setDatos] = useState<DatosFiscales>(inicial)
  const [cuitOk, setCuitOk] = useState<boolean | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const esRI = datos.condicion_iva_receptor_default === RESPONSABLE_INSCRIPTO
  const esCuit = datos.doc_tipo_default === 80

  function set<K extends keyof DatosFiscales>(campo: K, valor: DatosFiscales[K]) {
    setDatos((d) => ({ ...d, [campo]: valor }))
    setAviso(null)
    setError(null)
  }

  /** Le pregunta a la base, que es la que después decide en el constraint. */
  async function revisarCuit(valor: string) {
    if (!valor.trim() || !esCuit) return setCuitOk(null)
    const { data } = await createClient().rpc('cuit_valido', { p_cuit: valor })
    setCuitOk(data ?? null)
  }

  // La A necesita razón social y domicilio en el papel impreso. No se bloquea
  // el guardado —cargar de a poco es el modo normal de esta pantalla— pero se
  // dice, porque el cliente parece completo y no lo está.
  const faltaParaA =
    esRI && (!datos.razon_social?.trim() || !datos.domicilio_fiscal?.trim())

  async function guardar() {
    setGuardando(true)
    setError(null)
    setAviso(null)

    const r = await guardarDatosFiscales(terceroId, datos)

    setGuardando(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo guardar.')

    setAviso('Datos guardados.')
    router.refresh()
    onGuardado?.()
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-[13px] font-extrabold text-ink">Datos fiscales</h2>
        <Badge estado={tipo === 'sponsor' ? 'info' : 'neutro'}>
          {tipo === 'sponsor' ? 'Sponsor' : 'Equipo'}
        </Badge>
        <span className="text-[11px] text-muted">· {nombre}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Condición de IVA"
          hint="Determina si el comprobante es Factura A o B."
          className="sm:col-span-2"
        >
          <Select
            placeholder="Sin definir"
            disabled={!puedeEditar}
            value={datos.condicion_iva_receptor_default?.toString() ?? ''}
            onChange={(e) =>
              set('condicion_iva_receptor_default', e.target.value ? Number(e.target.value) : null)
            }
          >
            {condiciones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.descripcion}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tipo de documento">
          <Select
            placeholder="Sin definir"
            disabled={!puedeEditar}
            value={datos.doc_tipo_default?.toString() ?? ''}
            onChange={(e) => {
              set('doc_tipo_default', e.target.value ? Number(e.target.value) : null)
              setCuitOk(null)
            }}
          >
            {DOC_TIPOS.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Número de documento"
          error={esCuit && cuitOk === false ? 'El dígito verificador no cierra.' : null}
          hint={esCuit && cuitOk === true ? 'CUIT válido.' : 'Se aceptan guiones y puntos.'}
        >
          <Input
            value={datos.doc_nro_default ?? ''}
            readOnly={!puedeEditar}
            onChange={(e) => {
              set('doc_nro_default', e.target.value)
              revisarCuit(e.target.value)
            }}
          />
        </Field>

        <Field
          label="Razón social"
          required={esRI}
          hint="La del CUIT, distinta del nombre de fantasía."
        >
          <Input
            value={datos.razon_social ?? ''}
            readOnly={!puedeEditar}
            onChange={(e) => set('razon_social', e.target.value)}
          />
        </Field>

        <Field label="Domicilio fiscal" required={esRI}>
          <Input
            value={datos.domicilio_fiscal ?? ''}
            readOnly={!puedeEditar}
            onChange={(e) => set('domicilio_fiscal', e.target.value)}
          />
        </Field>

        <Field label="Email" hint="Para mandarle el comprobante y los reclamos.">
          <Input
            value={datos.email ?? ''}
            readOnly={!puedeEditar}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>

        <Field label="Contacto" hint="Teléfono del delegado, para WhatsApp.">
          <Input
            value={datos.contacto ?? ''}
            readOnly={!puedeEditar}
            onChange={(e) => set('contacto', e.target.value)}
          />
        </Field>
      </div>

      {faltaParaA && (
        <p className="mt-4 rounded-md bg-warnbg px-4 py-3 text-[11px] text-warntx">
          <strong className="font-bold">Es Responsable Inscripto</strong>, así que su comprobante
          va a ser una <strong>Factura A</strong> — y el papel impreso lleva razón social y
          domicilio. Sin esos dos se consigue el CAE y no se puede emitir el comprobante.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {puedeEditar ? (
          <Button icon="check" loading={guardando} disabled={guardando} onClick={guardar}>
            Guardar
          </Button>
        ) : (
          <p className="rounded-md bg-panel px-4 py-3 text-[11px] text-muted">
            Estás viendo la ficha en modo lectura. Editar los datos de un cliente es de
            administrador u operador.
          </p>
        )}

        {aviso && <span className="text-[11px] font-semibold text-oktx">{aviso}</span>}
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">{error}</p>
      )}
    </>
  )
}
