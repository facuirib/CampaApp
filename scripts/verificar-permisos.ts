/**
 * Verifica que `lib/permisos.ts` diga lo mismo que la base.
 *
 *   npm run verificar:permisos                    (usa DATABASE_URL)
 *   npm run verificar:permisos -- --sql            (imprime las consultas)
 *   npm run verificar:permisos -- --matriz x.json  (sin acceso directo a la base)
 *
 * El modo `--matriz` existe porque no siempre hay conexión directa: el editor
 * SQL de Supabase y el MCP alcanzan la base, `psql` puede no estar. Se corren
 * las tres consultas de `--sql`, se guardan sus resultados en un JSON
 * —{ matriz, porTabla, guardas }— y el script compara igual. La derivación es
 * la misma; lo único que cambia es de dónde salen las filas.
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 *
 * El front tiene que decidir qué botón dibuja ANTES de dibujarlo, y RLS no
 * contesta «¿puedo?»: contesta denegando, y en UPDATE y DELETE lo hace en
 * silencio. Así que el permiso está escrito de los dos lados —policies acá,
 * mapa allá— y dos copias se desincronizan en la primera migración.
 *
 * Este script cierra eso: deriva la matriz REAL desde `pg_policies` y la
 * compara con el mapa. No hay que mantenerlo cuando Horacio agrega una
 * función: la derivación sale del catálogo, no de una lista.
 *
 * ── Lo que deriva, y por qué es transitivo ─────────────────────────────────
 *
 * El permiso de una función no son las tablas que su cuerpo nombra: son las
 * que termina escribiendo, incluidas las de las funciones que llama.
 * `registrar_cobro` no escribe `periodo` en su texto —lo escribe
 * `crear_asiento`, que llama a `periodo_de_fecha`— y sin embargo un rol sin
 * `periodo.INSERT` no puede cobrar. Por eso el grafo de llamadas se recorre
 * entero y el permiso es la INTERSECCIÓN: quien no puede en una de las tablas,
 * no puede la operación.
 *
 * ── Lo que NO puede derivar, y qué hace en su lugar ────────────────────────
 *
 * · `guarda` — la restricción vive adentro del plpgsql porque la función se
 *   comparte con operaciones que otros roles sí pueden. Se busca en `prosrc`.
 * · `accion` — corre con `service_role` o manda un mail: no hay policy que
 *   consultar. Se verifica que la Server Action tenga su `exigirRol`.
 *
 * Y al final, el chequeo inverso: **toda función que el front llama por rpc
 * tiene que estar declarada en el mapa.** Es lo que hace que un botón nuevo
 * sin permiso declarado rompa el script en vez de pasar desapercibido.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { PERMISOS } from '../lib/permisos.ts'
import { ROLES } from '../lib/roles.ts'

// ── Conexión ───────────────────────────────────────────────────────────────

function urlDeLaBase(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = readFileSync('.env.local', 'utf8')
  const linea = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  const url = linea?.slice('DATABASE_URL='.length).trim()
  return url ? url : null
}

const argumento = (nombre: string) => {
  const i = process.argv.indexOf(nombre)
  return i === -1 ? null : (process.argv[i + 1] ?? '')
}

// ── Los roles que se buscan ───────────────────────────────────────────────
//
// La alternancia sale de ROLES, que es donde los roles ya estaban declarados.
// Antes era una lista escrita a mano en tres lugares, y el 5º rol la rompió:
// el commit que agregó `finanzas` actualizó la de las guardas y no las dos de
// las policies, así que la extracción dejaba `finanzas` afuera. Las policies
// decían una cosa, el verificador leía otra, y 21 de 38 operaciones daban un
// rojo que no existía.
//
// Falló del lado seguro —rojos de más, nunca verdes de más— pero eso no lo
// vuelve inofensivo: un verificador que grita sin motivo se empieza a ignorar,
// y el día que el rojo sea de verdad ya nadie lo mira. Y el rojo puede
// aparecer al revés: si un rol futuro se le agrega a una policy y no al mapa,
// la extracción sin ese rol lo pasaría por alto.
//
// Derivarla de ROLES cierra las dos puertas: no hay lista que mantener, así
// que el próximo rol entra solo. La lista era el bug, no su contenido.
const PATRON_ROL = ROLES.join('|')

/** Para las policies: string dentro de un literal SQL (comillas dobladas). */
const PATRON_ROL_SQL = `'''(${PATRON_ROL})'''`

/** Para las guardas: se lee `prosrc` desde JS. */
const RE_ROL = new RegExp(`'(${PATRON_ROL})'`, 'g')

// ── La derivación ──────────────────────────────────────────────────────────

const SQL_MATRIZ = `
with recursive
fn as (
  select p.proname, p.prosrc from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.prokind = 'f'
),
pol as (
  select tablename, cmd,
    (select array_agg(distinct r order by r)
       from regexp_matches(coalesce(qual, with_check), ${PATRON_ROL_SQL}, 'g') m(a),
            lateral unnest(m.a) r) as roles
  from pg_policies where schemaname = 'public' and cmd <> 'SELECT'
),
-- Escrituras directas, por comando: 'periodo' y 'dia_cancha' tienen roles
-- distintos según el comando, así que la tabla sola no alcanza.
escribe as (
  select f.proname, p.tablename, p.cmd
  from fn f join pol p on
    case p.cmd
      when 'INSERT' then f.prosrc ~* ('insert\\s+into\\s+' || p.tablename || '\\M')
      when 'UPDATE' then f.prosrc ~* ('update\\s+' || p.tablename || '\\M')
      when 'DELETE' then f.prosrc ~* ('delete\\s+from\\s+' || p.tablename || '\\M')
    end
),
llama as (
  select f.proname as caller, g.proname as callee
  from fn f join fn g on f.proname <> g.proname
   and f.prosrc ~ ('\\m' || g.proname || '\\s*\\(')
),
alcance(entrada, actual) as (
  select proname, proname from fn
  union
  select a.entrada, l.callee from alcance a join llama l on l.caller = a.actual
),
efecto as (
  select distinct a.entrada, e.tablename, e.cmd
  from alcance a join escribe e on e.proname = a.actual
)
select e.entrada as fn,
       json_agg(distinct (e.tablename || '.' || e.cmd)) as escribe,
       (select coalesce(json_agg(r order by r), '[]'::json) from (
          select unnest(p.roles) r
          from efecto e2 join pol p on p.tablename = e2.tablename and p.cmd = e2.cmd
          where e2.entrada = e.entrada
          group by 1
          having count(*) = (select count(*) from efecto e3 where e3.entrada = e.entrada)
        ) s) as roles
from efecto e group by e.entrada;
`

const SQL_POLICY_TABLA = `
select tablename, cmd,
  (select coalesce(json_agg(distinct r order by r), '[]'::json)
     from regexp_matches(coalesce(qual, with_check), ${PATRON_ROL_SQL}, 'g') m(a),
          lateral unnest(m.a) r) as roles,
  coalesce(qual, with_check) as expr
from pg_policies where schemaname = 'public' and cmd <> 'SELECT';
`

const SQL_GUARDAS_BASE = `
select p.proname,
       (select string_agg(l, chr(10)) from regexp_split_to_table(p.prosrc, chr(10)) l
         where l ~ 'auth_rol\\(\\)') as prosrc
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prosrc ~ 'auth_rol\\(\\)'
`

const SQL_GUARDAS = SQL_GUARDAS_BASE + ';'

/** Las tres en una sola celda, para el modo `--matriz`. */
const SQL_JSON = `
select json_build_object(
  'matriz',   (select coalesce(json_agg(t), '[]'::json) from (${SQL_MATRIZ.replace(/;\s*$/, '')}) t),
  'porTabla', (select coalesce(json_agg(t), '[]'::json) from (${SQL_POLICY_TABLA.replace(/;\s*$/, '')}) t),
  'guardas',  (select coalesce(json_agg(t), '[]'::json) from (${SQL_GUARDAS_BASE}) t)
) as filas;
`

// ── Los rpc que el front llama de verdad ───────────────────────────────────

function nombresEnElFront(dir = 'app'): Set<string> {
  // Cualquier literal con forma de nombre de función, no sólo `.rpc('x')`:
  // `/presupuesto` llama `.rpc(fn, args)` con el nombre en una variable
  // —`llamar('agregar_linea_presupuesto', …)`— y un patrón atado a `.rpc(` no
  // lo ve. Después se cruza contra las funciones que escriben de verdad, así
  // que un literal que no sea una función no molesta.
  const encontrados = new Set<string>()
  const recorrer = (d: string) => {
    for (const entrada of readdirSync(d)) {
      const ruta = join(d, entrada)
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else if (/\.tsx?$/.test(ruta)) {
        for (const m of readFileSync(ruta, 'utf8').matchAll(/'([a-z][a-z_]{4,})'/g)) {
          encontrados.add(m[1])
        }
      }
    }
  }
  recorrer(dir)
  return encontrados
}

/** Las de sólo lectura: se llaman por rpc pero no escriben nada. */
const RPC_DE_LECTURA = new Set([
  'proponer_amortizaciones',
  'preview_gasto',
  'preview_pago_gasto',
  'saldo_bar_predio',
  'email_usuario',
  'sugerir_imputacion',
])

// ── Comparar ───────────────────────────────────────────────────────────────

const igual = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i])

interface Filas {
  matriz: { fn: string; escribe: string[]; roles: string[] }[]
  porTabla: { tablename: string; cmd: string; roles: string[]; expr?: string }[]
  guardas: { proname: string; prosrc: string }[]
}

async function traerFilas(): Promise<Filas> {
  const archivo = argumento('--matriz')
  if (archivo) return JSON.parse(readFileSync(archivo, 'utf8')) as Filas

  const url = urlDeLaBase()
  if (!url) {
    throw new Error(
      'Falta DATABASE_URL (entorno o .env.local). Si no tenés conexión directa, ' +
        'corré las consultas de `--sql` y pasá el resultado con `--matriz archivo.json`.',
    )
  }

  const cliente = new Client({ connectionString: url })
  await cliente.connect()
  const filas: Filas = {
    matriz: (await cliente.query(SQL_MATRIZ)).rows,
    porTabla: (await cliente.query(SQL_POLICY_TABLA)).rows,
    guardas: (await cliente.query(SQL_GUARDAS)).rows,
  }
  await cliente.end()
  return filas
}

async function main() {
  if (process.argv.includes('--sql')) {
    // Una sola consulta: devuelve una celda con las tres partes, que es lo que
    // espera `--matriz`. Copiar el resultado a un archivo y pasarlo.
    console.log(SQL_JSON)
    return
  }

  const filas = await traerFilas()

  const matriz = new Map<string, { escribe: string[]; roles: string[] }>()
  for (const f of filas.matriz) matriz.set(f.fn, { escribe: f.escribe, roles: f.roles })
  const porTabla = new Map<string, string[]>()
  const exprDe = new Map<string, string>()
  for (const p of filas.porTabla) {
    const clave = `${p.tablename}.${p.cmd}`
    // Varias policies sobre la misma tabla+cmd: los roles se unen y las
    // expresiones se concatenan, que es como se comportan de verdad (basta que
    // UNA deje pasar).
    porTabla.set(clave, [...new Set([...(porTabla.get(clave) ?? []), ...p.roles])])
    exprDe.set(clave, (exprDe.get(clave) ?? '') + ' ' + (p.expr ?? ''))
  }
  const fuentes = new Map<string, string>()
  for (const g of filas.guardas) fuentes.set(g.proname, g.prosrc)

  const problemas: string[] = []
  const lineas: string[] = []
  const declaradas = new Set<string>()

  for (const [op, def] of Object.entries(PERMISOS)) {
    const esperado = [...def.roles].sort()
    const donde = def.donde as Record<string, unknown>

    if ('fns' in donde) {
      const fns = donde.fns as string[]
      fns.forEach((f) => declaradas.add(f))

      // El permiso de la operación es lo que pueden TODAS sus funciones: si el
      // botón dispara tres y una es más restrictiva, el botón vale la más dura.
      let real: string[] | null = null
      for (const f of fns) {
        const m = matriz.get(f)
        if (!m) {
          problemas.push(`🔴 ${op}: la función «${f}» no existe en la base`)
          continue
        }
        real = real === null ? m.roles : real.filter((r) => m.roles.includes(r))
      }
      if (real === null) continue
      const ok = igual(esperado, real)
      if (!ok) {
        problemas.push(
          `🔴 ${op}: el mapa dice [${esperado.join(', ')}] y la base permite [${real.join(', ')}]` +
            `\n     ${fns.map((f) => `${f} → ${matriz.get(f)?.escribe.join(' ')}`).join('\n     ')}`,
        )
      }
      lineas.push(`${ok ? '✅' : '🔴'} ${op.padEnd(22)} [${real.join(' · ')}]   ← ${fns.length} fn`)
      continue
    }

    if ('tabla' in donde) {
      const clave = `${donde.tabla}.${donde.cmd}`
      const real = porTabla.get(clave)
      if (!real) {
        problemas.push(`🔴 ${op}: no hay policy ${clave} — el front escribiría contra RLS cerrado`)
        continue
      }

      const soloSi = 'soloSi' in donde ? (donde.soloSi as string) : null

      if (soloSi) {
        // La policy discrimina por columna, así que los roles declarados son un
        // SUBCONJUNTO de los que la policy nombra. Se chequean las dos mitades:
        // que no se declare un rol que la policy no permite, y que el predicado
        // que hace la distinción siga escrito.
        const dentro = esperado.every((r) => real.includes(r))
        const conPredicado = (exprDe.get(clave) ?? '').replace(/\s+/g, ' ').includes(soloSi)
        const ok = dentro && conPredicado
        if (!dentro) {
          problemas.push(`🔴 ${op}: declara [${esperado.join(', ')}] y ${clave} sólo permite [${real.join(', ')}]`)
        }
        if (!conPredicado) {
          problemas.push(
            `🔴 ${op}: la policy ${clave} ya no dice «${soloSi}» — sin ese predicado el permiso quedó más ancho de lo que el mapa declara`,
          )
        }
        lineas.push(
          `${ok ? '✅' : '🔴'} ${op.padEnd(22)} [${esperado.join(' · ')}]   ← ${clave} · soloSi «${soloSi}»`,
        )
        continue
      }

      const ok = igual(esperado, real)
      if (!ok) problemas.push(`🔴 ${op}: mapa [${esperado.join(', ')}] vs ${clave} [${real.join(', ')}]`)
      lineas.push(`${ok ? '✅' : '🔴'} ${op.padEnd(22)} [${real.join(' · ')}]   ← ${clave}`)
      continue
    }

    if ('guarda' in donde) {
      const fn = donde.guarda as string
      declaradas.add(fn)
      const src = fuentes.get(fn)

      // Ya no alcanza con «¿está la guarda?»: desde que hay más de un rol
      // habilitado, hay que leer CUÁLES nombra y compararlos con el mapa. Si
      // alguien le suma un rol a la guarda y no al mapa, el front escondería un
      // botón que la base permite —y al revés, ofrecería uno que va a fallar.
      const enLaGuarda = [
        ...new Set(
          [...(src ?? '').matchAll(RE_ROL)].map((m) => m[1]),
        ),
      ].sort()

      const tiene = !!src && enLaGuarda.length > 0
      const coinciden = tiene && igual(esperado, enLaGuarda)
      const ok = tiene && coinciden

      if (!tiene) {
        problemas.push(`🔴 ${op}: «${fn}» no tiene ninguna guarda de rol en su cuerpo`)
      } else if (!coinciden) {
        problemas.push(
          `🔴 ${op}: el mapa dice [${esperado.join(', ')}] y la guarda de «${fn}» nombra [${enLaGuarda.join(', ')}]`,
        )
      }
      lineas.push(
        `${ok ? '✅' : '🔴'} ${op.padEnd(22)} [${enLaGuarda.join(' · ')}]   ← guarda en ${fn}()`,
      )
      continue
    }

    // `accion`: no hay base del otro lado. Se chequea que el código tenga el if.
    const conExigirRol = ['app/configuracion/usuarios/acciones.ts', 'app/reclamos/acciones.ts']
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
    const ok = conExigirRol.includes('exigirRol')
    if (!ok) problemas.push(`🔴 ${op}: la Server Action no llama a exigirRol — nada la protege`)
    lineas.push(`${ok ? '✅' : '🔴'} ${op.padEnd(22)} [${esperado.join(' · ')}]   ← exigirRol en la acción`)
  }

  // ── El chequeo inverso ───────────────────────────────────────────────────
  const sinDeclarar = [...nombresEnElFront()]
    .filter((f) => !RPC_DE_LECTURA.has(f))
    .filter((f) => !declaradas.has(f))
    .filter((f) => matriz.has(f)) // si no escribe nada, no necesita permiso

  console.log(lineas.sort().join('\n'))
  console.log()

  if (sinDeclarar.length) {
    problemas.push(
      `🔴 el front llama por rpc a funciones que escriben y no están en el mapa: ${sinDeclarar.join(', ')}`,
    )
  }

  if (problemas.length) {
    console.log(problemas.join('\n'))
    console.log(`\n🔴 ${problemas.length} desacuerdo(s) entre el mapa y la base.`)
    process.exit(1)
  }

  console.log(
    `✅ coherente: ${Object.keys(PERMISOS).length} operaciones · ` +
      `${declaradas.size} funciones declaradas · ` +
      `${nombresEnElFront().size} literales del front cruzados contra el catálogo · ` +
      `cero desacuerdos.`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
