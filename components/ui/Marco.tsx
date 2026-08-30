import Card from './Card'

export interface MarcoProps {
  titulo: string
  paso?: number
  children: React.ReactNode
  onCerrar: () => void
}

export default function Marco({ titulo, paso, children, onCerrar }: MarcoProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-[520px]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-extrabold text-ink">{titulo}</h2>
            {paso && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Paso {paso} de 4
              </span>
            )}
          </div>
          {children}
        </Card>
      </div>
      <button className="sr-only" onClick={onCerrar}>
        Cerrar
      </button>
    </div>
  )
}
