# Reordenamiento del plan de cuentas · especificación

> ## ✅ COMPLETADO — 12/08/2026
>
> **Esto es registro histórico, no trabajo pendiente.** Los grupos 1, 2, 3.1,
> 3.2 y 3.3 están **aplicados**, cada uno en su migración
> (`20260812141034` … `20260812153804`).
>
> **El 3.4 —financieros al P&L— NO se hizo acá:** se movió al rediseño de
> Resultados, donde la vista de P&L a nivel empresa nace incluyéndolos y se
> dropean `v_resultado_producto` y `v_comparador_torneos` junto con la pantalla
> que las reemplaza. El motivo está en `decisiones.md`. **Si estás leyendo esta
> sección buscando qué falta hacer, no es acá.**
>
> El estado vigente del plan de cuentas vive en **`arquitectura.md` §3.3** y
> las decisiones en **`decisiones.md`**. Este archivo se conserva por el
> método: el análisis de riesgo por grupo y las verificaciones previas son lo
> que hizo que las cinco migraciones salieran sin sorpresas.
>
> Lo que sigue quedó **tal como se escribió antes de ejecutar**, en futuro y sin
> corregir. Reescribirlo en pasado lo convertiría en un resumen de lo que pasó,
> que es justo lo que ya está en `decisiones.md` — y perdería lo único que este
> archivo aporta: qué se sabía y qué se temía **antes** de tocar nada.

---

**Estado al escribirse: aprobado por Facu, pendiente de ejecutar.** Cada grupo
se ejecuta por separado, mostrando la migración antes de aplicar (regla 11) y
con `begin` / `rollback` de ensayo. Este documento es el mapa completo; no
contiene SQL ejecutable a propósito.

Verificado contra la base el 12/08/2026. Todos los conteos de uso —gastos,
asientos, líneas de presupuesto— salen de una consulta, no de memoria.

---

## Tres correcciones a lo que se asumió al decidir

Las tres cambian el riesgo de algún cambio, así que van antes que la lista.

### 1 · Mover «Alquiler» a «Alquileres» NO toca ningún asiento

La pregunta era si había que anular y recrear los 2 gastos, o remapear. **Ni
una cosa ni la otra tiene impacto contable**, por una razón concreta: las dos
categorías apuntan a la **misma cuenta**, `GAS_PREDIO`.

`registrar_gasto` resuelve la cuenta del asiento desde `cat_gasto.cuenta_id`.
Si el gasto pasa de «Alquiler» a «Alquileres», su asiento sigue estando contra
`GAS_PREDIO`, por el mismo importe y con la misma fecha. **El libro diario
queda byte por byte igual.**

Así que no hay contraasiento que hacer, y la regla 4 ni siquiera entra en
juego: no se está editando ningún asiento. Es un `update` sobre
`gasto.cat_gasto_id`, que es reclasificación de gestión, no contabilidad.

> Sigue siendo el cambio más delicado del lote, pero **por otro motivo**:
> reescribe cómo quedan clasificados dos gastos ya cargados, y hay además una
> línea de presupuesto apuntando a la categoría que desaparece. Eso es lo que
> hay que resolver, no el asiento.

### 2 · Ningún gasto usa `concepto_id`

`gasto` y `presupuesto_linea` tienen FK a `concepto_gasto`, así que borrar
conceptos *podría* romper. **No rompe: los 11 gastos y las 6 líneas de
presupuesto tienen `concepto_id` en null.** Los conceptos están cargados como
catálogo y todavía no se usan.

Consecuencia: quitar los 7 conceptos de «Viáticos» es una operación sin
consumidores. Grupo 1.

### 3 · Agus y Guille están cargados dos veces, en dos circuitos distintos

| Dónde | Qué |
|---|---|
| `tercero` tipo `socio` | Agus, Guille — con **$9.450.000 asentados** en `GAS_SOCIOS` |
| `concepto_gasto` de «Sueldos administrativos» | Agus, Guille (+ Augusto, Estudio contable, Jero, Mati, Rodri, Yas) |

Si alguien carga un gasto contra el concepto «Agus», el sueldo de Agus queda
**contado dos veces**: una por `devengar_sueldos_socios` contra `GAS_SOCIOS`, y
otra como gasto contra `GAS_SUELDOS`. Hoy no pasó porque ningún gasto usa
conceptos, pero es una trampa cargada.

Es exactamente el problema que «el sistema crea los conceptos» viene a
resolver. Ver la sección de relevamiento al final.

---

## Grupo 1 · Trivial — no toca asientos ni relaciones

Renombres puros. Cambian una etiqueta y nada más: ningún `gasto`, ninguna línea
de presupuesto y ningún asiento cambia de lugar. Reversibles renombrando de
vuelta.

| # | Cambio | Tabla · columna | ¿Asientos? | Nota |
|---|---|---|---|---|
| 1.1 | `GAS_FECHA` · «Extras» → **«Otros Gastos Fecha»** | `cat_gasto.nombre` | **No** | Tiene 1 gasto asentado, que no se mueve: sólo cambia el nombre de su categoría |
| 1.2 | `GAS_BAR` · «Extras» → **«Extras Bar»** | `cat_gasto.nombre` | No | 0 gastos |
| 1.3 | `GAS_PREDIO` · «Mantenimiento» → **«Mantenimiento Predio»** | `cat_gasto.nombre` | No | 0 gastos · 2 conceptos que quedan |
| 1.4 | `GAS_SUELDOS` · «Mantenimiento - Personal» → **«Sueldos Predio»** | `cat_gasto.nombre` | No | 0 gastos · 3 conceptos · **queda en `GAS_SUELDOS`** |
| 1.5 | `GAS_FECHA` · «Viáticos»: quitar sus **7 conceptos** | `concepto_gasto` (delete) | No | Ballboys · Coordinación/Tribunal · Estacionamiento · Guardias · Limpieza-Berclean · Limpieza-Roman · Veedores. Ninguno referenciado |
| 1.6 | `GAS_PREDIO` · quitar **«Mantenimiento eventual»** | `cat_gasto` (delete) | No | 0 gastos · 0 conceptos · 0 presupuesto |

**1.1 y 1.2 dejan de ser ambiguos entre sí**, que era el punto: hoy la matriz
mostraría dos filas «Extras» sin nada que las distinga.

> **Sobre 1.5 y 1.6, que son borrados.** Antes de ejecutarlos conviene decidir
> si se borran o se marcan `activo = false`. **Las dos tablas ya tienen la
> columna** —`cat_gasto.activo` y `concepto_gasto.activo`—, así que desactivar
> no cuesta nada de schema. Borrar es más limpio hoy —nadie los usa— pero
> irreversible; desactivar deja rastro de que existieron y de cuándo dejaron de
> usarse. **Es una decisión de Facu**, y aplica igual a 3.1.

---

## Grupo 2 · Mueve categorías entre cuentas — sin asientos involucrados

Cambian `cat_gasto.cuenta_id`, o sea a qué cuenta van a imputar **los gastos
futuros** de esa categoría. **Verificado: las cuatro tienen 0 gastos y 0 líneas
de presupuesto**, así que nada histórico se reclasifica.

| # | Cambio | Tabla · columna | ¿Asientos? | Conceptos que viajan |
|---|---|---|---|---|
| 2.1 | «Impositivos»: `GAS_SUELDOS` → **`GAS_IMPUESTOS`** | `cat_gasto.cuenta_id` | **No** — 0 gastos | 8: Comercio e Industria CBA · Créd/Déb bancarios · F931 · IIBB · IVA · Municipalidad TIR · Retención IIBB · UTEDYC |
| 2.2 | «Planes de Pago»: `GAS_SUELDOS` → **`GAS_IMPUESTOS`** | `cat_gasto.cuenta_id` | **No** — 0 gastos | 3: ARCA · Municipalidad · Rentas |
| 2.3 | «Nafta»: `GAS_SUELDOS` → **`GAS_PREDIO`** | `cat_gasto.cuenta_id` | **No** — 0 gastos | 2: Nafta Agus · Nafta Guille |

Después de 2.1–2.3, `GAS_SUELDOS` queda con **«Sueldos administrativos»** y
**«Sueldos Predio»** (la renombrada en 1.4), que es lo pedido.

Y `GAS_IMPUESTOS` deja de ser una cuenta vacía sin sentido: pasa a ser donde
viven los 11 conceptos impositivos.

### Dos cosas a revisar al ejecutar este grupo

**El `area` no se mueve solo.** Las tres categorías tienen `area =
'administracion'`. Al pasar a `GAS_PREDIO`, «Nafta» queda con área
administración colgando de la cuenta de predio. `check_gasto_coherente` **no
valida área contra cuenta** —sólo naturaleza contra jornada/activo/torneo— así
que no va a fallar, pero el dato queda inconsistente y `cat_gasto.area` se usa
en el presupuesto. **Decidir si el área acompaña el movimiento.**

**«Nafta Agus» y «Nafta Guille» son personas, no lugares.** Si la nafta es de
los autos de los socios, quizá no es gasto de predio. Vale mirarlo antes de
mover.

---

## Grupo 3 · Delicado — toca datos cargados o vistas de resultado

### 3.1 · Unificar «Alquiler» en «Alquileres»

**Qué toca:** `gasto.cat_gasto_id` (2 filas), `presupuesto_linea.cat_gasto_id`
(1 fila), y después `cat_gasto` (borrar «Alquiler»).

**¿Asientos?** **No** — ver la corrección 1 arriba. Las dos categorías apuntan
a `GAS_PREDIO`, así que el diario queda idéntico. No hay contraasiento.

**Riesgo real:** dejar huérfana la línea de presupuesto. Si se borra «Alquiler»
sin remapearla primero, la FK lo impide (bien) o la línea queda apuntando a
nada. Y los 2 gastos son los únicos gastos de alquiler cargados: si el remapeo
falla a la mitad, quedan repartidos entre dos categorías.

**Camino propuesto**, todo en una transacción:

1. Remapear `gasto`: los 2 gastos de «Alquiler» pasan a «Alquileres».
2. Remapear `presupuesto_linea`: la 1 línea pasa a «Alquileres».
3. Verificar que «Alquiler» quedó en 0 gastos y 0 líneas.
4. Borrar sus 2 conceptos («Femenino», «Masculino») **o** moverlos a
   «Alquileres» — hoy «Alquileres» tiene 5 conceptos que son lugares
   (Aeropuerto, Tirolesa, Patio…) y «Alquiler» tiene 2 que son géneros. **Son
   dos criterios distintos de subdivisión y hay que elegir uno.**
5. Borrar «Alquiler».

**Verificación de cierre:** el total de `GAS_PREDIO` en el diario tiene que ser
**exactamente el mismo antes y después** ($2.227.000 al debe). Si cambió, algo
se hizo mal.

> El paso 4 es el que necesita criterio de Facu, no técnica: ¿el alquiler se
> subdivide por género o por predio? Los dos no.

**¿Toca algo de Horacio?** No. `registrar_gasto` y `pagar_gasto` siguen
resolviendo por `cat_gasto.cuenta_id`, que no cambia.

---

### 3.2 · Los financieros entran al P&L

**Qué toca:** tres vistas de resultado. Ninguna tabla, ningún asiento.

| Vista | Hoy | Qué habría que cambiar |
|---|---|---|
| `v_resultado_producto` | `where c.tipo in ('ingreso','egreso')` | Incluir `financiero` y decidir su signo |
| `v_comparador_torneos` | idem | Idem — **pero ver la nota de abajo** |
| `v_dashboard` | `and cu.tipo in ('ingreso','egreso')` | Idem |

**Cómo cambia el resultado**, con los datos de prueba de hoy:

| | Monto |
|---|---|
| Ingresos | $23.012.000 |
| Egresos | $25.437.000 |
| **Resultado hoy** | **−$2.425.000** |
| Resultado financiero (`FIN_DIF_CAMBIO`, neto al haber) | +$244.500 |
| **Resultado con financieros** | **−$2.180.500** |

**El signo, que es la decisión contable.** `FIN_DIF_CAMBIO` tiene $109.500 al
debe y $354.000 al haber. Para una cuenta de resultado financiero, **haber =
ganancia** — igual que un ingreso. Así que la fórmula es `haber − debe`, la
misma que ingresos, y da +$244.500.

**Dónde se muestra es otra decisión.** Tres opciones:

- **Bloque propio** — "Resultado financiero", debajo de ingresos y egresos. Es
  lo contablemente correcto: no es ingreso operativo.
- **Dentro de ingresos** — más simple, pero mezcla una ganancia de tenencia con
  la facturación del torneo. Desaconsejado.
- **Una línea suelta antes del resultado** — el punto medio.

Recomiendo **bloque propio**: el mockup ya tiene dos bloques, agregar un tercero
de una línea no complica nada y no miente.

**Riesgo:** las tres vistas alimentan pantallas en producción. Cambiar la
fórmula cambia números que hoy alguien ya vio. Hay que avisar, no sólo aplicar.

**⚠ `v_comparador_torneos` tiene un bug previo y grave.** Multiplica los
importes por la cantidad de equipos: muestra $481.936.000 de ingresos de
Clausura contra los $17.212.000 reales — factor exacto 28, que son los equipos.
Es un fan-out de join. **Tocarla para sumar financieros sin arreglar eso sería
poner un número correcto adentro de uno roto.** O se arregla en el mismo paso,
o la vista sale de la pantalla (que es lo que el rediseño de Resultados propone,
por negocio unificado).

**¿Toca algo de Horacio?** `v_dashboard` sí — es la pantalla de inicio. Las
otras dos son de la pantalla de Resultados, que es carril de Facu. **Avisar
antes de aplicar.**

---

### 3.3 · `DEUDORES` — la cuenta que sobra

**Qué toca:** `cuenta`, una fila. **0 asientos**, así que no hay nada que migrar.

Con percibido puro no existe el devengo de ingresos: lo que un equipo debe vive
en `cuota`, no en el diario. La cuenta quedó sin sentido al cambiar el modelo, y
es la única del plan que no espera ningún circuito por construir.

**Dos caminos:**

- **Borrarla.** Limpio, pero irreversible, y si mañana aparece un ingreso a
  devengar hay que recrearla.
- **Marcarla como no usada.** `cuenta` **no tiene columna `activo`** —lo
  verifiqué—, así que esto implica agregarla. Es un cambio de schema chico que
  además serviría para las otras 14 cuentas sin movimiento.

**Recomiendo agregar `cuenta.activo`** y marcarla, no borrar: el mismo mecanismo
sirve después para las que esperan circuito, y deja explícito qué está vivo.

**¿Toca algo de Horacio?** `crear_asiento` resuelve por `codigo`. Si se agrega
`activo`, habría que decidir si la función **rechaza** asentar contra una cuenta
inactiva. Eso **sí es tocar el motor** y va coordinado.

---

## Orden de ejecución

De menos a más riesgo, y cada paso verificable antes del siguiente.

| Paso | Qué | Reversible | Coordinar con Horacio |
|---|---|---|---|
| **1** | Grupo 1 completo (1.1–1.6) | Sí, renombrando | No |
| **2** | Grupo 2 completo (2.1–2.3) | Sí, moviendo de vuelta | No |
| **3** | 3.1 · unificar Alquiler | Difícil — reclasifica gastos | No |
| **4** | 3.3 · `DEUDORES` | Sí, si se marca en vez de borrar | **Sí, si `crear_asiento` valida** |
| **5** | 3.2 · financieros al P&L | Sí, revirtiendo las vistas | **Sí — `v_dashboard`** |

**Por qué 3.2 va último:** es el único que cambia números que ya se están
mostrando. Conviene que el plan de cuentas esté quieto antes de tocar cómo se
suma.

**Antes del paso 1**, decidir las dos cosas transversales:

1. **¿Borrar o desactivar?** Aplica a 1.5, 1.6, 3.1 y 3.3.
2. **¿El `area` acompaña a las categorías que se mueven?** Aplica al grupo 2.

---

## Relevamiento pendiente · «el sistema crea los conceptos de sueldos»

Facu dijo: *«dejamos solo Sueldos administrativos y nosotros por sistema creamos
los conceptos»*. Esto es lo que hay hoy, sin construir nada.

**No existe ningún mecanismo que genere conceptos.** `concepto_gasto` se carga a
mano; nada la escribe automáticamente.

**No hay tabla de empleados.** `tercero` admite `equipo`, `socio` y `sponsor`, y
nada más. Los 8 conceptos de «Sueldos administrativos» son nombres escritos a
mano: Agus, Augusto, Estudio contable, Guille, Jero, Mati, Rodri, Yas.

**Y dos de ellos ya existen como socios**, con su propio circuito y sus propios
asientos contra `GAS_SOCIOS` (corrección 3 arriba). Cargar un gasto contra el
concepto «Agus» duplicaría su sueldo.

### Qué haría falta, si se construye

Tres opciones, de menor a mayor:

- **Un `tercero` tipo `empleado`**, y los conceptos de sueldo se generan de ahí.
  Reusa toda la infraestructura de terceros. Agus y Guille **no** se duplican
  porque ya son terceros: cambia de qué tipo son, o se acepta que un tercero
  pueda ser socio y empleado a la vez.
- **Una tabla `empleado` propia**, con su sueldo acordado versionado, espejo de
  `sueldo_socio`. Más trabajo, pero separa limpiamente al que cobra sueldo del
  que es dueño.
- **Que el ítem del P&L salga de `asiento_linea.tercero_id`**, como ya pasa con
  socios, y los conceptos de sueldo directamente no existan. El más chico de los
  tres, y el que menos duplica.

**Nada de esto es necesario para el reordenamiento.** «Sueldos administrativos»
puede quedar con sus 8 conceptos escritos a mano mientras tanto — pero conviene
**no cargar gastos contra los conceptos «Agus» y «Guille»** hasta resolverlo.

*Queda para una sesión aparte, con su propio diseño.*

---

## Lo que este reordenamiento NO resuelve

Anotado para que no se dé por cerrado lo que sigue abierto:

- **Ingresos sigue sin segundo nivel.** Decidido así: las 4 cuentas `ING_*` son
  categorías sin ítems, y el expandible existe sólo en egresos. `ING_BAR` queda
  para cuando haya circuito de bar.
- **`GAS_AMORT` y `GAS_SOCIOS` siguen sin categorías.** La primera espera el
  módulo de Activos. La segunda tiene $9.450.000 asentados y no se abre — su
  ítem natural es el socio, que hoy no se puede alcanzar desde el asiento
  (`origen_id` viene null en los 6 asientos de socio).
- **El `padre_id` de `cuenta` sigue sin usarse.** El modelo queda con la
  jerarquía en tablas satélite, no en el árbol de cuentas. Es la opción B del
  diseño anterior, y esta es la decisión que la confirma.
