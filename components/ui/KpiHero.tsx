import { Fragment } from 'react'
import { valorKpi, type TonoKpi, type ValorKpi } from './KpiCard'

export interface KpiHeroProps {
  /**
   * Los números del resumen, en orden.
   *
   * Array y no `children` a propósito: así los separadores y el espaciado
   * quedan del lado del componente, y el resumen financiero se ve igual en
   * toda la app. Con children, cada pantalla tendría que dibujar sus propias
   * divisiones —o el componente tendría que clonar hijos para meterlas, que
   * es frágil.
   */
  valores: ValorKpi[]
  className?: string
}

/**
 * Sobre navy el mapa de tonos cambia, y no por gusto.
 *
 * `info` usa --flyway y no --blue: el azul de marca sobre este fondo da 3.94:1
 * de contraste —pasa solo por ser texto grande— mientras que --flyway da 6.10.
 * Es el mismo azul de la familia, y es el que usa la sección 4 del sistema
 * para este bloque. En la barra lateral de KpiCard sigue siendo --blue, porque
 * ahí es una barra y no texto.
 */
const NUMERO: Record<TonoKpi, string> = {
  positivo: 'text-ok',
  alerta: 'text-err',
  // Sobre el navy del hero el `--warn` pelado queda oscuro: va el `warnbg`,
  // que es el mismo amarillo aclarado y el que ya se usa contra fondo oscuro.
  advertencia: 'text-warnbg',
  info: 'text-flyway',
  neutro: 'text-white',
}

/**
 * El resumen financiero: varios números juntos, sobre navy.
 *
 * Es el mismo `--night` del isologo y de la fila de total del DataTable. Esa
 * repetición hace trabajo: el fondo oscuro ya significa "esto es el total, no
 * una parte" en el resto de la app, y acá dice lo mismo sin explicarlo.
 */
export default function KpiHero({ valores, className }: KpiHeroProps) {
  return (
    <div
      className={[
        'flex flex-col gap-4 rounded-md bg-night px-5 py-4',
        'sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-6',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {valores.map((v, i) => (
        <Fragment key={`${v.titulo}-${i}`}>
          {/* El separador se esconde apilado: una línea vertical entre dos
              bloques que están uno debajo del otro no separa nada. */}
          {i > 0 && <div className="hidden w-px self-stretch bg-white/15 sm:block" aria-hidden />}
          <div className="min-w-0">
            <div className="text-[9.5px] font-semibold text-white/60">{v.titulo}</div>
            <div
              className={`mt-1.5 text-[24px] font-extrabold tracking-[-.5px] ${
                NUMERO[v.tono ?? 'neutro']
              }`}
            >
              {valorKpi(v.valor, v.formato)}
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  )
}
