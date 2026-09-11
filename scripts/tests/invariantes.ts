/**
 * Capa 1 · Invariantes contables del motor de asientos.
 *
 *   npm run test:invariantes
 *
 * Es `scripts/test_asientos.sql` —que se corría a mano, de a un bloque, en el
 * SQL Editor— convertido en suite: los mismos casos, más los que el motor fue
 * ganando después (compensación de anulados en saldos, idempotencia de los
 * devengos, imputación que no excede). Cada caso en transacción revertida; la
 * base queda intacta. Ver el contrato en `comun.ts`.
 *
 * Corre como `postgres` (DATABASE_URL), no como un rol de la app: acá se
 * prueba EL MOTOR, no los permisos — para eso está `permisos-vivos.ts`.
 */

import {
  CasoSalteado,
  Suite,
  claimsDeRol,
  conectar,
  debeFallar,
  exigir,
} from './comun.ts'
import type { Client } from 'pg'

/**
 * Un asiento de prueba vía la única puerta. Devuelve el id.
 *
 * `p_created_by` con un usuario real: el motor exige responsable (o sesión
 * autenticada, que en conexión directa no hay). Con parámetros NOMBRADOS,
 * así el caso no depende del orden posicional de la firma.
 */
async function crearAsiento(
  c: Client,
  fecha: string,
  lineas: unknown[],
  opts: { predio?: string; descripcion?: string } = {},
): Promise<string> {
  const { rows: u } = await c.query('select id from auth.users limit 1')
  if (u.length === 0) throw new CasoSalteado('no hay usuarios en auth.users')
  const { rows } = await c.query(
    `select crear_asiento(
       p_fecha       => $1,
       p_origen      => 'ajuste',
       p_descripcion => $2,
       p_lineas      => $3::jsonb,
       p_predio_id   => $4,
       p_created_by  => $5
     ) as id`,
    [fecha, opts.descripcion ?? 'test suite', JSON.stringify(lineas), opts.predio ?? null, u[0].id],
  )
  return rows[0].id
}

/** Una fecha dentro de un período ABIERTO del ejercicio vigente, o salteo. */
async function fechaAbierta(c: Client): Promise<string> {
  const { rows } = await c.query(
    `select make_date(anio, mes, 15)::text as fecha
       from periodo where estado = 'abierto' order by anio, mes limit 1`,
  )
  if (rows.length === 0) throw new CasoSalteado('no hay ningún período abierto')
  return rows[0].fecha
}

async function predioId(c: Client): Promise<string> {
  const { rows } = await c.query('select id from predio order by codigo limit 1')
  if (rows.length === 0) throw new CasoSalteado('no hay predios')
  return rows[0].id
}

const s = new Suite('Invariantes contables', await conectar())

// ═══ CREAR ═══

await s.caso('asiento balanceado con predio → pasa', async (c) => {
  const id = await crearAsiento(
    c,
    await fechaAbierta(c),
    [
      { cuenta: 'CAJA_EFECTIVO', debe: 1000 },
      { cuenta: 'ING_PARTIDOS', haber: 1000 },
    ],
    { predio: await predioId(c) },
  )
  exigir(!!id, 'crear_asiento no devolvió id')
})

await s.caso('desbalanceado → falla y dice la diferencia', async (c) => {
  await debeFallar(
    () =>
      crearAsiento(c, '2026-09-15', [
        { cuenta: 'CAJA_TRANSFERENCIA', debe: 1000 },
        { cuenta: 'ING_PARTIDOS', haber: 900 },
      ]),
    'no balancea',
    'asiento 1000/900',
  )
})

await s.caso('cuenta inexistente → falla', async (c) => {
  await debeFallar(
    () =>
      crearAsiento(c, '2026-09-15', [
        { cuenta: 'NO_EXISTE', debe: 1000 },
        { cuenta: 'ING_PARTIDOS', haber: 1000 },
      ]),
    'NO_EXISTE',
    'cuenta fantasma',
  )
})

await s.caso('una sola línea → falla', async (c) => {
  await debeFallar(
    () => crearAsiento(c, '2026-09-15', [{ cuenta: 'CAJA_TRANSFERENCIA', debe: 1000 }]),
    '',
    'asiento de una línea',
  )
})

await s.caso('importes negativos → falla', async (c) => {
  await debeFallar(
    () =>
      crearAsiento(c, '2026-09-15', [
        { cuenta: 'CAJA_TRANSFERENCIA', debe: -1000 },
        { cuenta: 'ING_PARTIDOS', haber: -1000 },
      ]),
    '',
    'importe negativo',
  )
})

await s.caso('debe y haber en la misma línea → falla', async (c) => {
  await debeFallar(
    () =>
      crearAsiento(c, '2026-09-15', [
        { cuenta: 'CAJA_TRANSFERENCIA', debe: 1000, haber: 500 },
        { cuenta: 'ING_PARTIDOS', haber: 500 },
      ]),
    '',
    'línea con las dos patas',
  )
})

await s.caso('fecha sin ejercicio → falla (el corte del 1/1 sin ejercicio nuevo)', async (c) => {
  await debeFallar(
    () =>
      crearAsiento(c, '2030-01-01', [
        { cuenta: 'CAJA_TRANSFERENCIA', debe: 100 },
        { cuenta: 'ING_PARTIDOS', haber: 100 },
      ]),
    'ejercicio',
    'fecha 2030 sin ejercicio',
  )
})

await s.caso('efectivo sin predio → falla', async (c) => {
  const fecha = await fechaAbierta(c)
  await debeFallar(
    () =>
      crearAsiento(c, fecha, [
        { cuenta: 'CAJA_EFECTIVO', debe: 500 },
        { cuenta: 'ING_PARTIDOS', haber: 500 },
      ]),
    'predio',
    'efectivo sin predio',
  )
})

await s.caso('transferencia sin predio → pasa', async (c) => {
  const id = await crearAsiento(c, await fechaAbierta(c), [
    { cuenta: 'CAJA_TRANSFERENCIA', debe: 800 },
    { cuenta: 'ING_PARTIDOS', haber: 800 },
  ])
  exigir(!!id, 'no devolvió id')
})

// ═══ ANULAR ═══

await s.caso('anular marca el original e invierte las líneas', async (c) => {
  await claimsDeRol(c, 'admin') // anular_asiento tiene guarda propia

  const fecha = await fechaAbierta(c)
  const id = await crearAsiento(
    c,
    fecha,
    [
      { cuenta: 'CAJA_TRANSFERENCIA', debe: 1234 },
      { cuenta: 'ING_PARTIDOS', haber: 1234 },
    ],
    { descripcion: 'para anular' },
  )
  const { rows: contra } = await c.query(`select anular_asiento($1, 'test', $2::date) as id`, [
    id,
    fecha,
  ])
  const { rows: orig } = await c.query('select anulado_por from asiento where id = $1', [id])
  exigir(orig[0].anulado_por === contra[0].id, 'el original no quedó apuntando al contraasiento')

  const { rows: lineas } = await c.query(
    `select o.cuenta_id, o.debe as od, o.haber as oh, x.debe as xd, x.haber as xh
       from asiento_linea o
       join asiento_linea x on x.asiento_id = $2 and x.cuenta_id = o.cuenta_id
      where o.asiento_id = $1`,
    [id, contra[0].id],
  )
  exigir(lineas.length === 2, 'el contraasiento no replica las cuentas')
  for (const l of lineas) {
    exigir(
      Number(l.od) === Number(l.xh) && Number(l.oh) === Number(l.xd),
      'el contraasiento no invierte debe/haber',
    )
  }
})

await s.caso('anular dos veces → falla', async (c) => {
  await claimsDeRol(c, 'admin') // anular_asiento tiene guarda propia

  const fecha = await fechaAbierta(c)
  const id = await crearAsiento(c, fecha, [
    { cuenta: 'CAJA_TRANSFERENCIA', debe: 10 },
    { cuenta: 'ING_PARTIDOS', haber: 10 },
  ])
  await c.query(`select anular_asiento($1, 'una', $2::date)`, [id, fecha])
  await debeFallar(
    () => c.query(`select anular_asiento($1, 'otra', $2::date)`, [id, fecha]),
    '',
    'doble anulación',
  )
})

await s.caso('anular un contraasiento → falla', async (c) => {
  await claimsDeRol(c, 'admin') // anular_asiento tiene guarda propia

  const fecha = await fechaAbierta(c)
  const id = await crearAsiento(c, fecha, [
    { cuenta: 'CAJA_TRANSFERENCIA', debe: 10 },
    { cuenta: 'ING_PARTIDOS', haber: 10 },
  ])
  const { rows } = await c.query(`select anular_asiento($1, 'test', $2::date) as id`, [id, fecha])
  await debeFallar(
    () => c.query(`select anular_asiento($1, 'no', $2::date)`, [rows[0].id, fecha]),
    '',
    'anular la anulación',
  )
})

// ═══ PERÍODO ═══

await s.caso('período cerrado bloquea el asiento', async (c) => {
  const fecha = await fechaAbierta(c)
  await c.query(
    `update periodo set estado = 'cerrado' where make_date(anio, mes, 15) = $1::date`,
    [fecha],
  )
  await debeFallar(
    () =>
      crearAsiento(c, fecha, [
        { cuenta: 'CAJA_TRANSFERENCIA', debe: 100 },
        { cuenta: 'ING_PARTIDOS', haber: 100 },
      ]),
    'cerrado',
    'asiento en período cerrado',
  )
})

await s.caso('un período cerrado no se reabre', async (c) => {
  const fecha = await fechaAbierta(c)
  await c.query(
    `update periodo set estado = 'cerrado' where make_date(anio, mes, 15) = $1::date`,
    [fecha],
  )
  await debeFallar(
    () =>
      c.query(`update periodo set estado = 'abierto' where make_date(anio, mes, 15) = $1::date`, [
        fecha,
      ]),
    '',
    'reabrir período',
  )
})

// ═══ SALDOS ═══

await s.caso('Debe = Haber en TODO el diario (dato real, no fixture)', async (c) => {
  const { rows } = await c.query(
    'select coalesce(sum(debe), 0) as d, coalesce(sum(haber), 0) as h from asiento_linea',
  )
  exigir(
    Number(rows[0].d) === Number(rows[0].h),
    `el diario real no balancea: debe ${rows[0].d} · haber ${rows[0].h}`,
  )
})

await s.caso('crear + anular deja los saldos como estaban (compensación)', async (c) => {
  await claimsDeRol(c, 'admin') // anular_asiento tiene guarda propia

  const antes = await c.query('select coalesce(sum(saldo), 0) as t from v_saldo_caja')
  const fecha = await fechaAbierta(c)
  const id = await crearAsiento(c, fecha, [
    { cuenta: 'CAJA_TRANSFERENCIA', debe: 5555 },
    { cuenta: 'ING_PARTIDOS', haber: 5555 },
  ])
  await c.query(`select anular_asiento($1, 'compensación', $2::date)`, [id, fecha])
  const despues = await c.query('select coalesce(sum(saldo), 0) as t from v_saldo_caja')
  exigir(
    Number(antes.rows[0].t) === Number(despues.rows[0].t),
    `el saldo se movió: ${antes.rows[0].t} → ${despues.rows[0].t}`,
  )
})

// ═══ IDEMPOTENCIA ═══

for (const fn of ['devengar_sueldos_socios', 'devengar_sponsors'] as const) {
  await s.caso(`${fn} dos veces no duplica`, async (c) => {
    const { rows: per } = await c.query(
      `select id from periodo where estado = 'abierto' order by anio, mes limit 1`,
    )
    if (per.length === 0) throw new CasoSalteado('no hay período abierto')
    const { rows: u } = await c.query('select id from auth.users limit 1')
    if (u.length === 0) throw new CasoSalteado('no hay usuarios')

    const una = await c.query(`select ${fn}($1, $2) as n`, [per[0].id, u[0].id])
    const dos = await c.query(`select ${fn}($1, $2) as n`, [per[0].id, u[0].id])
    exigir(
      Number(dos.rows[0].n) === 0,
      `la segunda corrida devengó ${dos.rows[0].n} (la primera: ${una.rows[0].n})`,
    )
  })
}

// ═══ IMPUTACIÓN ═══

await s.caso('imputar de más que el pago → falla (trg_imputacion_coherente)', async (c) => {
  // Un pago real con imputación: se intenta agregarle una imputación por el
  // TOTAL del pago de nuevo — siempre excede, sin depender de los montos.
  const { rows } = await c.query(
    `select p.id as pago_id, p.monto, pi.cuota_id
       from pago p join pago_imputacion pi on pi.pago_id = p.id
      limit 1`,
  )
  if (rows.length === 0) throw new CasoSalteado('no hay pagos imputados en la base')
  await debeFallar(
    () =>
      c.query(`insert into pago_imputacion (pago_id, cuota_id, monto) values ($1, $2, $3)`, [
        rows[0].pago_id,
        rows[0].cuota_id,
        rows[0].monto,
      ]),
    '',
    'imputación excedida',
  )
})

process.exit(s.cerrar() ? 0 : 1)
