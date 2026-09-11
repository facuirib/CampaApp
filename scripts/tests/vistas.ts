/**
 * Capa 3 · Smoke de vistas.
 *
 *   npm run test:vistas
 *
 * Dos garantías baratas que hoy no daba nadie:
 *
 *   1. **Ninguna vista rota.** `select * limit 1` de cada `v_*` de la base.
 *      Una vista puede quedar inválida tras una migración (columna renombrada
 *      abajo, join que ya no tipa) y no se entera nadie hasta que una pantalla
 *      explota. Acá explota el test.
 *
 *   2. **`database.types.ts` no miente.** Con `gen types` caído, las vistas
 *      nuevas se parchean a mano en los tipos — y una vista que está en la
 *      base pero no en los tipos (o al revés, o con otras columnas) es una
 *      pantalla que compila contra una forma que no existe. Se comparan ambos
 *      lados, columna por columna.
 *
 * Solo lectura; no necesita transacción.
 */

import { readFileSync } from 'node:fs'
import { conectar } from './comun.ts'

const client = await conectar()

// ── Lado base: vistas y columnas reales ────────────────────────────────────

const { rows: vistasDb } = await client.query<{ vista: string; columnas: string[] }>(
  `select table_name as vista,
          array_agg(column_name::text order by column_name) as columnas
     from information_schema.columns
    where table_schema = 'public'
      and table_name in (select table_name from information_schema.views
                          where table_schema = 'public')
    group by table_name
    order by table_name`,
)

// ── Lado tipos: parsear los bloques Views de database.types.ts ────────────
//
// El parseo es por forma, no por AST: cada vista es `nombre: { Row: {...} }`
// dentro del bloque `Views:`. Alcanza porque el archivo lo genera una
// herramienta (o un parche a mano que imita su forma) — no es TS libre.

const tipos = readFileSync('lib/db/database.types.ts', 'utf8')
// El archivo trae más de un schema (graphql_public primero, con Views vacío):
// hay que pararse en `public: {` ANTES de buscar su bloque Views.
const desdePublic = tipos.indexOf('\n  public: {')
const bloqueViews = tipos.slice(
  tipos.indexOf('    Views: {', desdePublic),
  tipos.indexOf('    Functions: {', desdePublic),
)

const vistasTipos = new Map<string, Set<string>>()
const reVista = /^      (\w+): \{$/gm
let m: RegExpExecArray | null
while ((m = reVista.exec(bloqueViews)) !== null) {
  const nombre = m[1]
  const desdeRow = bloqueViews.indexOf('Row: {', m.index)
  const finRow = bloqueViews.indexOf('}', desdeRow)
  const cuerpoRow = bloqueViews.slice(desdeRow, finRow)
  const columnas = new Set(
    [...cuerpoRow.matchAll(/^\s+(\w+)\??:/gm)].map((c) => c[1]).filter((c) => c !== 'Row'),
  )
  vistasTipos.set(nombre, columnas)
}

// ── Comparación y smoke ────────────────────────────────────────────────────

let fallas = 0
const nombresDb = new Set(vistasDb.map((v) => v.vista))

for (const v of vistasDb) {
  // 1 · La vista responde.
  try {
    await client.query(`select * from "${v.vista}" limit 1`)
  } catch (e) {
    fallas++
    console.log(`  ❌ ${v.vista} — la vista no responde: ${(e as Error).message.split('\n')[0]}`)
    continue
  }

  // 2 · Está en los tipos, con las mismas columnas.
  const enTipos = vistasTipos.get(v.vista)
  if (!enTipos) {
    fallas++
    console.log(`  ❌ ${v.vista} — está en la base y FALTA en database.types.ts`)
    continue
  }
  const soloDb = v.columnas.filter((c) => !enTipos.has(c))
  const soloTipos = [...enTipos].filter((c) => !v.columnas.includes(c))
  if (soloDb.length || soloTipos.length) {
    fallas++
    const partes = []
    if (soloDb.length) partes.push(`en la base y no en tipos: ${soloDb.join(', ')}`)
    if (soloTipos.length) partes.push(`en tipos y no en la base: ${soloTipos.join(', ')}`)
    console.log(`  ❌ ${v.vista} — columnas desincronizadas (${partes.join(' · ')})`)
  }
}

// 3 · El otro sentido: tipos que declaran vistas que la base no tiene.
for (const nombre of vistasTipos.keys()) {
  if (!nombresDb.has(nombre)) {
    fallas++
    console.log(`  ❌ ${nombre} — está en database.types.ts y NO en la base`)
  }
}

const total = vistasDb.length
console.log(
  `\n${fallas ? '❌' : '✅'} Smoke de vistas: ${total} vistas consultadas · ${vistasTipos.size} en tipos · ${fallas ? `${fallas} FALLAS` : 'cero fallas'}\n`,
)
await client.end()
process.exit(fallas ? 1 : 0)
