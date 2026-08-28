import type { DatosEmisor } from './comun.ts'
import type { DatosFactura } from './factura.ts'
import type { DatosRecibo } from './recibo.ts'

/**
 * El mapeo fila → datos del generador.
 *
 * **Función pura, y por eso vive acá y no en la pantalla.** La consulta la hace
 * quien llama —la Server Action, un script— y esto sólo traduce. Así el mismo
 * mapeo sirve para los dos, y el día que cambie una columna hay un solo lugar
 * donde acomodarlo.
 *
 * Los tipos de entrada son laxos a propósito: la fila puede venir de la tabla o
 * de `v_comprobante`, y las dos traen lo mismo con nombres distintos para lo
 * derivado. Lo que importa son las columnas crudas, que son iguales en ambas.
 */

/** Lo que se necesita de la fila, venga de donde venga. */
export interface FilaComprobante {
  tipo_comprobante: number
  punto_venta: number
  numero: number
  fecha_emision: string
  receptor_nombre: string | null
  receptor_doc_tipo: number | null
  receptor_doc_nro: string | null
  receptor_domicilio: string | null
  detalle: string | null
  monto: number | string
  neto: number | string | null
  iva: number | string | null
  cae: string | null
  cae_vencimiento: string | null
  tipo_cod_aut: string
  moneda: string
  cotizacion: number | string
  emisor_domicilio: string | null
  condicion_iva_receptor_id: number
}

const n = (v: number | string | null | undefined): number => Number(v ?? 0)

export function datosFacturaDesdeFila(
  fila: FilaComprobante,
  emisor: DatosEmisor,
  condicionIvaReceptor: string,
): DatosFactura {
  return {
    tipoComprobante: fila.tipo_comprobante,
    puntoVenta: fila.punto_venta,
    numero: fila.numero,
    fecha: fila.fecha_emision,
    receptorNombre: fila.receptor_nombre ?? '',
    receptorDocTipo: fila.receptor_doc_tipo ?? 99,
    receptorDocNro: fila.receptor_doc_nro ?? '0',
    receptorCondicionIva: condicionIvaReceptor,
    receptorDomicilio: fila.receptor_domicilio,
    detalle: fila.detalle ?? '',
    monto: n(fila.monto),
    neto: n(fila.neto),
    iva: n(fila.iva),
    cae: fila.cae ?? '',
    // Puede faltar: la #407 no lo tiene. El generador imprime «(a completar)».
    caeVencimiento: fila.cae_vencimiento,
    tipoCodAut: fila.tipo_cod_aut === 'A' ? 'A' : 'E',
    moneda: fila.moneda,
    cotizacion: n(fila.cotizacion),
    emisor: {
      ...emisor,
      // El domicilio sale de la FILA —congelado del punto elegido al emitir—, no
      // de la tabla `punto_venta`: es el que valía ese día, y es el que define
      // Comercio e Industria.
      domicilioComercial: fila.emisor_domicilio,
    },
  }
}

export function datosReciboDesdeFila(
  fila: FilaComprobante,
  emisor: DatosEmisor,
  condicionIvaReceptor: string,
  emitidoPor?: string | null,
): DatosRecibo {
  return {
    numero: fila.numero,
    fecha: fila.fecha_emision,
    receptorNombre: fila.receptor_nombre ?? '',
    receptorDocumento: fila.receptor_doc_nro,
    receptorCondicionIva: condicionIvaReceptor,
    receptorDomicilio: fila.receptor_domicilio,
    detalle: fila.detalle ?? '',
    monto: n(fila.monto),
    emitidoPor: emitidoPor ?? null,
    emisor: { razonSocial: emisor.razonSocial, cuit: emisor.cuit },
  }
}
