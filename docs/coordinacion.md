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

### ✅ Cierre de sesión · nada pendiente de mi lado · 17/08/2026 · para Facu

Repasé todo el archivo de punta a punta. Estado de mi lado:

- **5ta rama de v_cashflow_comprometido** (gastos devengados-impagos): escrita, verificada, en main (`c6d6145`). Con tu OK ya registrado arriba. Sin aplicar, esperando tu revisión.
- **Bloque 8, gasto_planificado, fijos con torneo_id NULL**: todo integrado, según confirmaste en "LEER ANTES DE TOCAR NADA". Limpié mis 6 branches locales (ya redundantes, contenido verificado en main).
- **Pagos parciales de gasto**: sigue sin confirmar si pasa de verdad — no arranco sin tu OK.
- **Adjuntar factura**: sigue esperando RLS.

No tengo nada más para agregar acá. Cuando tengas nueva revisión o tarea, la leo desde el principio del archivo.

---

### 🔴 LEER ANTES DE TOCAR NADA · tu bloque 8 ya está en main · 16/08/2026 · de Facu para Horacio

**Todo el contenido de tus ramas del bloque 8, el eslabón, el fondo y
gasto-planificado ESTÁ EN MAIN** (`9f26264`). Pero entró **por otra vía**, no
mergeando tus ramas.

**Tus cinco ramas quedaron intactas, con los mismos shas. No las mergees ni las
apliques tal cual: pisarían lo que ya entró.** Abajo está exactamente qué hacer.

> **Nada tuyo se descartó.** El eslabón resuelve bien el hueco del caso 2 —con
> `pago_id` se llega del cheque al pago y del pago a las cuotas a reabrir— y la
> caja elegible es tu commit tal cual. Lo que se reorganizó es **cómo** entró,
> por dos cosas que se habrían roto al mergear derecho. Están explicadas al
> final.

---

#### Qué entró, y cómo

| | qué pasó |
|---|---|
| **`registrar_cobro`** | Tu eslabón **combinado sobre la versión del repo** — ver abajo |
| **`cambiar_estado_cheque`** | **Cherry-pick de tu commit `c0a73d3`**, tal cual, con tu autoría |
| **`registrar_movimiento_fondo`** | Tu lógica del fondo, **extraída** a una migración limpia |
| **`gasto-planificado`** | **Mergeado completo**, sin tocar nada |

**`registrar_cobro` · `20260816200000_eslabon_cheque_pago_sobre_repo.sql`**

Tus tres injertos —los params de cheque, la validación de número/banco/fecha, y
el `insert into cheque` con `pago_id`— entraron **exactos**. Lo que cambió es la
base sobre la que se escribieron.

Tu rama lo escribió sobre la versión de **producción**. Pero el repo tenía otra,
mejor, que nunca se había aplicado —era la divergencia repo↔base que veníamos
arrastrando, documentada en `decisiones.md`—. Aplicar la tuya habría perdido, en
silencio:

· la validación `v_agrupado <> v_imputado` con su mensaje *«El asiento cubriría %
  de los % imputados: alguna cuota no resolvió su concepto»*, que dice **qué**
  pasó y no sólo que no cuadra;
· ~44 líneas de comentarios que explican por qué el débito se deriva de los
  grupos y no de `p_monto`, por qué se sacó el fallback a `auth.users`
  (decisión 89) y por qué la imputación tiene que cubrir el pago completo.

**La versión en main tiene las dos cosas: tu funcionalidad y esos comentarios.**
De paso cierra la divergencia, hacia el lado bueno.

**`registrar_movimiento_fondo`** salía de `20260812210000`, que traía **dos**
funciones: el fondo (aprobado) y la `cambiar_estado_cheque` con la caja
hardcodeada (la que la revisión pidió cambiar). Se extrajo **sólo el fondo**, sin
tocarle una línea. Traer el archivo entero habría metido en main una migración
que aplica algo rechazado para corregirlo dos migraciones después.

---

#### 🔴 Lo que tenés que hacer para no pisar main

**1 · `feat/eslabon-cheque-pago` — NO la apliques tal cual.** Su
`registrar_cobro` pisaría el de main con la versión sin comentarios. Al traer
main a tu rama, **borrá `20260814180000_eslabon_cheque_pago.sql`**: su contenido
ya está en main, mejorado.

**2 · `feat/bloque8-caja-elegible` — ídem.** Su `cambiar_estado_cheque` ya está
en main por cherry-pick, y la rama arrastra el eslabón viejo. Al traer main,
**resolvé quedándote con lo de main**.

**3 · `feat/bloque8-funciones-propuesta` — quedó obsoleta.** Su
`cambiar_estado_cheque` fue reemplazada y su fondo está extraído. **Se puede
borrar.**

**4 · Traé main a tus ramas activas antes de seguir**, para partir de lo que ya
está y no reconstruir sobre una base vieja.

---

#### Por qué no se mergeó derecho

Dos cosas se habrían roto, y ninguna tiene que ver con la calidad de tu trabajo:

**La versión buena de `registrar_cobro`** — explicado arriba. Es una divergencia
vieja, anterior a tu rama; te tocó a vos porque tu migración pasaba justo por ahí.

**El orden del historial.** Tus migraciones del bloque 8 tenían timestamps del
**14/08**, que caen **antes** de lo que ya estaba aplicado (`20260816162556` la
siembra, `20260816184239` el ruteo de inversión, `20260816193835` las vistas de
activos). Mergearlas así habría vuelto a meter migraciones nuevas en el pasado
del historial aplicado — el mismo desorden que se acababa de arreglar. Se
renombraron a `20260816201000` y `20260816202000`.

Las de `gasto-planificado` son `20260817*`, ordenan bien, y **no se tocaron**.

---

#### Estado

`supabase db push --dry-run` → **«Remote database is up to date»**. Historial: 73
migraciones, **todas con archivo y registradas, en orden creciente**.

Producción intacta y con las capacidades instaladas **en cero** —`cheque`,
`movimiento_fondo` y `gasto_planificado` sin filas—: 68 asientos, diario
cuadrando en $124.841.267.

**Y el caso 2 del bloque 8 ya se puede construir.** Con `pago_id` en `cheque`, un
cheque rechazado llega al pago y del pago a las cuotas. Era lo único que faltaba
—lo dejaste anotado vos mismo en tu migración— y ahora está.

---

### ✅ OK · dale con la 5ª rama de `v_cashflow_comprometido` · 16/08/2026 · de Facu para Horacio

**Adelante.** Tu diseño coincide con lo que se decidió: los devengados-impagos van
a **comprometido** —es plata pactada con monto cierto, no una estimación—, y
calcar `GREATEST(devengado_at, CURRENT_DATE)` + `fecha_original` + `arrastrada` es
exactamente el patrón de las cuotas vencidas. Un gasto que venció y no se pagó es
lo mismo que una cuota vencida e impaga: se arrastra a hoy y se marca.

**Dejala en migración sin aplicar**, como venís haciendo con todo lo que toca
`v_cashflow_*`.

**Y muy bien haber avisado antes de escribir.** Ése es el protocolo que se pidió:
coordinar antes de **tocar** una vista viva, no sólo antes de aplicarla. Cuando la
vista ya está en producción y una pantalla la usa con datos reales, para cuando
hay algo escrito la conversación ya arranca torcida. Seguí así.

---

#### Las otras dos, breve

**Los fijos con `torneo_id = NULL`:** bien resuelta. Presupuesto nuevo sobre el
mismo ejercicio y las 2 líneas movidas, dejando las 4 variables del torneo sin
tocar, es exactamente el alcance. **El trigger opcional está bien dejarlo para
después** — no era parte de la tarea y sumarlo habría ampliado el cambio.

**Sacar `unico` de la vista:** correcto, y el mismo tratamiento que `anual` es el
criterio adecuado — trampa latente, sin uso hoy, se resuelve con el primer caso
real en vez de con una hipótesis. Tu salida —**migrar esas líneas a
`gasto_planificado`**, que ya tiene fecha propia y vínculo, en vez de inventarle
una convención a `presupuesto_linea`— queda anotada como el camino cuando
aparezca el primer caso.

---

#### Un cuidado, con el detalle exacto

**El timestamp: usá el que registre la herramienta.** Ya te lo marcamos, pero hay
un caso concreto que conviene que veas antes de aplicar nada, porque no todas tus
migraciones están igual:

| rama | archivo | situación |
|---|---|---|
| `eslabon-cheque-pago` · `bloque8-caja-elegible` | `20260814180000`, `20260814190000` | ⚠️ **caen ANTES** de lo ya aplicado |
| `gasto-planificado` | `20260817100000` … `20260817120000` | ordenan bien, sólo hay que renombrarlas |

Producción ya tiene aplicadas `20260816162556` (siembra), `20260816184239` (ruteo
de inversión) y `20260816191333` (asentar_amortizacion). **Las dos del 14/08
quedarían en el pasado de un historial ya aplicado**, que es peor que un simple
desfase de nombre. Las del 17/08 sólo necesitan renombrarse a la versión que
quede registrada.

---

### ✅ Tomada · los fijos van con torneo_id = NULL · para Facu

La tomé — está en `feat/gasto-planificado`. Presupuesto nuevo (torneo_id NULL, mismo ejercicio 2026) + las 2 líneas fijas (Sueldos administrativos, Alquileres) movidas ahí. El presupuesto del torneo queda con sus 4 líneas variables sin tocar. Verificado con begin/rollback, sin aplicar.

No agregué el trigger opcional que mencionaste (espejo de check_gasto_coherente en presupuesto_linea) — lo dejo para después si te parece que hace falta, no quería meter más cambios de los que pediste explícito en la tarea.

---

### 🔧 Aviso · voy a agregar una rama a v_cashflow_comprometido · para Facu

Empecé a construir lo acordado (gasto_planificado ya está en `feat/gasto-planificado`, sin aplicar). Para los 7 gastos devengados-impagos, dijiste que van como rama de comprometido — reviso `v_cashflow_comprometido` para calcar el patrón, y confirmo: es un `UNION ALL` de 4 SELECTs con `GREATEST(fecha, CURRENT_DATE)` / `fecha_original` / `arrastrada`.

Voy a agregar una 5ta rama por `UNION ALL`, sin tocar las 4 que ya están — mismo criterio que elegí para v_cashflow_estimado (aditivo, no modificar lo existente). La rama nueva: gastos con `devengado_at is not null and pagado_at is null`, calcando `GREATEST(devengado_at, CURRENT_DATE)` como fecha y `devengado_at < CURRENT_DATE` como arrastrada, igual que hacés con vence_at en las otras 3 ramas.

Como v_cashflow_comprometido está en producción y la toca /proyeccion, lo dejo en migración sin aplicar como todo lo demás — pero quería avisarte antes de escribirla, ya que me pediste explícito coordinar cualquier cosa que toque vistas vivas antes de tocar, no solo antes de aplicar.

Si no tenés objeción, la escribo y la dejo en el mismo branch.
---

### ↩️ Respuesta · unico queda afuera de la vista, por ahora · para Facu

Tenías razón con el hueco: usé `ejercicio.fecha_desde` como fecha de `unico`, y no hay tal convención — vos lo dijiste explícito, no hay columna de fecha en `presupuesto_linea`. Y sin vínculo, esa rama quedaba sin anti-doble-conteo.

Saqué `unico` de `v_cashflow_gastos_estimado_extra` — mismo tratamiento que le diste a `anual`: trampa latente, ninguna línea la usa hoy, se resuelve cuando aparezca el primer caso real. Si aparece, la salida más limpia es migrar esas líneas a `gasto_planificado` (que ya tiene fecha propia y vínculo), no inventarle una convención a `presupuesto_linea`.

La vista queda con una sola rama por ahora (`gasto_planificado`, pendientes). En `feat/gasto-planificado`, verificada compilando junto con la tabla.

Sobre `por_mes`: gracias por frenarlo antes de que llegara a aplicarse — lo tenía en el plan y habría roto el cashflow en silencio con el torneo actual sin fechas. Sacado del alcance, como pediste.

Sigo con la 5ta rama de `v_cashflow_comprometido` (los 7 devengados-impagos) — ver el aviso de abajo, sigue esperando tu OK antes de escribirla.
### ❌ Corrección · `por_mes` NO se toca · 16/08/2026 · de Facu para Horacio
**Leé esto antes de escribir la vista.** La propuesta de gastos futuros te pedía
*«corregir `por_mes` a los meses del torneo»*. **Ese punto estaba equivocado**, y
lo tomaste en tu plan de construcción. **Sacalo.**

**Lo actual es lo correcto.** `v_cashflow_estimado` genera los fines de mes sobre
`ejercicio.fecha_desde..fecha_hasta` —los 12 meses del año— y así tiene que
quedar: **los gastos fijos son anuales por diseño.** Alquiler y sueldos se pagan
los 12 meses, **haya torneo o no**. Por eso el estimado muestra −$4.700.000 en
diciembre aunque el torneo termine en noviembre: no es un desborde, es la
estructura corriendo todo el año.

**Y el cambio habría roto el cashflow hoy mismo, en silencio:**

| torneo | `fecha_desde` | `fecha_hasta` | |
|---|---|---|---|
| **Clausura 2026** | **NULL** | **NULL** | ⚠️ `generate_series` daría **cero filas** |
| Apertura 2027 | 2027-03-01 | 2027-07-31 | ok |

**El torneo en curso no tiene fechas cargadas.** Usar las del torneo habría
borrado los −$4.700.000/mes sin error y sin advertencia — el peor modo de falla,
porque el número que queda sigue siendo plausible.

*El punto ya quedó corregido dentro de la propuesta misma, más abajo.*

---

### ↩️ Respuesta · las 3 del cashflow · 16/08/2026 · de Facu para Horacio

Van las tres que pediste para arrancar.

---

#### 1 · ¿Qué fecha lleva un gasto `unico`?

**Fecha propia**, la que se planea gastarlo. **No** el arranque del ejercicio.

*El dato que te falta:* **`presupuesto_linea` no tiene ninguna columna de fecha.**
Así que un `unico` sale de una convención, o migra a `gasto_planificado`.

> **⚠️ El cabo suelto de tu decisión.** Elegiste que `unico` y `gasto_planificado`
> vayan como **dos entradas del mismo mecanismo**, en tablas separadas. Con eso,
> **sólo `gasto_planificado` tiene dónde colgar `planificado_id`** — un `unico` de
> `presupuesto_linea` no tiene columna para el vínculo, y **queda sin
> anti-doble-conteo** (ver respuesta 3: es justo la rama que lo necesita).
>
> O migran los `unico` a `gasto_planificado`, o esa rama queda descubierta.
> **Decisión tuya**, pero conviene tomarla antes de escribir la vista.

---

#### 2 · `por_mes` corregido

**No lo toques.** Ver la corrección de arriba.

---

#### 3 · Excluir lo ya devengado

Es **más simple de lo que asumías**, y la respuesta cambia según la rama.

**Para `por_partido`, `por_dia_cancha` y `por_mes`: no hace falta nada.** Ni
modelo nuevo ni restar por monto. **La fecha ya lo resuelve estructuralmente** —
`v_cashflow_estimado` proyecta sólo `fecha > CURRENT_DATE`, y lo ya gastado
corresponde a jornadas cumplidas, que el estimado no toca. Verificado:

| | |
|---|---|
| hoy | 2026-08-16 |
| fecha mínima del estimado | 2026-08-22 |
| gastos con `devengado_at` futuro | **0** (los 12 son pasados) |
| filas del estimado en fecha pasada | **0 — cero solapamiento** |
| jornadas ya jugadas / futuras | 33 no se proyectan / 250 sí |

**No filtres por monto acumulado en estas tres:** agregaría una resta sobre algo
que ya está excluido, y **descontaría dos veces**.

**Para `unico` y `gasto_planificado`: sí hace falta, y por vínculo.** Van a una
fecha elegida que puede ser futura, así que el solapamiento es real. Se resuelve
con **el vínculo que ya creaste** en `feat/gasto-planificado`: es la opción (a),
**acotada a donde hace falta** — no un `presupuesto_linea_id` global.

> *Nota:* lo modelaste como **`gasto_planificado.gasto_id`**, al revés de lo que
> decía la propuesta (`gasto.planificado_id`). **Está bien así** — la FK vive en
> la tabla nueva y no le agrega una columna a `gasto`. Sólo lo dejo dicho para que
> no crees las dos: **con la tuya alcanza.**

**Descartá la opción (b) —acumulado por categoría.** Dos razones medidas:

· **El cruce por torneo falla.** Alquileres está presupuestado bajo Clausura 2026
  y sus gastos reales van con `torneo_id = NULL`: **$777.000 que el cruce no ve**
  (ver la tarea de abajo, que es esta misma causa).
· **No hay ningún `unique`** que garantice una línea por categoría — ni en
  `presupuesto_linea` ni en `presupuesto`. Dos líneas de la misma `cat_gasto` son
  legales, y ahí el acumulado no sabe a cuál restarle.

**El borde a vigilar:** un gasto atado a una jornada **futura** sí duplicaría.
**Hoy hay 0 casos** —los 7 gastos con jornada son todos de jornadas ya jugadas—
pero es el caso a tener presente.

---

### 🔧 Tarea · los fijos van con `torneo_id = NULL` · sin dueño asignado

**Arreglo de datos, zona libre — a coordinar quién la toma.**

*El problema:* las líneas de presupuesto de gastos fijos —**Sueldos
administrativos** y **Alquileres**— están cargadas bajo **Clausura 2026**. Pero
los gastos fijos **reales** van con `torneo_id = NULL`, y no por criterio de quien
carga: **el trigger lo obliga**.

```sql
-- check_gasto_coherente
if nat = 'recurrente' and new.torneo_id is not null then
  raise exception 'Los gastos recurrentes son de estructura, no de un torneo';
end if;
```

Es la regla 3: la estructura permanente no se prorratea entre torneos.

*Por qué quedó así:* **`presupuesto` y `presupuesto_linea` no tienen ningún
trigger.** Nada valida del lado del plan lo que la base sí exige del lado real.

*Qué rompe:* el cruce presupuesto ↔ real. Es la causa exacta de los **$777.000**
de Alquileres que no cruzan. Y **11 de las 32 categorías son `recurrente`** —las
11 con `unidad_default = 'por_mes'`—, así que en cuanto se presupuesten, todas
caen en lo mismo.

*El arreglo:* un presupuesto con **`torneo_id = NULL`** para el ejercicio 2026, y
mover ahí las 2 líneas `por_mes`. El modelo ya lo admite: `presupuesto.torneo_id`
es anulable y el DDL lo documenta como *«NULL = presupuesto de estructura anual»*.

*Opcional, para que no vuelva a pasar:* un trigger en `presupuesto_linea` que
espeje `check_gasto_coherente` — una línea `recurrente` no puede colgar de un
presupuesto con torneo.

> **No afecta al cashflow.** `por_mes` cuelga del **ejercicio**, y `ejercicio_id`
> es `NOT NULL` en todo presupuesto, así que el reparto temporal sale bien igual.
> Lo que arregla es el **cruce con lo real** y la lectura por torneo.

---
### ↩️ Respuesta · unico vs gasto_planificado · para Facu

Van como **dos entradas del mismo mecanismo**, no unificadas en una tabla. `presupuesto_linea` con `unidad='unico'` y `gasto_planificado` siguen siendo tablas separadas, pero la vista nueva (`v_cashflow_gastos_estimado_extra`) lee de las dos con una rama compartida — mismo shape de salida (fecha, monto, detalle), origen distinto.

Razón: es el movimiento menor, coherente con elegir (c) para el resto — evito migrar `unico` fuera de `presupuesto_linea` ahora. Si más adelante conviene unificar en una sola tabla, se hace con las dos fuentes ya funcionando por separado, no a ciegas.

Con esto las 3 decisiones están cerradas. Empiezo a construir:
1. Migración: tabla `gasto_planificado` + `gasto.planificado_id` (vínculo, mismo patrón que `cheque.pago_id`)
2. Vista `v_cashflow_gastos_estimado_extra`: rama `unico` (de presupuesto_linea, filtrando ya devengado) + rama `gasto_planificado` (no ejecutados) + `por_mes` corregido (fechas del torneo, no del ejercicio) + los 7 gastos devengados-impagos con GREATEST(devengado_at, CURRENT_DATE), calcando el patrón de v_cashflow_comprometido
3. Todo en migración sin aplicar, para tu revisión — mismo patrón que el bloque 8

Antes de aplicar te va a llegar la propuesta acá.

---

### ↩️ Respuesta · gastos futuros en el cashflow · para Facu

Voy con **(c) — vista nueva, aditiva, sin tocar `v_cashflow_estimado`**. Las otras dos tocan una vista en producción que `/proyeccion` usa ahora mismo con datos reales (602 filas, −$94.250.000); (c) no le cambia una línea. El costo de partir la lógica en dos lugares lo prefiero al riesgo de romper lo que ya funciona.

**Diseño propuesto** (`v_cashflow_gastos_estimado_extra`, nombre a discutir):

- **`unico`**: una fila por `presupuesto_linea` con `unidad='unico'`, en una fecha. ¿Qué fecha? Sugiero `presupuesto.fecha_desde` del ejercicio como default, pero es justo el punto que necesito que confirmes — ¿hay algún dato de "cuándo" para un gasto único, o asumo el arranque del ejercicio/torneo?
- **`anual`**: mismo caso, ¿una fecha fija (inicio de ejercicio) o se reparte?
- **`por_mes` corregido**: cambio el rango de `ejercicio.fecha_desde/fecha_hasta` a las fechas del TORNEO. Viendo `v_presupuesto_total`, `p.torneo_id` ya está disponible — voy a necesitar `min(jornada.fecha)` y `max(jornada.fecha)` del torneo en vez de las del ejercicio. Si un torneo no tiene jornadas con fecha, ¿la línea `por_mes` de ese torneo no aporta nada (igual que `por_partido`/`por_dia_cancha` con calendario vacío), o necesita un fallback?
- **Excluir lo ya devengado**: para no duplicar, filtro por `presupuesto_linea` que no tenga ya un `gasto` devengado equivalente. ¿Existe un vínculo `gasto ↔ presupuesto_linea`, o el anti-doble-conteo es a nivel de categoría/monto acumulado (restar lo ya devengado de esa cat_gasto en el período, sin vínculo fila a fila)? Esto es lo que más necesito que definas antes de escribir la vista — es la pieza que decide si hace falta modelo nuevo o es solo SQL.

**Sobre TIPO B (gasto_planificado)**: de acuerdo con tabla propia, no reusar presupuesto_linea. Cuando definamos lo de arriba, armo la migración de la tabla + el vínculo gasto.planificado_id (mismo patrón que cheque.pago_id) + la rama en la vista nueva.

**El hueco de los 7 gastos devengados sin vencimiento**: de acuerdo en que necesita una columna en `gasto` (¿`vence_at`? ¿se deriva de algo?). Lo dejo para después de lo de arriba, es más chico.

No empiezo a escribir código hasta tener las 3 respuestas de arriba — son las que definen si esto es una vista con SQL nuevo o si primero hace falta un vínculo de modelo, como pasó con cheques.

---

### 💡 Propuesta · gastos futuros en el cashflow · 16/08/2026 · de Facu para Horacio

**Diseño de Facu, implementación de Horacio.** Toca `v_cashflow_*` y necesita
modelo nuevo, así que es tu carril.

Cubre **dos tipos de gasto futuro**, y se apoya en el patrón que ya usás para los
ingresos comprometidos en vez de inventar uno nuevo.

**Es propuesta, no orden.** Si algo no cierra con cómo tenés armado el cashflow,
discutámoslo acá antes de que lo implementes.

> **Estado · las tres decisiones abiertas quedaron resueltas** (16/08). Están
> marcadas **✅ Resuelto** donde corresponde: el doble conteo del Tipo A, la fecha
> del gasto `unico`, y la fecha de los gastos impagos. Queda **una sola cosa para
> que decidas vos**, dentro del Tipo A: **cómo** garantizar que el presupuesto no
> se duplique. El **qué** ya está cerrado.

---

#### Punto de partida · qué hay hoy

Para que no construyas dos veces, el estado medido en producción:

| nivel | qué proyecta | hoy |
|---|---|---|
| `v_cashflow_real` | lo que ya tocó caja | 14 filas · +$11.552.000 |
| `v_cashflow_comprometido` | cuotas de equipo y sponsor | 277 filas · +$267.453.000 |
| `v_cashflow_estimado` | **gastos del presupuesto** | 602 filas · **−$94.250.000** |

**El nivel estimado ya proyecta gastos del presupuesto, y ya los ubica en el
tiempo** — hace `join` contra las fechas del calendario, con una rama por unidad:

| mes | por_partido | por_dia_cancha | mensual |
|---|---|---|---|
| 2026-08 | −6.300.000 | −3.200.000 | −4.700.000 |
| 2026-09 | −15.900.000 | −6.400.000 | −4.700.000 |
| 2026-10 | −18.000.000 | −6.400.000 | −4.700.000 |
| 2026-11 | −12.150.000 | −2.400.000 | −4.700.000 |
| 2026-12 | — | — | −4.700.000 |

Y las dos ramas de **egreso comprometido** ya están escritas: `compromiso` con
`sentido='pagar'` y `cheque` con `sentido='emitido'`. No aportan nada porque las
dos tablas están vacías, no porque falte el código.

Lo que sigue **extiende esto**, no lo reemplaza.

---

#### TIPO A · gastos estructurales, de fórmula

Los que salen del presupuesto y escalan con el torneo.

**Distribución por unidad de `presupuesto_linea`:**

| unidad | cómo se ubica en el tiempo | estado |
|---|---|---|
| `por_partido` | por los partidos de cada jornada, en la fecha de esa jornada | **ya funciona así** |
| `por_dia_cancha` | ídem, por día de cancha | **ya funciona así** |
| `por_mes` | parejo por los **meses del ejercicio** (los 12 del año) | **ya funciona así — NO tocar** |

Las tres ya reusan el mecanismo de ingresos. **Ninguna hay que cambiarla.**

> **❌ CORREGIDO · esta propuesta decía «`por_mes` parejo por los meses del
> TORNEO», y estaba MAL.** Ver *«Corrección · `por_mes` no se toca»* arriba de
> todo en Avisos abiertos. El comportamiento actual —los meses del **ejercicio**—
> es el correcto: los gastos fijos son anuales por diseño. **Si tomaste ese punto
> en tu plan de construcción, sacalo.**

*Nota de precisión:* `presupuesto_linea` **no tiene `naturaleza`** — tiene
**`unidad`** (`por_partido`, `por_dia_cancha`, `por_mes`, `anual`, `unico`).
`naturaleza` vive en `cat_gasto` y es otro eje.

**Excluir lo ya devengado.** Proyectar sólo lo que falta gastar, para no contar
dos veces lo que ya entró como gasto real. Es el mismo principio que ya aplicás
en ingresos, donde la cuota entra por `saldo` y no por `monto`. **Hoy no está:**
`v_cashflow_estimado` filtra sólo `fecha > CURRENT_DATE`.

**Las dos unidades que faltan.** `anual` y `unico` **no tienen rama** en
`v_cashflow_estimado`: una línea con esas unidades suma en el presupuesto y
desaparece de la proyección, sin aviso. Hoy es trampa latente —ninguna línea las
usa— pero **10 de las 32 categorías tienen `unico` como `unidad_default`**, y son
justo las de gastos grandes de una vez (Compras e insumos, Equipamiento,
Proveedores).

> **✅ Resuelto · `unico` va a la fecha en que se planea.**
>
> Un gasto `unico` **no se distribuye**: no lo multiplica la escala ni lo ubica el
> calendario. Tiene **fecha propia**, y esa fecha es cuando se planea gastarlo.
>
> **Y acá está lo importante: eso es exactamente el TIPO B.** Un gasto `unico` del
> presupuesto **es** un gasto planificado con fecha — mismo patrón, monto y fecha
> propios, sin fórmula detrás. Las dos cosas que parecían separadas son una.
>
> **Mirá si conviene unificarlos** —que `unico` deje de ser una unidad de
> `presupuesto_linea` y pase a ser una fila de `gasto_planificado`— **o tratarlos
> como dos entradas del mismo mecanismo**, con una sola rama en el cashflow que
> lea de las dos fuentes. Lo segundo toca menos; lo primero deja un solo lugar
> donde vive «gasto con fecha propia». Es tu llamada.
>
> El costo de no unificarlos: la misma idea modelada en dos tablas, y el día que
> haya que cambiarla hay que acordarse de las dos.
>
> **`anual` queda pendiente aparte.** Sin rama y sin uso — **no bloquea nada**. Se
> resuelve cuando aparezca la primera línea que la necesite, y ahí habrá un caso
> real con el que decidir en vez de una hipótesis.

**Límite:** sólo torneos **con calendario**. Sin jornadas con fecha, el factor de
`por_partido` y `por_dia_cancha` es 0 — y eso no da «un total sin fecha», da
**$0**. Ojo también con que `jornada.fecha` es anulable: un fixture sin fechas
tampoco entra, porque el filtro descarta los nulos.

> **✅ Resuelto · la salida técnica la elegís vos; el invariante no se negocia.**
>
> **El invariante: el presupuesto tiene que aparecer UNA sola vez en
> `v_cashflow`.** Hoy da **−$94.250.000**. No puede pasar a −$188.500.000.
>
> Esto importa porque la propuesta original pedía una vista **nueva** aditiva sin
> tocar `v_cashflow_estimado`, y tal cual duplicaba: las mismas líneas entrarían
> dos veces al `UNION ALL`, **sin error y sin advertencia**. Un egreso proyectado
> al doble sigue siendo un número plausible, y por eso no se cuestiona.
>
> **Cómo lo garantices es decisión tuya.** Tres salidas que sirven — cualquiera
> de las tres, o una cuarta que se te ocurra:
>
> **(a)** Extender `v_cashflow_estimado` con los cambios de arriba. Es el menor
> cambio y no duplica, pero toca una vista que ya está en producción.
> **(b)** Crear `v_cashflow_gastos_estimado` **y sacar el presupuesto de**
> `v_cashflow_estimado`, que quedaría para otras estimaciones. Más limpio de leer,
> más movimiento.
> **(c)** Vista nueva sólo para lo que hoy **no** está —`unico` y la corrección de
> `por_mes`— dejando las dos ramas que ya funcionan donde están. Aditivo de
> verdad, al costo de partir la misma lógica en dos lugares.
>
> Facu no tiene preferencia entre ellas: **el requisito es el resultado, no el
> camino.** Si elegís otra, decila acá y listo.

---

#### TIPO B · gastos puntuales planificados

El caso *«se rompió un arco y hay que comprarlo el mes que viene»*: monto y fecha
propios, **sin fórmula ni escala detrás**. Hoy **no hay dónde guardarlos** —
verificado: no existe ninguna tabla para esto.

**Tabla nueva `gasto_planificado`**, con monto, fecha esperada, descripción,
`cat_gasto` y estado/flag de ejecutado.

*Decisión de Facu: tabla propia, no reusar `presupuesto_linea`.* Esa tabla modela
gastos **de escala** —una tarifa que se multiplica por partidos o meses—, y un
gasto puntual no tiene ni tarifa ni multiplicador. Meterlo ahí obligaría a
`unidad = 'unico'` con `cantidad = 1` y una fecha que la tabla no tiene.

> **↑ Ojo con el Tipo A:** un gasto de unidad `unico` **es este mismo patrón**
> —monto y fecha propios, sin fórmula—. Ver *«`unico` va a la fecha en que se
> planea»* más arriba: hay que decidir si se unifican en esta tabla o si son dos
> entradas del mismo mecanismo. **Las dos mitades de esa decisión son una sola.**

**El cashflow estimado la lee:** cada gasto planificado no ejecutado aparece como
egreso en su fecha.

**Al pagarse de verdad, sale del estimado.** Se marca ejecutado y el gasto real lo
reemplaza — mismo principio anti-doble-conteo que el tipo A.

> **Pieza a modelar: el vínculo.** Para saber cuál marcar al pagar hace falta una
> columna tipo `gasto.planificado_id`. **Es el mismo tipo de eslabón que falta en
> `cheque` ↔ `pago`** — y ese caso ya mostró qué pasa cuando no está: la función
> que cambia el estado recibe un id de una fila que nadie vinculó. Vale la pena
> resolverlo de entrada acá.

---

#### Notas

**Todo aditivo a propósito.** La tabla es nueva y la vista se enchufa al
`UNION ALL` — `v_cashflow` sólo consume `fecha, nivel, origen, detalle, monto`,
así que cualquier rama nueva entra sola respetando esas cinco columnas y el signo
(**no hay columna `sentido`: el signo del monto ES el sentido**). **No choca con
el bloque 8.**

**El principio unificado de todo el cashflow futuro:** *lo estimado es lo que
todavía no ocurrió; cuando ocurre, pasa al real y sale del estimado.* Vale para
ingresos (ya lo hacés, vía `saldo`), para los gastos de presupuesto (tipo A) y
para los planificados (tipo B).

**Un hueco aparte, que no cubre ninguno de los dos tipos:** hay **7 gastos
devengados e impagos por $12.194.767** que no están en **ningún** nivel del
cashflow. No están en real (no tocaron caja), ni en comprometido (esa vista no lee
`gasto`), ni en estimado (no son presupuesto). Es plata pactada con monto cierto,
así que va como rama de **comprometido**.

> **✅ Resuelto · van «ya»: al corto plazo inmediato.**
>
> Están **vencidos e impagos**, así que no se proyectan a una fecha futura: entran
> en **la próxima semana / el próximo período**. Es plata que hay que pagar ahora,
> y el cashflow tiene que mostrarla ahora.
>
> **Esto NO es agregarle vencimiento a `gasto`.** Son dos cosas distintas y
> conviene no mezclarlas:
>
> · **Lo de acá** — «ya venció, va al cashflow inmediato». No necesita columna
>   nueva: se resuelve con la fecha que ya existe.
> · **Fecha de pago pactada por gasto** —«a este proveedor le pagamos a 30 días»—
>   sí necesitaría una columna de vencimiento. **Es otra cosa, y va aparte** si
>   algún día se quiere.
>
> *Un dato que te ahorra trabajo:* el patrón que ya usás en
> `v_cashflow_comprometido` **hace exactamente esto**. `GREATEST(vence_at,
> CURRENT_DATE)` arrastra lo vencido a hoy, `fecha_original` conserva la fecha
> real y `arrastrada` marca que se movió. La rama de gastos impagos puede calcarlo
> con `devengado_at` en lugar de `vence_at` — y de yapa quedan marcados como
> arrastrados, que es justo lo que son.

**El propósito 1 —pantalla de presupuesto y tarifas para torneo futuro— es
aparte, lo encara Facu.**

---

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
