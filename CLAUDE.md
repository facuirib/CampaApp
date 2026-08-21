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
   Se anula con contraasiento (`anular_asiento`): se crea un asiento nuevo con
   las líneas invertidas y el original queda marcado con `anulado_por`.

   **Cómo lo lee una vista depende de qué hace con los asientos:**

   - **Vistas que LISTAN asientos los muestran TODOS y marcan el anulado.**
     No filtran. `v_libro_diario` expone `anulado_por is not null as anulado`
     y devuelve las dos filas: el original marcado y su contraasiento. La
     pantalla los distingue —`/movimientos` tacha el original y le pone un
     badge—, que es distinto de esconderlos.

     **Filtrar acá sería peor que no filtrar**, por la misma razón que explica
     el punto siguiente: `anular_asiento` marca **solo el original**. Un
     `where anulado_por is null` esconde el original y **deja el contraasiento
     visible**, o sea un `ajuste` de −X flotando en el diario sin nada que
     explique qué anula. Se pierde justo la mitad que da sentido a la otra.

     Y de fondo: el diario es un **registro histórico**, no una lista de lo
     vigente. Que un asiento se haya hecho y después anulado son dos hechos, y
     los dos pasaron. Esconder el primero es reescribir la historia — que es
     exactamente lo que la regla 4 existe para impedir.

     **No "arregles" `v_libro_diario` para que filtre**: `/movimientos` depende
     de que no lo haga.

     Una vista que liste **otra cosa** —cuotas, gastos, contratos— sí puede
     filtrar lo anulado, porque ahí la fila anulada no tiene contraparte que
     quede huérfana. Lo de arriba vale para listar **asientos**.

   - **Vistas que SUMAN saldos NO filtran.** El original y su contraasiento
     **se compensan solos**: +X y −X dan 0. Filtrar `anulado_por is null`
     excluye el original y **deja el contraasiento huérfano**, así que el saldo
     da **−X en vez de 0**.

   La causa es que `anular_asiento` marca **solo el original**: el
   contraasiento queda con `anulado_por is null`. Para un saldo, o se incluyen
   los dos o no se incluye ninguno — y como el contraasiento tiene fecha propia,
   incluir ambos es además lo correcto con corte temporal: da lo que el diario
   decía ese día.

   `v_saldo_caja`, `v_cashflow_real` y `saldo_efectivo_predio()` ya lo hacen
   así, y lo explican en sus migraciones. La regla lo dice acá, que es donde se
   busca antes de escribir una vista nueva.

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
   El arqueo es por fecha + predio; sin predio no se puede cuadrar caja.

10. **La imputación de pagos nunca se decide sola.**
    Si un equipo tiene deuda en más de un torneo, se llama a
    `sugerir_imputacion()`, se muestra la propuesta y el operador confirma.
    `imputar_pago_automatico()` está deprecada.

11. **No se aplican migraciones sobre la base hosted sin confirmación previa.**
    La base de Supabase es compartida por los dos desarrolladores. Escribir el
    archivo de migración es libre; **aplicarlo** —por CLI, por MCP o desde el
    panel— se avisa y se confirma antes. Vale también para lo que parece
    inofensivo: un `create or replace view` aditivo sobre una base vacía es
    seguro, pero la base no siempre va a estar vacía, y quien aplica no
    siempre sabe qué está corriendo el otro en ese momento.

    Esto incluye el caso de regenerar tipos: `supabase gen types` necesita el
    schema aplicado en algún lado. Si no hay entorno local, la regeneración
    implica tocar la base compartida — o sea que también se confirma antes.

12. **El schema es agnóstico del torneo.**
    Ni el schema, ni las funciones, ni las vistas pueden contener valores
    específicos de un torneo: fechas, cantidad de fechas, nombres de series o
    categorías, cantidad de equipos o de partidos. Todo eso entra como **datos**
    vía `supabase/seeds/`, y las funciones lo **leen** de la base.

    Si escribís un `15` porque el Clausura tiene 15 fechas, o un `'Libre'`
    porque existe esa categoría, está mal: es un bug latente que aparece con el
    torneo siguiente.

    **Un torneo nuevo se carga con sus seeds y funciona sin tocar código.** Ese
    es el test. Verificado por auditoría — único hallazgo: los defaults `15`/`13`
    de `generar_grilla_liga`, que la reescritura de la grilla elimina.

13. **La Fase 2 actualiza el doc que escribió la Fase 1.**
    Si construiste algo que `arquitectura.md` o `decisiones.md` declaraban
    pendiente, **actualizá su estado ahí mismo antes de commitear**, con la
    migración que lo respalda. No en un commit posterior: en el mismo.

    El doc se escribe al diseñar, cuando todo está pendiente. Si nadie vuelve
    sobre él al construir, queda declarando pendiente lo que ya existe — y ese
    es el peor error posible, porque **alguien lo lee, lo construye de nuevo y
    duplica lo que ya está**.

    No es hipotético: pasó nueve veces seguidas, y las nueve fallaron igual.
    Módulos completos —arqueo, cashflow, socios, sponsors— figuraban como
    "pendiente de construir" con la migración aplicada y probada con datos.

    Vale también para lo que el doc afirma del schema: si renombraste una
    columna o agregaste una, el bloque DDL del doc se corrige en el mismo
    commit. **El schema es la verdad; el doc se corrige hacia él, nunca al
    revés.**

## Los 5 conceptos

### 1. Percibido (ingresos) vs. devengado (gastos)

**Los dos lados del resultado no se reconocen igual. No los unifiques.**

**Ingresos — al cobrar.** El único evento que genera ingreso contable es el
pago:

```
Al registrar un pago de $525.000 por transferencia:

Caja Transferencia       debe     $525.000
  Ingresos por partidos          haber    $525.000
```

Las `cuota` **no generan ningún asiento**. Son términos de pago: cronograma,
mora y base del cashflow. No hay `Deudores` en juego — lo que un equipo debe
no está en el libro diario, está en `cuota`.

La cuota hereda de la línea del plan el concepto (inscripción / partidos), y
de ahí sale a qué cuenta de ingreso se imputa el cobro.

**La deuda de un equipo es su mora**: cuotas vencidas e impagas. Es una cifra
operativa, para reclamar — **no un saldo contable**. Al preguntarte "cuánto
debe este equipo", la respuesta nunca es `total_plan`.

**Gastos — al cargar. Esto NO cambió.** Un gasto sigue generando dos
asientos: devengo al cargar (`Gasto` / `Proveedores a pagar`) y pago al pagar
(`Proveedores a pagar` / `Caja`). Ver regla 7.

Consecuencia de la asimetría: para **ingresos**, P&L y caja muestran lo
mismo. Para **gastos**, siguen contando cosas distintas. Es deliberado.

> Reemplaza al devengo progresivo del Draft 11, que a su vez había
> reemplazado a la "Opción A" (deuda total al armar la ficha). Las dos
> vueltas están registradas en `docs/arquitectura.md` §8; el principio, en
> §1.b.

### 2. Fuente única — dos dominios, una fuente en cada uno

Ninguna pantalla calcula el suyo: todo sale de una vista. De cuál, depende de
qué clase de número es.

**Contable** —resultado, P&L, caja, saldos— deriva de `asiento_linea`, sin
excepción.

**Operativo** —mora, cronograma, cartera por vencer, tasa de cobranza,
cashflow— deriva de `cuota`. Es planificación, no contabilidad, y con ingresos
por percibido la cuota no genera asiento: buscarlo en el diario sería buscarlo
donde no está.

No es una excepción. **Cada dominio tiene una fuente y solo una, y no se
cruzan:** un número contable jamás sale de `cuota`, uno operativo jamás se
reconstruye desde el diario. Lo que estaría mal es que un mismo número tuviera
dos orígenes posibles.

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
- Mutaciones: Client Component + `supabase.rpc()` cuando hay función de Postgres
  que valida — **la puerta es la función, no el transporte**. Server Action
  cuando se escribe directo a una tabla, porque ahí la validación no puede vivir
  en otro lado, o cuando hay un secreto en juego (`RESEND_API_KEY`). Nunca API
  routes
- Los tipos salen de `supabase gen types`, no se escriben a mano
- Errores de dominio: clase `DomainError`, no strings sueltos
- Toda función SQL nueva va en una migración numerada, no en un script suelto

## Las puertas

Hay ~50 funciones en la base. **Éstas son las que no se pueden esquivar**: cada
una protege un invariante que se rompe si escribís por otro lado. Si estás por
hacer un `insert` que alguna de éstas ya hace, parás.

| Puerta | Qué invariante protege |
|---|---|
| `crear_asiento(...)` | **Única vía de escritura en el diario.** Resuelve el período, valida las líneas y garantiza Debe = Haber |
| `anular_asiento(id, motivo, [fecha])` | El asiento no se edita ni se borra: se contraasienta, y el original queda marcado |
| `crear_equipo_torneo(...)` | Única vía de alta de ficha. Genera las cuotas desde el tarifario según la regla de cada línea |
| `registrar_cobro(...)` | Única vía de cobro. Pago + imputación + asiento en una transacción: o entra todo o no entra nada |
| `imputar_pago(pago_id, imputaciones)` | Valida que las cuotas sean del tercero y que no se exceda el saldo |
| `crear_jornada` · `crear_playoff` · `mover_jornada` · `suspender_jornada` | Una lógica, dos puertas: el seed y la app validan igual |
| `crear_dia_cancha` · `crear_arqueo` · `registrar_entrega_central` | El circuito de caja física, con el saldo esperado congelado al arquear |
| `devengar_sueldos_socios(periodo)` · `devengar_sponsors(periodo)` | Procesos mensuales **idempotentes**: correrlos dos veces no duplica |
| `comprar_usd` · `vender_usd` | El promedio ponderado y la diferencia de cambio realizada. Tocar `CAJA_USD` por afuera corre el promedio en silencio |

**El catálogo completo vive en `docs/arquitectura.md`**, por tema. Acá no se
replica: una lista a mano se desactualiza en la próxima migración, y eso es
exactamente la fábrica de drift que este archivo tiene que evitar.

## Vistas que conviene conocer

Hay ~34. Estas cinco son las que aparecen en casi cualquier tarea:

| Vista | Para qué |
|---|---|
| `v_estado_cuota` | El estado de cada cuota. Base de toda la cobranza |
| `v_deuda_equipo` | Quién debe, cuánto, saldo a favor |
| `v_saldo_caja` | Saldo de cada caja, derivado del diario |
| `v_libro_diario` · `v_asiento_detalle` | El diario y las líneas de un asiento |
| `v_cashflow` | La línea de tiempo: real, comprometido y estimado |

Para el resto, **buscá por tema en `docs/arquitectura.md`**: cobranza §3.4 ·
calendario §3.5 · caja y arqueo §3.6 · USD §3.7 · presupuesto §3.8 · cashflow
§3.10 · socios §3.19 · sponsors §3.20.

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
- [ ] **Si construiste algo que el doc daba por pendiente: actualizá su estado
      ahí mismo, con la migración que lo respalda** (regla 13)

## Qué NO hacer todavía

- RLS (va al final, bloquea el desarrollo)
- Optimización de queries (no hay volumen)
- Vistas materializadas (recién con ~100k filas)

## Si algo no está definido

No inventes reglas de negocio. Preguntá.
Especialmente en: imputación de pagos, criterios de imputación contable,
y qué se considera estructura vs. torneo.
