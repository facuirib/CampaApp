/**
 * Infraestructura común de la suite de tests.
 *
 * ── El contrato de TODA la suite ───────────────────────────────────────────
 *
 * **Cada caso corre en su propia transacción y SIEMPRE se revierte.** No hay
 * limpieza porque no hay nada que limpiar: la base queda exactamente como
 * estaba, pase o falle el caso. Es el mismo patrón «probado en transacción
 * revertida» que este proyecto ya usaba a mano (ver docs/coordinacion.md) —
 * esto sólo lo vuelve repetible.
 *
 * Consecuencia deliberada: la suite corre contra la base hosted SIN riesgo,
 * y NO aplica DDL jamás (regla 11 intacta). Un caso que necesite un dato que
 * la base no tiene (un socio activo, un pago con saldo) se SALTEA y lo dice,
 * en vez de fingir verde o romper en rojo por el entorno.
 *
 * ── Suplantar roles (capa de permisos) ─────────────────────────────────────
 *
 * `auth_rol()` lee `request.jwt.claims -> app_metadata ->> rol`, así que en
 * conexión directa alcanza con `set local role authenticated` + `set_config`
 * de los claims: las policies y las guardas ven exactamente lo que verían con
 * un JWT real de ese rol. `comoRol()` lo empaqueta.
 */

import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import type { Rol } from '../../lib/roles.ts'

export function leerDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const env = readFileSync('.env.local', 'utf8')
    const linea = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
    const url = linea?.slice('DATABASE_URL='.length).trim()
    if (url) return url
  } catch {
    /* cae al error de abajo */
  }
  throw new Error('Falta DATABASE_URL (entorno o .env.local).')
}

export interface Resumen {
  pasaron: number
  fallaron: number
  salteados: number
}

/** Un error de caso que ya viene explicado; no hace falta stack. */
export class FalloDeCaso extends Error {}
/** El caso no puede correr en este entorno (falta el dato); no es un fallo. */
export class CasoSalteado extends Error {}

export class Suite {
  private resumen: Resumen = { pasaron: 0, fallaron: 0, salteados: 0 }
  private nombre: string
  private client: Client

  constructor(nombre: string, client: Client) {
    this.nombre = nombre
    this.client = client
  }

  /**
   * Un caso: transacción propia, revertida SIEMPRE — también cuando pasa.
   * `fn` recibe el client ya adentro de la transacción.
   */
  async caso(titulo: string, fn: (c: Client) => Promise<void>): Promise<void> {
    await this.client.query('begin')
    try {
      await fn(this.client)
      this.resumen.pasaron++
      console.log(`  ✅ ${titulo}`)
    } catch (e) {
      if (e instanceof CasoSalteado) {
        this.resumen.salteados++
        console.log(`  ⏭️  ${titulo} — salteado: ${e.message}`)
      } else {
        this.resumen.fallaron++
        const msj = e instanceof Error ? e.message : String(e)
        console.log(`  ❌ ${titulo}\n     ${msj.split('\n')[0]}`)
      }
    } finally {
      // El rollback no puede fallar por un caso roto: si la transacción quedó
      // abortada, igual la cierra.
      await this.client.query('rollback')
    }
  }

  /** Cierra la suite: imprime el resumen y devuelve si quedó en verde. */
  cerrar(): boolean {
    const { pasaron, fallaron, salteados } = this.resumen
    const partes = [`${pasaron} pasaron`]
    if (salteados) partes.push(`${salteados} salteados`)
    if (fallaron) partes.push(`${fallaron} FALLARON`)
    console.log(`\n${fallaron ? '❌' : '✅'} ${this.nombre}: ${partes.join(' · ')}\n`)
    return fallaron === 0
  }
}

/** Espera que `fn` levante un error cuyo mensaje contenga `fragmento`. */
export async function debeFallar(
  fn: () => Promise<unknown>,
  fragmento: string,
  contexto: string,
): Promise<void> {
  try {
    await fn()
  } catch (e) {
    const msj = e instanceof Error ? e.message : String(e)
    if (!msj.toLowerCase().includes(fragmento.toLowerCase())) {
      throw new FalloDeCaso(
        `${contexto}: falló, pero por otro motivo.\n     Esperaba «${fragmento}», llegó: ${msj.split('\n')[0]}`,
      )
    }
    return
  }
  throw new FalloDeCaso(`${contexto}: debía fallar y PASÓ.`)
}

export function exigir(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new FalloDeCaso(mensaje)
}

/**
 * Sólo los claims, sin cambiar el rol de Postgres: las GUARDAS de las
 * funciones (`auth_rol()`) ven el rol pedido, pero la conexión sigue siendo
 * `postgres` y RLS no aplica. Es lo que quieren los tests DEL MOTOR: probar
 * la mecánica contable sin que una policy se meta en el medio.
 */
export async function claimsDeRol(c: Client, rol: Rol): Promise<void> {
  const { rows } = await c.query('select id from auth.users limit 1')
  if (rows.length === 0) throw new CasoSalteado('no hay usuarios en auth.users')
  const claims = { sub: rows[0].id, role: 'authenticated', app_metadata: { rol } }
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)])
}

/**
 * Dentro de una transacción ya abierta: de acá en más, la conexión ve la base
 * como la vería un usuario logueado con ese rol — claims Y rol `authenticated`
 * de Postgres, o sea guardas y RLS a la vez. Es lo que quieren los tests de
 * PERMISOS. `sub` sale de un usuario real para que los
 * `created_by → auth.users` no rechacen por FK.
 */
export async function comoRol(c: Client, rol: Rol): Promise<void> {
  await claimsDeRol(c, rol)
  await c.query('set local role authenticated')
}

export async function conectar(): Promise<Client> {
  const client = new Client({ connectionString: leerDatabaseUrl() })
  await client.connect()
  return client
}
