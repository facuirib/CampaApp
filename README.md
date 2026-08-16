# Campa

Sistema de gestión financiera para un torneo de fútbol amateur en Córdoba.

Reemplaza cinco planillas de Excel por una fuente única de datos: previsión de
caja, cobranza y resultado.

## Arranque

```bash
cp .env.example .env.local   # completar con las credenciales de Supabase
npm install
npm run dev
```

La base **ya existe** y es compartida por los dos desarrolladores. El día a día
se trabaja contra ella: el CLI de Supabase se usa linkeado al proyecto hosted,
para regenerar tipos y aplicar migraciones.

```bash
npx supabase gen types typescript --project-id <ref> --schema public > lib/db/database.types.ts
```

> ⚠ **Aplicar una migración se avisa y se confirma antes** — por CLI, por MCP o
> desde el panel. La base es compartida. Es la regla 11 de `CLAUDE.md`.

### Levantar una base desde cero

`supabase/migrations/` reconstruye la base entera. Con Docker corriendo:

```bash
npx supabase start      # levanta Postgres, API, Studio y aplica las migraciones
npx supabase db reset   # rehace desde cero: migraciones + seed.sql
```

Queda con el plan de cuentas completo (28 cuentas), predios, cajas, catálogo de
gastos, formatos, plantillas de mail y el ejercicio 2026 — todo eso lo siembra
`20260816162556_siembra_estructura.sql`, generada leyendo la base.

**La estructura va en migraciones; `seed.sql` es sólo datos de prueba** (un
torneo `DEMO ·` con su tarifario, para que las pantallas no estén vacías). Si
algo que el sistema necesita para arrancar termina en el seed, la base deja de
reconstruirse y **la falla es silenciosa**: aplicar no da error, rompe después
en el primer `crear_asiento`. Ya pasó una vez — el caso está en
`docs/decisiones.md` § Correcciones posteriores.

> ⚠ **`supabase db push` contra la base compartida todavía no.** Once archivos
> no están registrados con la versión que tienen en el repo, así que el push
> querría re-aplicarlos. Mismo lugar en `decisiones.md`.

## Documentación

| Archivo | Qué contiene |
|---|---|
| `CLAUDE.md` | Las 13 reglas del proyecto. Lo lee Claude Code en cada sesión. **Leerlo primero.** |
| `docs/arquitectura.md` | El modelo vigente: datos, módulos, vistas, decisiones técnicas |
| `docs/decisiones.md` | Cada decisión cerrada con su razón, y las que siguen abiertas |
| `docs/coordinacion.md` | Los avisos entre carriles. **Leerlo antes de empezar una tarea.** |
| `docs/historico/` | Fuentes de diseño de lo ya implementado. Es el **camino**, no el estado — ante una diferencia, manda `arquitectura.md` |

Las tareas y la coordinación del día a día viven en Notion; lo que un carril
necesita avisarle al otro, en `docs/coordinacion.md`.

## El negocio en 30 segundos

- 2 torneos por año (Apertura / Clausura), **304 equipos** en el padrón, 2 predios
- **15 fechas** el torneo masculino, **13** el femenino — cada fecha genera
  ingresos y gastos
- En verano no se juega pero se pagan sueldos, alquileres e impuestos

**El problema que resuelve:** hoy la misma pregunta —*¿cuánto entró en la fecha
9?*— da tres respuestas distintas según qué planilla se abra.

**Cómo:** todo movimiento genera un asiento de partida doble; todas las
pantallas leen del mismo libro diario; ninguna pantalla calcula su propio
número.

## Estado

| Bloque | Estado |
|---|---|
| Modelo de datos | Cerrado |
| Base | 48 tablas · 53 vistas · 59 funciones · 23 triggers |
| Backend | Los módulos de cobranza, gastos, calendario, arqueo, socios, sponsors, USD, presupuesto y cashflow, construidos |
| Frontend | 18 pantallas. Lectura completa; escritura en cobranza, gastos y arqueo |
| **Seguridad** | **RLS apagado.** Ver abajo |

> ⚠ **RLS está apagado en las 48 tablas y no hay roles.** La anon key viaja en
> el bundle del navegador, así que cualquiera con esa clave puede leer y
> escribir la base **con o sin login**. Hay login y cada escritura registra
> quién la hizo, pero eso resuelve *quién dice ser* el que escribe, no *quién
> puede*. **Antes de que esto esté en internet, RLS deja de ser "para después".**

## Quiénes lo usan

| Persona | Qué hace |
|---|---|
| Guille, Agus | Socios. Miran resultado y caja |
| Mati | Carga diaria: gastos, cobros, arqueo |
| Yas | Administración |
| Augusto | Bar |

*Los roles del sistema —`operador`, `administracion`, `encargado_bar`— están
**diseñados y no construidos**: hoy cualquiera con sesión puede todo. El diseño
está en `arquitectura.md` §2 y §7.*
