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

/**
 * Dónde se buscan las llamadas por rpc.
 *
 * `app/` sola no alcanzaba: `lib/arca-fecaesolicitar.ts` llama
 * `reservar_numero_comprobante`, `marcar_error_comprobante` y
 * `cerrar_comprobante` por rpc, y ninguna de esas llamadas se veía. Están
 * declaradas, así que hoy no dolía — pero una función nueva llamada sólo desde
 * `lib/` habría quedado fuera del chequeo inverso sin que nadie se enterara.
 *
 * `lib/permisos.ts` queda afuera a propósito: nombra todas las funciones del
 * catálogo, pero **declararlas no es llamarlas**. Incluirlo haría que cualquier
 * función clasificada pareciera tener UI el día que se la mencione.
 */
const DONDE_SE_LLAMA = ['app', 'lib', 'components']
const NO_ES_UNA_LLAMADA = ['lib/permisos.ts']

function nombresEnElFront(dirs = DONDE_SE_LLAMA): Set<string> {
  // Cualquier literal con forma de nombre de función, no sólo `.rpc('x')`:
  // `/presupuesto` llama `.rpc(fn, args)` con el nombre en una variable
  // —`llamar('agregar_linea_presupuesto', …)`— y un patrón atado a `.rpc(` no
  // lo ve. Después se cruza contra las funciones que escriben de verdad, así
  // que un literal que no sea una función no molesta.
  const encontrados = new Set<string>()
  const recorrer = (d: string) => {
    for (const entrada of readdirSync(d)) {
      const ruta = join(d, entrada)
      if (NO_ES_UNA_LLAMADA.includes(ruta)) continue
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else if (/\.tsx?$/.test(ruta)) {
        for (const m of readFileSync(ruta, 'utf8').matchAll(/'([a-z][a-z_]{4,})'/g)) {
          encontrados.add(m[1])
        }
      }
    }
  }
  dirs.forEach(recorrer)
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

// ── El cierre inverso: allowlist positiva ──────────────────────────────────
//
// Hasta acá el script recorría el CATÁLOGO y comprobaba cada entrada contra la
// base. Eso deja pasar el caso que nos costó cuatro síntomas: una función que
// existe en la base y que **nadie declaró** es invisible — no hay entrada que
// recorrer, así que no hay nada que chequear, y el script da verde sobre algo
// que nunca miró. Fue lo que pasó con `clonar_torneo` y `crear_sponsor`.
//
// El chequeo inverso lo da vuelta: se recorre **la base**, y toda función que
// escriba tiene que estar o declarada en el catálogo, o acá abajo con el
// motivo escrito. Lo que no está en ninguna de las dos, ROMPE.
//
// Es allowlist positiva: no se enumera lo prohibido —esa lista se queda vieja
// sola— se enumera lo conocido, y lo desconocido se frena. Una función nueva
// que escriba y que nadie clasifique hace fallar el script, que es exactamente
// lo que tiene que pasar.

/**
 * Plomería: las llama otra función o un trigger, nunca el front.
 *
 * No son puertas — no protegen un invariante propio, lo protege quien las
 * llama— así que no les corresponde una operación en el mapa. Que el front
 * llame a una de éstas ES un error, y por eso más abajo se chequea.
 */
const INTERNAS: Record<string, string> = {
  crear_asiento: 'La puerta del diario. La llaman todas las funciones que asientan, nunca el front',
  periodo_de_fecha: 'Resuelve el período de una fecha; la llama crear_asiento',
  aplicar_anticipo: 'Consume saldo a favor; la llama registrar_cobro dentro de su transacción',
  generar_cuotas_ficha: 'Genera el cronograma de una ficha; la llama crear_equipo_torneo',
  generar_cuotas_instancia: 'Cuotas de una instancia de playoff; la llama crear_playoff',
  generar_cuotas_plan: 'Cuotas desde un plan de pago; la llaman las de alta',
  generar_grilla_liga: 'Arma el fixture; la llama la carga de estructura del torneo',
  sync_cuota_pagada: 'Trigger: deriva pagado_at de las imputaciones',
  sync_cuota_vence_at: 'Trigger: deriva el vencimiento de la cuota',
  sync_total_plan: 'Trigger: mantiene total_plan al día',
}

/**
 * Deprecadas: siguen en la base pero no se llaman desde ningún lado.
 *
 * Se listan igual —no se borran de acá— porque mientras existan en la base
 * alguien las puede llamar, y entonces queremos que el script lo diga.
 */
const DEPRECADAS: Record<string, string> = {
  imputar_pago_automatico:
    'Reemplazada por sugerir_imputacion + imputar_pago: la imputación la confirma el operador (regla 10)',
}

/**
 * 🟡 Puertas de verdad, todavía sin pantalla.
 *
 * Escriben y protegen algo, así que el día que tengan botón necesitan su
 * operación en el mapa. Hoy no la tienen porque no las llama nadie.
 *
 * **Esto no es una excepción permanente y el script no las deja tranquilas:**
 * en cuanto el front nombre a una de éstas, el chequeo de abajo se pone rojo y
 * pide catalogarla. O sea que la lista se paga sola cuando llega la UI, que es
 * el único momento en que se puede decidir bien quién puede tocarla.
 */
const PUERTAS_SIN_UI: Record<string, string> = {
  crear_cat_gasto: 'ABM de categorías de gasto',
  editar_cat_gasto: 'ABM de categorías de gasto',
  desactivar_cat_gasto: 'ABM de categorías de gasto',
  crear_plan_tarifa: 'Alta de un plan de tarifas (hoy sólo se editan los existentes)',
  crear_playoff: 'Alta de instancia de playoff — la puerta existe, la pantalla no',
  crear_gasto_planificado: 'Planificación de gastos',
  marcar_gasto_planificado_ejecutado: 'Planificación de gastos',
  eliminar_dia_cancha: 'Borrar un día de cancha del bar',
  devengar_sponsors: 'Devengo mensual de sponsors (idempotente), sin pantalla que lo dispare',
  crear_contrato_sponsor: 'Alta de contrato de patrocinio',
  cargar_cuotas_sponsor: 'Cronograma de cuotas de un contrato de patrocinio',
  liquidar_efectivo_transito: 'Circuito de efectivo en tránsito entre predios',
  recibir_efectivo_en_transito: 'Circuito de efectivo en tránsito entre predios',
  reponer_efectivo_transito: 'Circuito de efectivo en tránsito entre predios',
}

/** Las tres juntas, para preguntar «¿está clasificada?» de una. */
const CLASIFICADAS: Record<string, string> = {
  ...INTERNAS,
  ...DEPRECADAS,
  ...PUERTAS_SIN_UI,
}

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
  if (archivo) {
    // ── 🔴 El camino de escape, y por qué grita ────────────────────────────
    //
    // Durante meses éste fue el ÚNICO camino, porque `DATABASE_URL` estaba
    // vacía y el modo normal tiraba error. Se corrían las consultas por otro
    // lado y se copiaba el resultado a un archivo — y esa copia derivó: llegó
    // a tener 12 funciones con guarda cuando la base ya tenía 14, y el script
    // daba verde igual porque comparaba contra la copia, no contra la base.
    //
    // El modo sigue existiendo para cuando de verdad no haya conexión. Pero un
    // verde de acá vale lo que valga el archivo, y eso hay que verlo en la
    // salida, no deducirlo de los argumentos.
    console.warn(
      `\n⚠️  MODO --matriz: comparando contra «${archivo}», NO contra la base.\n` +
        `   Lo que diga este verde vale sólo si ese archivo está al día.\n` +
        `   El camino normal es sin --matriz, con DATABASE_URL puesta.\n`,
    )
    return JSON.parse(readFileSync(archivo, 'utf8')) as Filas
  }

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
      // Una operación puede cubrir VARIAS funciones con la misma guarda —el
      // ciclo del torneo son iniciar, cerrar y reabrir—, separadas por «·».
      // Se exige que TODAS tengan guarda y que TODAS nombren los mismos roles:
      // alcanza con que una sea más ancha para que la operación lo sea.
      const fns_ = (donde.guarda as string).split('·').map((f) => f.trim())
      const fn = fns_.join(' · ')
      fns_.forEach((f) => declaradas.add(f))
      const src = fns_.map((f) => fuentes.get(f) ?? '').join('\n')
      const sinGuarda = fns_.filter((f) => {
        const t = fuentes.get(f)
        return !t || [...t.matchAll(RE_ROL)].length === 0
      })

      // Ya no alcanza con «¿está la guarda?»: desde que hay más de un rol
      // habilitado, hay que leer CUÁLES nombra y compararlos con el mapa. Si
      // alguien le suma un rol a la guarda y no al mapa, el front escondería un
      // botón que la base permite —y al revés, ofrecería uno que va a fallar.
      const enLaGuarda = [
        ...new Set(
          [...(src ?? '').matchAll(RE_ROL)].map((m) => m[1]),
        ),
      ].sort()

      const tiene = sinGuarda.length === 0 && enLaGuarda.length > 0
      const coinciden = tiene && igual(esperado, enLaGuarda)
      const ok = tiene && coinciden

      if (!tiene) {
        problemas.push(
          `🔴 ${op}: ${sinGuarda.length ? `«${sinGuarda.join('», «')}» no tiene` : 'no hay'} guarda de rol en su cuerpo`,
        )
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
    //
    // Se busca el ARCHIVO que declara esa acción y se exige que ÉL llame a
    // `exigirRol`. Antes era una lista de rutas escrita a mano, unidas y
    // buscando `exigirRol` una sola vez en el texto concatenado: con eso, un
    // archivo que sí la tenía hacía pasar a todas las operaciones, incluida una
    // acción nueva sin ninguna guarda. Y la lista se quedó vieja apenas un
    // archivo cambió de nombre.
    // Una operación puede cubrir MÁS DE UNA acción —`usuario.gestionar` son
    // `cambiarRol` e `invitar`—, y en el mapa se escriben separadas por «·».
    // Se exige que TODAS existan y que TODAS tengan guarda: alcanza con que una
    // no la tenga para que la operación esté abierta por ahí.
    const nombresAccion = (donde.accion as string).split('·').map((n) => n.trim())
    const archivos: string[] = []
    const buscar = (d: string) => {
      for (const entrada of readdirSync(d)) {
        const ruta = join(d, entrada)
        if (statSync(ruta).isDirectory()) buscar(ruta)
        else if (/\.tsx?$/.test(ruta)) archivos.push(ruta)
      }
    }
    buscar('app')

    let ok = true
    for (const nombre of nombresAccion) {
      const declaran = archivos.filter((f) => {
        const t = readFileSync(f, 'utf8')
        return t.includes("'use server'") && new RegExp(`function ${nombre}\\b`).test(t)
      })

      if (declaran.length === 0) {
        problemas.push(`🔴 ${op}: no encontré la Server Action «${nombre}» en app/`)
        ok = false
      } else if (!declaran.every((f) => readFileSync(f, 'utf8').includes('exigirRol'))) {
        problemas.push(`🔴 ${op}: «${nombre}» no llama a exigirRol — nada la protege`)
        ok = false
      }
    }
    lineas.push(`${ok ? '✅' : '🔴'} ${op.padEnd(22)} [${esperado.join(' · ')}]   ← exigirRol en la acción`)
  }

  console.log(lineas.sort().join('\n'))
  console.log()

  // ── El cierre inverso: de la BASE hacia el mapa ──────────────────────────
  //
  // Los chequeos de arriba recorren el catálogo. Éstos recorren la base, que es
  // lo único que ve una función que nadie declaró.
  const llamadasDelFront = nombresEnElFront()

  // ── 1. Toda función con guarda tiene que estar en el catálogo ────────────
  //
  // Una guarda es la marca de que la función decide por rol adentro suyo: es
  // una puerta, por definición. Si ninguna operación la nombra, hay un permiso
  // en la base que el front no sabe leer — y nadie lo está verificando.
  //
  // No admite allowlist. Una función con guarda que no le corresponda a ninguna
  // operación es una contradicción: la guarda existe justamente porque alguien
  // decidió quién puede.
  const guardasSinCatalogar = [...fuentes.keys()].filter((f) => !declaradas.has(f)).sort()
  for (const f of guardasSinCatalogar) {
    const roles = [...new Set([...(fuentes.get(f) ?? '').matchAll(RE_ROL)].map((m) => m[1]))].sort()
    problemas.push(
      `🔴 «${f}» tiene guarda de rol [${roles.join(', ')}] en la base y NINGUNA operación la declara` +
        `\n     Agregala a lib/permisos.ts con donde: { guarda: '${f}' }`,
    )
  }

  // ── 2. Toda función que escribe: declarada o clasificada ─────────────────
  const escribenSinClasificar = [...matriz.keys()]
    .filter((f) => !declaradas.has(f))
    .filter((f) => !(f in CLASIFICADAS))
    .sort()
  for (const f of escribenSinClasificar) {
    problemas.push(
      `🔴 «${f}» escribe [${matriz.get(f)?.escribe.join(' ')}] y no está ni declarada ni clasificada` +
        `\n     O le corresponde una operación en lib/permisos.ts, o va a INTERNAS / DEPRECADAS / PUERTAS_SIN_UI con el motivo`,
    )
  }

  // ── 3. Una función clasificada que el front llama, ya no está exenta ─────
  //
  // Acá es donde PUERTAS_SIN_UI se paga sola: la excusa era «no la llama
  // nadie», así que en cuanto alguien le pone un botón, se cae.
  for (const f of [...llamadasDelFront].filter((f) => f in CLASIFICADAS).sort()) {
    const donde = f in PUERTAS_SIN_UI ? 'PUERTAS_SIN_UI' : f in INTERNAS ? 'INTERNAS' : 'DEPRECADAS'
    problemas.push(
      f in PUERTAS_SIN_UI
        ? `🔴 «${f}» ya tiene UI: el front la llama. Sacala de PUERTAS_SIN_UI y dale su operación en lib/permisos.ts`
        : `🔴 «${f}» está en ${donde} —${CLASIFICADAS[f]}— y sin embargo el front la llama`,
    )
  }

  // ── 4. Una lista que nombra algo que ya no existe se quedó vieja ─────────
  for (const f of Object.keys(CLASIFICADAS).filter((f) => !matriz.has(f)).sort()) {
    problemas.push(
      `🔴 «${f}» está clasificada pero la base no la tiene escribiendo nada — la lista quedó vieja, sacala`,
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
  console.log(
    `✅ cierre inverso: ${fuentes.size} funciones con guarda, todas catalogadas · ` +
      `${matriz.size} funciones que escriben, todas declaradas o clasificadas ` +
      `(${Object.keys(INTERNAS).length} internas · ${Object.keys(DEPRECADAS).length} deprecada · ` +
      `${Object.keys(PUERTAS_SIN_UI).length} puertas sin UI) · ` +
      `escaneado ${DONDE_SE_LLAMA.join('/')}.`,
  )
  if (argumento('--matriz')) {
    console.log(
      `\n⚠️  Recordá: esto se comparó contra un archivo, no contra la base.`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
