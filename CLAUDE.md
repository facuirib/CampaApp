# CAMPA — Contexto para Claude Code

## Qué es

Sistema de gestión **financiera** para un torneo de fútbol amateur en Córdoba.
Reemplaza cinco planillas de Excel por una fuente única de datos.

**NO es un sistema contable.** La contabilidad formal —balance, IVA, amortizaciones
fiscales— la hace un estudio externo. La partida doble está acá para garantizar
que los números cierren, no para emitir balances.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth + RLS) · Vercel

## Reglas no negociables

1. **Todo número visible sale de una vista SQL.**
   El front NUNCA suma, promedia ni calcula totales. Si necesitás un número
   nuevo, creá una vista. Si escribís `.reduce()` para un total que va a
   pantalla, está mal.

2. **Dinero es `numeric(16,2)` en base y `number` en TS.** Nunca `float`.
   Formatear solo en el punto de renderizado, con `formatMoney()`.

3. **Todo movimiento genera un asiento.**
   Los asientos se crean desde funciones de Postgres, no desde la app.
   Si estás escribiendo lógica de asientos en TypeScript, algo está mal.

4. **El asiento nunca se edita ni se borra.**
   Se anula con contraasiento (`anular_asiento`). Toda vista que lea asientos
   filtra `where anulado_por is null`.

5. **Terminología de UI: "Efectivo" y "Transferencia".**
   Nunca "declarable/no declarable", ni blanco/negro, ni equivalentes.
   Ni en la UI, ni en comentarios, ni en nombres de variables.

6. **Nombres de tabla en singular:** `gasto`, no `gastos`.

7. **Un gasto son dos asientos:** devengo al cargar, pago al pagar.
   No los mezcles en una sola operación.

8. **Los asientos se crean solo con `crear_asiento()`.**
   Nunca `insert into asiento` directo. La función resuelve el período,
   valida las líneas y garantiza el balance.

9. **Un movimiento de efectivo necesita `predio_id`.**
   El arqueo es por jornada + predio; sin predio no se puede cuadrar caja.

10. **La imputación de pagos nunca se decide sola.**
    Si un equipo tiene deuda en más de un torneo, se llama a
    `sugerir_imputacion()`, se muestra la propuesta y el operador confirma.
    `imputar_pago_automatico()` está deprecada.

## Los 5 conceptos

### 1. Devengo vs. percibido

Armar la ficha de un equipo factura la deuda completa del torneo:

```
Deudores          debe   $5.250.000
  Ingresos               haber  $5.250.000
```

Cada pago posterior **solo cancela Deudores**. `Ingresos` no se vuelve a tocar.

El P&L muestra lo facturado; la caja, lo cobrado. La diferencia son cuentas
por cobrar — no es un error de cuadratura.

### 2. Fuente única

Todo número deriva de `asiento_linea`. Ninguna pantalla calcula el suyo.
Es lo que impide que dos pantallas muestren totales distintos.

### 3. Empresa vs. torneo

`asiento.torneo_id` con valor = imputable a ese torneo.
`NULL` = **estructura permanente**, que corre haya o no torneo.

La estructura permanente **nunca se prorratea** entre torneos.

### 4. Los dos ejes del gasto

`cat_gasto` tiene dos dimensiones independientes:

- **naturaleza**: `por_fecha` · `recurrente` · `eventual` · `inversion`
- **area**: `torneo` · `predio` · `bar` · `administracion`

El trigger `check_gasto_coherente` valida que naturaleza y anclaje coincidan.

### 5. La deuda es del equipo, no del torneo

Un equipo puede arrastrar deuda de torneos anteriores. Al registrar un pago
se muestran **todas sus deudas** y el operador elige dónde imputar.
El sobrante queda como anticipo (saldo a favor), no se pierde.

## Estructura

```
/app                    rutas (App Router)
/components             UI reutilizable
/lib/db                 queries y tipos generados de Supabase
/lib/domain             lógica de negocio pura (sin I/O)
/supabase/migrations    SQL versionado
/docs                   arquitectura y decisiones
```

## Convenciones

- Server Components por defecto; `"use client"` solo cuando hay interacción
- Server Actions para mutaciones, no API routes
- Los tipos salen de `supabase gen types`, no se escriben a mano
- Errores de dominio: clase `DomainError`, no strings sueltos
- Toda función SQL nueva va en una migración numerada, no en un script suelto

## Funciones de Postgres disponibles

No reimplementar esto en TypeScript:

| Función | Qué hace |
|---|---|
| `crear_asiento(fecha, origen, desc, lineas, [torneo], [jornada], [predio], [origen_id])` | Única vía de escritura en el diario |
| `anular_asiento(id, motivo, [fecha])` | Contraasiento. El original queda marcado |
| `periodo_de_fecha(fecha)` | Resuelve el período; lo crea si no existe |
| `saldo_cuenta(codigo, [hasta], [torneo])` | Saldo según naturaleza de la cuenta |
| `sugerir_imputacion(pago_id)` | Propone reparto de un pago (no escribe) |
| `imputar_pago(pago_id, imputaciones)` | Imputa lo que eligió el operador |
| `aplicar_anticipo(tercero, cuota, monto)` | Usa saldo a favor |
| `generar_cuotas_plan(plan_id)` | Cuotas de una moratoria |
| `proponer_amortizaciones(periodo_id)` | Amortizaciones del mes |

## Vistas principales

| Vista | Para qué |
|---|---|
| `v_deuda_equipo` | Cobranza: quién debe, cuánto, saldo a favor |
| `v_deuda_detalle` | Cuota por cuota, todos los torneos |
| `v_estado_cuota` | Estado de cada cuota |
| `v_cobranza_kpi` | Tasa de cobranza, días promedio |
| `v_saldo_caja` | Saldo de cada caja, derivado del diario |
| `v_resultado_producto` | Contribución por torneo + estructura |
| `v_comparador_torneos` | Contribución por equipo entre torneos |
| `v_calendario_pagos` | Compromisos con criticidad |
| `v_anticipo_saldo` | Saldo a favor disponible |
| `v_libro_diario` | Cabecera de asientos con totales |
| `v_asiento_detalle` | Líneas de un asiento, con nombres |

## Invariantes en la base

No replicar estas validaciones en el front — ya están garantizadas:

| Trigger | Garantiza |
|---|---|
| `trg_asiento_balanceado` | Debe = Haber |
| `trg_asiento_fecha_periodo` | La fecha cae dentro del período |
| `trg_periodo_abierto` | No se escribe sobre período cerrado |
| `trg_periodo_no_reabre` | Un período cerrado no se reabre |
| `trg_gasto_coherente` | Naturaleza y anclaje consistentes |
| `trg_caja_predio` | Efectivo tiene predio; el resto no |
| `trg_imputacion_coherente` | No se imputa de más |
| `trg_sync_cuota_pagada` | `pagado_at` se deriva de las imputaciones |

## Antes de dar una tarea por terminada

- [ ] `npm run build` pasa
- [ ] `npx tsc --noEmit` sin errores
- [ ] Si tocaste SQL: la migración corre sobre base limpia
- [ ] Si tocaste asientos: hay test que verifica Debe = Haber
- [ ] Ningún total calculado en el cliente

## Qué NO hacer todavía

- RLS (va al final, bloquea el desarrollo)
- Optimización de queries (no hay volumen)
- Vistas materializadas (recién con ~100k filas)

## Si algo no está definido

No inventes reglas de negocio. Preguntá.
Especialmente en: imputación de pagos, criterios de imputación contable,
y qué se considera estructura vs. torneo.
