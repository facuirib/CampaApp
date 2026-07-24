# Campa

Sistema de gestión financiera para un torneo de fútbol amateur en Córdoba.

Reemplaza cinco planillas de Excel por una fuente única de datos: previsión de
caja, cobranza y rentabilidad por torneo.

## Arranque

```bash
# 1. Crear proyecto en Supabase y copiar credenciales
cp .env.example .env.local   # completar

# 2. Aplicar el esquema (en orden)
psql $DATABASE_URL -f supabase/migrations/001_schema.sql
psql $DATABASE_URL -f supabase/migrations/002_correcciones.sql
psql $DATABASE_URL -f supabase/migrations/003_deuda_equipo.sql
psql $DATABASE_URL -f supabase/seed.sql

# 3. Verificar
psql $DATABASE_URL -f scripts/verificar.sql

# 4. Frontend
npm install
npm run dev
```

> Las migraciones se aplican **en orden numérico**. Cada una asume la anterior.

## Documentación

| Archivo | Qué contiene |
|---|---|
| `CLAUDE.md` | Reglas del proyecto. Lo lee Claude Code en cada sesión. **Leerlo primero.** |
| `docs/arquitectura.md` | Modelo de datos, módulos, decisiones técnicas |
| `docs/decisiones.md` | Las 20 decisiones cerradas, con su razón |

Las tareas y la coordinación viven en Notion.

## El negocio en 30 segundos

- 2 torneos por año (Apertura / Clausura), ~168 equipos, 2 predios
- 10 fechas por torneo; cada fecha genera ingresos y gastos
- En verano no se juega pero se pagan sueldos, alquileres e impuestos

**El problema que resuelve:** hoy la misma pregunta —*¿cuánto entró en la fecha 9?*—
da tres respuestas distintas según qué planilla se abra.

**Cómo:** todo movimiento genera un asiento de partida doble; todas las pantallas
leen del mismo libro diario; ninguna pantalla calcula su propio número.

## Estado

| Bloque | Estado |
|---|---|
| Modelo de datos | Cerrado |
| Esquema SQL | 34 tablas, 12 vistas, 18 triggers |
| Frontend | Arrancando |

## Roles

| Rol | Quién | Alcance |
|---|---|---|
| `admin` | Guille, Agus | Todo |
| `operador` | Mati | Carga diaria |
| `administracion` | Yas | Solo lectura + cierre de período |
| `encargado_bar` | Augusto | Solo Bar, solo su predio |
