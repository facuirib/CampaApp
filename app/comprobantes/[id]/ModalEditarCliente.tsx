'use client'

import { Marco } from '@/components/ui'
import FormularioFiscal from '@/app/clientes/FormularioFiscal'
import type { ContextoEmision } from './emitir'

export default function ModalEditarCliente({
  contexto,
  onCerrar,
  onGuardado,
}: {
  contexto: ContextoEmision
  onCerrar: () => void
  onGuardado: () => void
}) {
  return (
    <Marco titulo="Datos del cliente" onCerrar={onCerrar}>
      <FormularioFiscal
        terceroId={contexto.terceroId}
        nombre={contexto.clienteNombre}
        tipo={contexto.tipo}
        condiciones={contexto.condiciones}
        inicial={{
          razon_social: contexto.razonSocial,
          doc_tipo_default: contexto.docTipo,
          doc_nro_default: contexto.docNro,
          condicion_iva_receptor_default: contexto.condicionIvaId,
          domicilio_fiscal: contexto.domicilioFiscal,
          email: contexto.email,
          contacto: contexto.contacto,
        }}
        puedeEditar={true}
        onGuardado={onGuardado}
      />
    </Marco>
  )
}
