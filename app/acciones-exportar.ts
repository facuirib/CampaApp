'use server'

import { createClient } from '@/lib/db/server'

/**
 * Los CSV del dashboard.
 *
 * ── Salen de las VISTAS, no de la pantalla ────────────────────────────────
 *
 * Cada panel vuelve a consultar su vista en vez de serializar lo que el
 * dashboard ya tenía en memoria. Dos razones, y la segunda es la que importa:
 *
 *   · el dashboard RECORTA —las deudas urgentes muestran 8 de 27— y un export
 *     que copiara la pantalla se llevaría el recorte puesto, que es justo lo
 *     que nadie quiere de un archivo que se abre en una planilla;
 *   · si el CSV saliera del front, sería una segunda representación de los
 *     mismos números y podría separarse de la vista. Saliendo de la vista, el
 *     CSV y la pantalla son el mismo dato por construcción.
 *
 * ── Por qué Server Action y no un route handler ───────────────────────────
 *
 * La convención del proyecto es no usar API routes. Devolver el texto y que el
 * cliente arme el Blob alcanza: son planillas de decenas de filas, no de
 * millones, y así el permiso lo sigue resolviendo RLS con el cliente del
 * usuario — un route handler habría sido una puerta nueva que asegurar.
 */

export interface Csv {
  nombre: string
  contenido: string
}

/** Los paneles exportables. El nombre del archivo sale de acá. */
export type Panel = 'cobranza' | 'resultado' | 'cobros' | 'equipos'

/**
 * Una celda de CSV.
 *
 * Escapa comillas y encierra cuando hace falta. El separador es `;` y no `,`:
 * Excel en configuración regional argentina usa la coma como separador
 * DECIMAL, así que un CSV con comas se abre todo en una sola columna. Es el
 * detalle que decide si el archivo sirve o hay que pelearse con el importador.
 */
function celda(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

function aCsv(cabeceras: string[], filas: unknown[][]): string {
  // BOM para que Excel reconozca UTF-8 y no rompa los acentos.
  return '﻿' + [cabeceras, ...filas].map((f) => f.map(celda).join(';')).join('\n')
}

export async function exportarPanel(
  panel: Panel,
  opciones: { torneoId?: string | null; anio?: number } = {},
): Promise<Csv | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión vencida. Volvé a entrar.' }

  const anio = opciones.anio ?? new Date().getFullYear()

  if (panel === 'cobranza') {
    // La cola COMPLETA, no las 8 que muestra el dashboard.
    let q = supabase
      .from('v_cobranza_cola')
      .select('*')
      .order('dias_atraso_maximo', { ascending: false, nullsFirst: false })
    if (opciones.torneoId) q = q.eq('torneo_id', opciones.torneoId)
    const { data, error } = await q
    if (error) return { error: error.message }
    return {
      nombre: `cobranza-${anio}.csv`,
      contenido: aCsv(
        ['Equipo', 'Etapa', 'Días de atraso', 'Vencido', 'Por vencer', 'Adeudado', 'Cuotas vencidas'],
        (data ?? []).map((c) => [
          c.equipo,
          c.etapa,
          c.dias_atraso_maximo,
          c.total_vencido,
          c.total_por_vencer,
          c.total_adeudado,
          c.cuotas_vencidas,
        ]),
      ),
    }
  }

  if (panel === 'resultado') {
    const { data, error } = await supabase
      .from('v_pl_mensual_total')
      .select('*')
      .eq('anio', anio)
      .order('mes')
    if (error) return { error: error.message }
    return {
      nombre: `resultado-${anio}.csv`,
      contenido: aCsv(
        ['Año', 'Mes', 'Ingresos', 'Egresos', 'Financiero', 'Resultado'],
        (data ?? []).map((m) => [m.anio, m.mes, m.ingresos, m.egresos, m.financiero, m.resultado]),
      ),
    }
  }

  if (panel === 'cobros') {
    const { data, error } = await supabase
      .from('v_cobro_medio_mes')
      .select('*')
      .eq('anio', anio)
      .order('mes')
    if (error) return { error: error.message }
    return {
      nombre: `cobros-por-medio-${anio}.csv`,
      contenido: aCsv(
        ['Año', 'Mes', 'Medio de pago', 'Cobros', 'Total'],
        (data ?? []).map((c) => [c.anio, c.mes, c.medio_pago, c.cobros, c.total]),
      ),
    }
  }

  // equipos
  let q = supabase.from('v_cuenta_corriente_equipo').select('*').order('equipo')
  if (opciones.torneoId) q = q.eq('torneo_id', opciones.torneoId)
  const { data, error } = await q
  if (error) return { error: error.message }
  return {
    nombre: `equipos-${anio}.csv`,
    contenido: aCsv(
      [
        'Equipo', 'Torneo', 'Categoría', 'Serie', 'Inscripción', 'Partidos', 'Medio previsto',
        'Total del plan', 'Pagado', 'Saldo', 'Cuotas', 'Cuotas pagadas',
      ],
      (data ?? []).map((e) => [
        e.equipo, e.torneo, e.categoria, e.serie, e.plan_inscripcion, e.plan_partidos,
        e.medio_previsto, e.total_plan, e.total_pagado, e.saldo, e.cuotas_total, e.cuotas_pagadas,
      ]),
    ),
  }
}
