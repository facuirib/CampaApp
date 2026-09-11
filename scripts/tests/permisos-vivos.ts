/**
 * Capa 2 · La matriz de permisos, VIVA.
 *
 *   npm run test:permisos
 *
 * `verificar:permisos` compara el catálogo contra `pg_policies` — texto contra
 * texto. Esta capa hace lo que aquél no puede: EJECUTA. Se suplanta cada rol
 * (ver `comoRol` en comun.ts) y se intentan las operaciones, esperando la
 * denegación o el paso según lo que `lib/permisos.ts` declara.
 *
 * Es el test que habría atrapado el caso `borrar_torneo`: policies de DELETE
 * ausentes, RLS denegando en silencio, y la función informando «borrado» sin
 * borrar. El texto decía una cosa; la ejecución, otra.
 *
 * No recorre las 70 operaciones: prueba las puertas más caras (diario, ciclo
 * de torneo, devengos, alta de padrón) con el rol MÁS alto que debe quedar
 * afuera — si el límite aguanta ahí, aguanta para abajo. Todo en transacción
 * revertida.
 */

import { CasoSalteado, FalloDeCaso, Suite, comoRol, conectar, debeFallar, exigir } from './comun.ts'
import type { Client } from 'pg'
import type { Rol } from '../../lib/roles.ts'

const s = new Suite('Matriz de permisos viva', await conectar())

/** La denegación llega como error de guarda o de RLS; cualquiera sirve. */
async function denegado(c: Client, rol: Rol, sql: string, contexto: string, args: unknown[] = []) {
  await comoRol(c, rol)
  await debeFallar(() => c.query(sql, args), '', `${contexto} como ${rol}`)
}

// ── El diario ──────────────────────────────────────────────────────────────

await s.caso('lectura no escribe el diario (crear_asiento)', async (c) => {
  await denegado(
    c,
    'read-only',
    `select crear_asiento(current_date, 'ajuste', 'no', '[{"cuenta":"CAJA_TRANSFERENCIA","debe":1},{"cuenta":"ING_PARTIDOS","haber":1}]'::jsonb)`,
    'crear_asiento',
  )
})

// NOTA que dejó la primera corrida: bar SÍ puede llamar `crear_asiento` — la
// policy de INSERT de `asiento` lo incluye porque su circuito de ventas y
// arqueo escribe el diario con las funciones como invoker. No es un caso de
// esta suite: es el diseño. Lo que bar NO debe poder es lo de abajo.

await s.caso('bar no cierra períodos (UPDATE denegado en silencio → 0 filas)', async (c) => {
  // La denegación de UPDATE por RLS no levanta error: afecta 0 filas. Este
  // caso prueba exactamente el modo de falla silencioso que ya mordió una vez
  // (`borrar_torneo`): se exige el row count, no la ausencia de excepción.
  const { rows: abiertos } = await c.query(
    `select id from periodo where estado = 'abierto' limit 1`,
  )
  if (abiertos.length === 0) throw new CasoSalteado('no hay período abierto')
  await comoRol(c, 'bar')
  const { rows } = await c.query(
    `update periodo set estado = 'cerrado' where id = $1 returning id`,
    [abiertos[0].id],
  )
  exigir(rows.length === 0, `bar cerró un período: la policy de UPDATE lo dejó pasar`)
})

await s.caso('lectura no anula asientos', async (c) => {
  const { rows } = await c.query('select id from asiento where anulado_por is null limit 1')
  if (rows.length === 0) throw new CasoSalteado('no hay asientos vigentes')
  await denegado(c, 'read-only', `select anular_asiento($1, 'no')`, 'anular_asiento', [rows[0].id])
})

// ── El ciclo de torneo: SOLO_ADMIN, probado con el rol más alto de abajo ──

await s.caso('operador no borra torneos (borrar_torneo es de admin)', async (c) => {
  const { rows } = await c.query('select id from torneo limit 1')
  if (rows.length === 0) throw new CasoSalteado('no hay torneos')
  await denegado(c, 'operador', 'select borrar_torneo($1)', 'borrar_torneo', [rows[0].id])
})

await s.caso('operador no cierra el ciclo (cerrar_torneo es de admin)', async (c) => {
  const { rows } = await c.query(`select id from torneo where estado = 'en_curso' limit 1`)
  if (rows.length === 0) throw new CasoSalteado('no hay torneo en curso')
  await denegado(c, 'operador', 'select cerrar_torneo($1)', 'cerrar_torneo', [rows[0].id])
})

await s.caso('finanzas no toca la estructura del torneo', async (c) => {
  const { rows } = await c.query('select id from torneo limit 1')
  if (rows.length === 0) throw new CasoSalteado('no hay torneos')
  await denegado(
    c,
    'finanzas',
    `select crear_categoria($1, 'Categoría test', 'masculino')`,
    'crear_categoria',
    [rows[0].id],
  )
})

// ── Devengos y padrón ──────────────────────────────────────────────────────

await s.caso('lectura no corre devengos', async (c) => {
  // Este caso no puede usar `denegado` a secas: si el período ya está todo
  // devengado, la función no intenta NINGÚN insert y termina sin que RLS
  // tenga nada que frenar. Tres salidas honestas:
  //   error       → la denegación llegó: pasa
  //   devengó 0   → no había nada para escribir: INCONCLUSO, se saltea
  //   devengó > 0 → lectura ESCRIBIÓ el diario: falla de verdad
  const { rows } = await c.query(`select id from periodo where estado = 'abierto' limit 1`)
  if (rows.length === 0) throw new CasoSalteado('no hay período abierto')
  await comoRol(c, 'read-only')
  let n: number
  try {
    const r = await c.query('select devengar_sueldos_socios($1) as n', [rows[0].id])
    n = Number(r.rows[0].n)
  } catch {
    return // denegado: es lo que se esperaba
  }
  if (n === 0) throw new CasoSalteado('el período ya estaba devengado; no hubo escritura que frenar')
  throw new FalloDeCaso(`lectura devengó ${n} sueldo(s): RLS no frenó la escritura`)
})

await s.caso('bar no crea proveedores', async (c) => {
  await denegado(c, 'bar', `select crear_proveedor('Proveedor Test')`, 'crear_proveedor')
})

// ── El positivo de control ─────────────────────────────────────────────────
//
// Si TODO diera denegado la suite también «pasaría» con la base rota entera.
// Este caso cierra esa puerta: admin SÍ puede escribir el diario. (Revertido,
// como todo.)

await s.caso('admin sí escribe el diario (control positivo)', async (c) => {
  await comoRol(c, 'admin')
  const { rows: per } = await c.query(
    `select make_date(anio, mes, 15)::text as fecha from periodo where estado = 'abierto' order by anio, mes limit 1`,
  )
  if (per.length === 0) throw new CasoSalteado('no hay período abierto')
  const { rows } = await c.query(
    `select crear_asiento($1, 'ajuste', 'control positivo suite', '[{"cuenta":"CAJA_TRANSFERENCIA","debe":1},{"cuenta":"ING_PARTIDOS","haber":1}]'::jsonb) as id`,
    [per[0].fecha],
  )
  exigir(!!rows[0].id, 'admin no pudo crear un asiento — la matriz entera está rota')
})

process.exit(s.cerrar() ? 0 : 1)
