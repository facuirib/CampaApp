import { DataTable, type CeldaBadge, type ColumnDef } from '@/components/ui'

/**
 * La misma tabla de /design, sola y sin nada alrededor.
 *
 * Existe para que /design pueda embeberla en un iframe de 360px y mostrar el
 * colapso a cards sin que haya que achicar la ventana. El corte es por
 * breakpoint CSS, así que lo único que hace falta es un viewport angosto de
 * verdad — y eso es exactamente lo que da un iframe.
 */

interface FilaCobranza {
  id: string
  equipo: string
  estado: CeldaBadge
  deuda: number
}

const COLUMNAS: ColumnDef<FilaCobranza>[] = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'estado', label: 'Estado', format: 'badge' },
  { key: 'deuda', label: 'Deuda', format: 'money' },
]

const FILAS: FilaCobranza[] = [
  { id: '1', equipo: 'El Ciclón', estado: { estado: 'alDia', label: 'Al día' }, deuda: 0 },
  {
    id: '2',
    equipo: 'Escalera FC',
    estado: { estado: 'porVencer', label: 'Por vencer' },
    deuda: 850000,
  },
  { id: '3', equipo: 'Delirio FC', estado: { estado: 'mora', label: 'En mora' }, deuda: 3050000 },
]

export default function TablaMobilePage() {
  return (
    <DataTable
      columns={COLUMNAS}
      rows={FILAS}
      rowKey="id"
      total={{ equipo: 'Total', deuda: 3900000 }}
    />
  )
}
