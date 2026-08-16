# Coordinación entre carriles

Lo que un carril necesita avisarle al otro. **Se lee antes de empezar una
tarea** — si algo de acá toca lo que vas a hacer, hablalo primero.

Los dos carriles, hasta acá:

| | Facu | Horacio |
|---|---|---|
| **Qué** | Display y vistas de lectura | Escritura y mutación |
| **Dónde** | `components/`, el shell, las pantallas de lista y detalle, las vistas `v_*` de lectura | Los formularios de alta y pago, las funciones de la base que escriben |

La regla que evitó los choques hasta ahora: **una pantalla de lectura puede
enlazar a una de escritura, pero no tocarla por dentro.** Un `<Link>` cruza el
carril; un `onClick` que llama a una función, no.

---

## Avisos abiertos

### 📋 Plan de trabajo · 16/08/2026 · acordado por Facu

**Para avanzar en paralelo.** Cada uno en su carril, en zonas que no se cruzan,
este archivo como canal, y **lo compartido se agenda para sentarse juntos**.

La sesión pasada lo probó: los dos tocamos `/gastos` —Horacio el formulario de
alta, Facu la lista y las tarjetas— y **no hubo un solo conflicto**. Sus dos
ramas siguen mergeando limpio contra `main`. Con las líneas trazadas, la misma
zona aguanta a los dos.

> **Horacio: hacé `pull` antes de retomar.** Tus dos ramas salen de `ec27a2a`,
> que es anterior a la respuesta al bloque 8 — está más abajo en este mismo
> archivo, con los cuatro asientos revisados uno por uno.

---

#### 🔧 Carril Horacio · escritura y motor

**1 · El eslabón cobro-cheque.** *Lo primero: todo lo demás del circuito cuelga
de acá.*

Que `registrar_cobro` con `p_medio = 'cheque'` **cree la fila en `cheque`** —
número, banco, fecha de cobro— y la **vincule al pago con una columna nueva**.

Hoy no existe: cero `insert into cheque` en todo el repo, y la tabla tiene 0
filas. Por eso **tu `cambiar_estado_cheque` no tiene de dónde partir**: recibe un
`p_cheque_id` de una fila que nadie crea. Y sin el vínculo, **cuando un cheque
rebota no se sabe qué pago canceló, ni por lo tanto qué cuota reabrir** — las FK
de `cheque` son a `tercero` y a los dos asientos, nada más.

**2 · Los 3 asientos aprobados del bloque 8**, con el único cambio pedido: **la
caja va elegible, no hardcodeada.** Vale para el caso 1 (cheque acreditado) y el
caso 3 (cheque debitado), que hoy fijan `CAJA_TRANSFERENCIA`. Es exactamente lo
que ya hiciste bien en el caso 4, sacándola de `p_caja_id`. El día que haya dos
bancos, la versión fija miente.

**3 · Pagos parciales de gasto** — *antes de construir, confirmá con Facu si pasa
de verdad.* Hoy `gasto.pagado_at` es un timestamp único: un gasto está pagado o
no lo está, no existe «parcial». Si los gastos del torneo se pagan en cuotas es
cambio de modelo (tabla de pagos de gasto, tocar `pagar_gasto`, rehacer el estado
en `v_gasto_detalle`). Si siempre se pagan de una, no se toca nada.

**4 · Tu `fix/gastos-errores-humanos`: que no tape tus propios mensajes.**
Traduce bien los errores genéricos de Postgres, pero **los `raise exception` de
tus funciones caen en el fallback**. El mensaje cuidado que escribiste vos —*«Un
retiro en efectivo tiene que decir de qué predio salió la plata, o el arqueo de
ese día no cierra»*— termina mostrándose como *«No se pudo registrar el pago»*,
que es peor que el original. Dejá pasar el mensaje crudo cuando no matchea ningún
patrón conocido, o detectá los propios primero.

**5 · El timestamp de la migración: el que registre la herramienta, no uno a
mano.** Es regla nueva y ya está documentada en el README. **El CLI compara por
versión**, así que un número elegido antes hace que `db push` quiera correr de
nuevo una migración ya aplicada. Se acaba de sincronizar el historial por
exactamente esto: había once archivos desalineados. Si aplicás por MCP o desde el
panel, **renombrá el archivo a la versión que quedó registrada**.

---

#### 🎨 Carril Facu · display puro

No toca la escritura de Horacio: son vistas de lectura, listas, tarjetas, filtros
y gráficos.

| | pantalla | estado del backend |
|---|---|---|
| **1** | **Presupuesto por fecha** *(arranca por acá)* | Completo y **con datos**: 6 líneas cargadas. `/proyeccion` ya lo usa vía `v_cashflow_estimado` |
| **2** | **Activos** | `proponer_amortizaciones()` listo. Es lo que `GAS_AMORT` espera: hoy 0 movimientos |
| **3** | **Cheques** *(pantalla de LECTURA)* | La tabla y el backend de lectura están. **En paralelo con la escritura de Horacio — no choca** |
| **4** | **Calendario de pagos** | `v_calendario_pagos` completa, con `tercero` y `criticidad` |

> **Nota de secuencia, no de bloqueo.** Tres de estas cuatro leen tablas que hoy
> están **vacías** —`cheque` 0 filas, `compromiso` 0 filas, `amortizacion` 0
> filas— porque todavía nada las escribe. Las pantallas se pueden construir igual
> y **es deliberado que vayan en paralelo**: cuando el carril de escritura llegue,
> la pantalla ya está esperando. Presupuesto va primera justamente porque es la
> única con datos reales para mirar mientras se construye.

---

#### 🤝 Compartido · se agenda, NO se hace en paralelo

**RLS — el grande de seguridad.** Alto riesgo y **cruza todas las tablas**: la
lectura de Facu y la escritura de Horacio a la vez. Hoy hay **0 tablas con RLS** y
la anon key viaja en el bundle del navegador, así que cualquiera con esa clave
puede leer y escribir **con o sin login**. Merece una sesión dedicada de los dos,
no un reparto.

**Los pop-ups de «agregar movimiento».** Los formularios son de Horacio, la UI del
modal es de Facu. **Hay que acordar el enfoque antes de tocar:** envolver los
formularios que ya existen, o reescribirlos. Es la decisión que define quién toca
qué.

**Ventas de bar — empieza por modelar.** `ING_BAR` existe con **0 movimientos** y
**no hay ninguna tabla de ventas** (cero tablas con `venta`, `producto` o `stock`
en el nombre). El club **sí** registra ventas, así que es roadmap real. Falta
decidir el **grano** —¿venta individual, cierre de caja por día, por jornada?—,
la tabla, y cómo entra al diario. Probablemente el modelo lo hace Horacio y la
pantalla Facu, pero **la decisión de negocio va primero**.

> Los **gastos** de bar ya están cubiertos: `GAS_BAR` con 8 categorías, se cargan
> desde `/gastos` como cualquier otro. Lo que falta es sólo el ingreso.

---

#### La regla del paralelo

| | |
|---|---|
| **Display** — listas, tarjetas, filtros, gráficos, vistas de lectura | **Facu** |
| **Escritura** — funciones, formularios de alta y pago, motor SQL | **Horacio** |

**Si algo cruza, se agenda acá antes de tocar.**

---

### ✅ Bloque 8 · revisión de la propuesta · 14/08/2026 · de Facu para Horacio

**Revisada `feat/bloque8-funciones-propuesta`.** Respetaste la regla 11: la
migración está escrita y **sin aplicar**, con los cuatro ⚠️ marcados. Eso es
exactamente lo que hay que hacer cuando se toca el motor — gracias.

**Tres de los cuatro asientos van. El cuarto destapó un hueco de modelo que es
anterior a tu función**, así que no es algo que hayas resuelto mal: es algo que
todavía no existe.

---

#### Caso 1 · Cheque recibido → acreditado · **APROBADO**

`VALORES_A_DEPOSITAR` al haber contra la caja al debe es **fiel a la decisión
31**. La 31 dice que al cobrar con cheque el debe va a `VALORES_A_DEPOSITAR`;
acreditarlo es el segundo paso del mismo circuito, y tu asiento lo cierra.

**Un solo cambio:** la caja **no va fija a `CAJA_TRANSFERENCIA`**. Tiene que ser
elegible, como hiciste en el fondo (caso 4), donde la sacás de `p_caja_id`. Un
cheque puede acreditarse en cuentas distintas, y el día que haya dos bancos la
función queda mintiendo.

#### Caso 3 · Cheque emitido → debitado · **APROBADO**

`CHEQUES_A_PAGAR` al debe contra la caja al haber **calca el patrón de gastos**:
nace el pasivo al emitir, se cancela al debitarse. Es el mismo par que
`Proveedores a pagar / Caja` del pago de gasto (regla 7).

Ninguna decisión lo dice explícito, y **está bien igual**: es el patrón que el
sistema ya usa en todos lados. Mismo cambio que el caso 1 — **caja elegible, no
hardcodeada**.

#### Caso 4 · Fondo · colocación y rescate · **APROBADO**

Fiel a la **decisión 22**, y bien resuelto que la caja salga de `p_caja_id`.

*Sobre la tensión que marcaste con «sin saldo en Campa»:* la 22 rechaza un saldo
**mantenido a mano**, porque se desactualiza y un saldo desactualizado es peor
que no tenerlo. Un saldo **derivado del diario** —colocaciones menos rescates—
no se mantiene: se recalcula. Es lo contrario del problema que la 22 rechaza.
**Compatible.**

> *Nota aparte:* ese saldo refleja **lo movido**, no los rendimientos del fondo.
> Si algún día se quieren reflejar, es otro asiento contra `FIN_RENDIMIENTOS`.
> No hace falta ahora.

---

#### Caso 2 · Cheque recibido → rechazado · **NO se puede resolver todavía**

No es que el asiento esté mal: **falta un eslabón de modelo, y es anterior a tu
función.**

*El hallazgo, verificado:*

· **Cobrar con cheque hoy NO crea ninguna fila en `cheque`.** Cero `insert into
  cheque` en todo el repo — funciones, pantallas y seeds. La tabla tiene 0
  filas. `registrar_cobro` con `p_medio = 'cheque'` sólo cambia la cuenta del
  debe a `VALORES_A_DEPOSITAR` y genera el asiento. **No queda registro de qué
  cheque era**: ni número, ni banco, ni fecha de cobro.

· Por eso **`cambiar_estado_cheque` recibe un `p_cheque_id` de una fila que
  nadie crea.** Tu función está bien; le falta el paso anterior.

· Y no hay vínculo `cheque ↔ pago`: las FK de `cheque` son a `tercero` y a los
  dos asientos, nada más. **Cuando un cheque rebota, no se sabe qué pago canceló
  — y por lo tanto, qué cuota reabrir.**

*Sobre el argumento que usaste para dejarlo sin asiento:* «percibido puro, el
cobro ya se registró» **no aplica acá**. Percibido puro dice **cuándo se
reconoce** el ingreso, no qué pasa cuando el instrumento rebota.

Un cheque rechazado deja **dos cosas falsas** en el diario: un **ingreso
reconocido que no ocurrió** —el haber fue directo a `ING_INSCRIPCIONES` /
`ING_PARTIDOS`, no a Deudores— y un **activo que no existe** en
`VALORES_A_DEPOSITAR`. Sin reversa, esa cuenta acumula cheques rechazados para
siempre.

*Las dos decisiones, encadenadas — la segunda no se puede sin la primera:*

**1 · ¿El cobro con cheque crea la fila en `cheque`?** *(modelo · tu carril)*
Si sí, `registrar_cobro` necesita capturar número, banco y fecha de cobro, y
hace falta **un vínculo con el pago que hoy no existe como columna**.

**2 · Recién entonces, el rechazo.** *(la mecánica ya está clara)*
`anular_asiento` sobre el asiento del cobro —se llega por `origen_id = pago.id`,
y va por contraasiento porque el asiento no se edita (regla 4)—, borrar o marcar
el pago, y **la cuota se reabre sola**: `cuota.pagado_at` es derivado, y
`trg_sync_cuota_pagada` recalcula también en `DELETE`. No hay que tocar `cuota`
a mano.

Lo único que falta para poder escribir esto es el vínculo del punto 1.

---

#### Dos notas de coordinación

**El bloque 8 toca el roadmap de `arquitectura.md` §4.** Cheques y el fondo son
dos de las cuatro pantallas que documenté como «backend construido, falta
front». Si tus funciones se aplican, **Cheques gana lógica y §4 hay que
actualizarlo** — que no lo hagamos los dos por separado.

**El timestamp de tu migración está elegido a mano** (`20260812210000`). Es
exactamente la divergencia repo↔base que quedó documentada en `decisiones.md`
esta misma semana: el CLI compara por versión, así que si la aplicás por MCP la
base registra otro número y `supabase db push` va a querer correrla de nuevo.
Hoy **no colisiona** —ese número quedó libre al renombrar los nueve archivos—
pero conviene usar el que registre la herramienta, o acordar el número antes de
aplicar.

---

#### Aparte · `fix/gastos-errores-humanos`

Buen agregado, y llegó justo: `/gastos/nuevo` acaba de empezar a recibir tráfico
real (ver el aviso de abajo).

**Una cosa para mirar:** traduce los errores **genéricos de Postgres**
—`permission denied`, `not-null`, `foreign key`, `check constraint`— pero **no
los `raise exception` propios de las funciones**. Los mensajes cuidados que
escribiste vos caen en el fallback:

> *«Un retiro en efectivo tiene que decir de qué predio salió la plata, o el
> arqueo de ese día no cierra»*

termina mostrándose como *«No se pudo registrar el pago. (…)»*, que es **peor
que el original**. Valdría dejar pasar el mensaje crudo cuando no matchea
ninguno de los patrones conocidos, o detectar los propios primero.

---

### ⚠ `/gastos/nuevo` empezó a recibir tráfico real · 12/08/2026 · para Horacio

La pantalla existía con 547 líneas y **nada en el repo la enlazaba**: sólo se
llegaba escribiendo la URL a mano. Facu lo marcó como "no se ve cómo agregar un
gasto", y el relevamiento confirmó que no faltaba el formulario, faltaba el
botón.

Desde el rediseño de `/gastos` hay un **«Registrar gasto»** en el encabezado.
**Tu formulario de alta pasa a usarse de verdad**, con lo que eso implica: los
errores que hasta hoy sólo veía quien lo probaba a propósito ahora los va a ver
Guille.

No se tocó una línea de `/gastos/nuevo` ni de `/gastos/[id]/pagar`.

### Encolado · pagos parciales de gasto · carril de Horacio

Salió del rediseño de `/gastos`: **hoy un gasto está pagado o no lo está**.
`gasto.pagado_at` es un timestamp único, así que no existe el estado «parcial»
—a diferencia de las cuotas de equipo, que sí tienen `pago_imputacion`—.

La pantalla muestra `pagado` / `debe` / `anulado` y con eso alcanza mientras los
gastos se paguen de una. **Si empiezan a pagarse en cuotas, es cambio de
modelo:** tabla de pagos de gasto, tocar `pagar_gasto`, y rehacer la derivación
del estado en `v_gasto_detalle`.

*Antes de construirlo hay que preguntarle a Facu si pasa de verdad.*

### Encolado · adjuntar factura o recibo · depende de RLS

Facu lo pidió para `/gastos`. **No hay nada hoy**: cero referencias a `storage`
en el repo, cero buckets creados, ninguna columna de archivo.

Es una capacidad nueva que cruza tres carriles —infra (bucket y políticas),
modelo (tabla o columna), escritura (el upload en el formulario) y display
(mostrar y descargar)— pero eso no es lo que la frena.

**Lo que la frena es la seguridad.** Con RLS apagado en las 48 tablas y la anon
key en el bundle del navegador, un bucket mal configurado deja las facturas del
club —CUIT, razón social, montos— accesibles a cualquiera con la URL. **Va
después de RLS**, o con bucket privado y URLs firmadas desde el servidor.
