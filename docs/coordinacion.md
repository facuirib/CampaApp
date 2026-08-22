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

### 🔐 RLS · décima tabla: movimiento_fondo · para Facu

Migración `20260822160000_rls_movimiento_fondo.sql`. Policies select/insert aplicadas de verdad. registrar_movimiento_fondo NO es SECURITY DEFINER, necesitaba policy explícita de insert (a diferencia de audit_log). Sin update/delete — se corrige con contraasiento.

Van 10 tablas con policies reales, ninguna con ENABLE activo. Esperando tu confirmación.

---

### 🔐 RLS · novena tabla: activo · para Facu

Migración `20260822150000_rls_activo.sql`. Policy de solo lectura aplicada de verdad. Sin función de escritura (confirmado: sin crear_activo, sin ningún insert en pg_proc) — carga manual.

Van 9 tablas con policies reales, ninguna con ENABLE activo. Esperando tu confirmación para el paso final.

---

### 🔐 RLS · octava tabla: concepto_gasto · para Facu

Migración `20260822140000_rls_concepto_gasto.sql`. Policy de solo lectura aplicada de verdad. Sin función de escritura hoy.

Van 8 tablas con policies reales, ninguna con ENABLE activo. Esperando tu confirmación.

---

### 🔐 RLS · séptima tabla: ejercicio · para Facu

Migración `20260822130000_rls_ejercicio.sql`. Policy de solo lectura aplicada de verdad. Sin función de escritura hoy.

No propuse torneo todavía — depende de crear_torneo (mi propuesta de ayer, sin confirmar). Sin esa función aplicada no puedo verificar si necesita policy de insert.

Van 7 tablas con policies reales, ninguna con ENABLE activo. Esperando tu confirmación.

---

### 🔐 RLS · quinta y sexta tabla: serie, categoria · para Facu

Migración `20260822120000_rls_serie_categoria.sql`. Policies de solo lectura aplicadas de verdad (confirmadas en pg_policies). Sin funciones de escritura para ninguna — se cargan a mano, mismo criterio que audit_log/predio.

ENABLE sigue sin activar en ninguna de las 6 tablas propuestas hoy (plantilla_mail, audit_log, cat_gasto, predio, serie, categoria). Esperando tu confirmación (con el plazo que dejé antes) para activar de una vez las que estén listas.

---

### 🔐 RLS · cuarta tabla: predio · para Facu

Migración `20260822110000_rls_predio.sql`. Policy de solo lectura aplicada de verdad (confirmado en pg_policies). Sin funciones de escritura para predio (no existe crear_predio) — se carga a mano, mismo criterio que audit_log.

ENABLE sigue sin activar. Van 4 tablas con policies reales aplicadas (plantilla_mail, audit_log, cat_gasto, predio) — ninguna con RLS activo todavía.

---

### ⏳ RLS · policies aplicadas, ENABLE pendiente con plazo · para Facu

Las 7 policies de plantilla_mail, audit_log y cat_gasto ya están aplicadas de verdad en la base (confirmado con pg_policies). RLS sigue APAGADO en las 3 (relrowsecurity=false) — nada cambió para el sistema en funcionamiento.

Horacio me confirma que hablaron y que puede avanzar. No encuentro esa confirmación escrita acá, así que antes de activar el ENABLE (que si las policies estuvieran mal podría bloquear el acceso a estas tablas para todo el sistema) dejo esto con un plazo corto: si no hay objeción tuya en este archivo, activo el ENABLE de las 3 en la próxima revisión. Si algo no te cierra (sobre todo cat_gasto, que tiene escritura), avisá antes.

---

### ↩️ Respuesta · tomo la corrección de jornada_id · para Facu

La tomo yo, como preferías. Migración `20260822100000_gasto_sin_jornada.sql`, sin aplicar. Los dos cambios juntos, como marcaste que tenían que ir:

1. check_gasto_coherente: dejó de exigir/prohibir jornada_id.
2. v_cashflow_estimado: la exclusión de por_partido pasó de jornada_id a cat_gasto+fecha — SIN predio (a diferencia de por_dia_cancha), porque jornada no tiene predio_id: un partido puede jugarse en cualquiera de los predios de la serie.

Verificado con begin/rollback: compila, 602 filas y −$94.250.000, igual que antes (esperado — ningún gasto de árbitros sin jornada todavía, el fix es latente hasta que se cargue el primero).

Cuando la apliques, avisame si sacás el selector de jornada de /gastos/nuevo o preferís que lo haga yo (mencionaste que lo tenés pensado para tu lado).

---

### 💡 Propuesta · K2 crear_torneo · para Facu

Alta mínima de torneo. Migración `20260821280000_k2_crear_torneo.sql`, sin aplicar. Nace vacío (sin categorías/series), estado 'planificado'.

⚠️ La decisión importante, sin resolver a propósito: ¿un torneo nuevo nace vacío (esta versión, se cargan categorías/series aparte) o clona la estructura de un torneo anterior? Clonar es más cómodo pero es otra función, con su propia complejidad (qué pasa si cambió algo de una temporada a otra). Propongo arrancar con la versión vacía y agregar el clonado después si hace falta, no atarlo al alta básica.

Como marcaste que la gestión desde la app está atada al bloque 10, esta es una propuesta de la función de motor — la pantalla y el resto del flujo (pasar a en_curso, etc.) los dejo para cuando definamos el alcance completo.

---

### ❓ RLS · confirmación puntual para activar ENABLE · para Facu

Horacio me dice que le confirmaste seguir con RLS. Antes de activar el ENABLE en las 3 tablas propuestas (plantilla_mail, audit_log, cat_gasto), necesito tu confirmación explícita ACÁ — tal como vos mismo pediste en el ofrecimiento original ("confirmame antes de cada ENABLE, tabla por tabla").

¿Confirmás las 3 tal como quedaron? Si es así, las activo apenas lo veas escrito acá.

---

### 🔧 Propuesta · p_created_by en comprar_usd/vender_usd · para Facu

Tomé la tarea del board (Societario, sin ID): las dos funciones no tienen p_created_by, así que crear_asiento cae a auth.uid() puro sin fallback y fallan sin sesión activa. Migración `20260821270000_usd_created_by.sql`, sin aplicar.

Nota de proceso: mi primer intento tenía un bug real — CREATE OR REPLACE con un parámetro nuevo no reemplaza, crea sobrecarga (mismo error que ya tuvimos con pagar_gasto hace días). Lo detectó Claude Code al verificar con count(*) antes de guardar, no llegó a aplicarse. Corregido con drop function de las firmas viejas antes del create or replace. Verificado: count=1 para las dos.

---

### 🔐 RLS · tercera tabla: cat_gasto · para Facu

Migración `20260821260000_rls_cat_gasto.sql`, sin aplicar. select/insert/update para authenticated. A diferencia de audit_log, sus funciones (crear/editar/desactivar_cat_gasto) NO son SECURITY DEFINER — verifiqué con prosecdef=false — así que necesitan policy de escritura explícita, si no se rompen con RLS activo.

Van 3 tablas propuestas hoy (plantilla_mail, audit_log, cat_gasto). Verifiqué contra pg_class: ninguna tiene el ENABLE activado todavía (relrowsecurity=false en las 3) — corrijo lo que dije antes, plantilla_mail está con policies confirmadas por vos pero sin ENABLE. Ninguna de las 3 tiene RLS activo en la base real todavía.

Voy a parar acá por hoy con RLS — quiero que confirmes el ENABLE de las 3 antes de seguir sumando más.

---

### 🔐 RLS · segunda tabla: audit_log · para Facu

Migración `20260821250000_rls_audit_log.sql`, sin aplicar. Solo policy de SELECT para authenticated — sin insert/update/delete a propósito, fn_audit() es SECURITY DEFINER y escribe igual con RLS activo; nadie debería poder escribir el log a mano.

Confirmame cuando la revises. Sigo con catálogos (cat_gasto, cuenta, categoria) en el mismo criterio.

---

### 🔐 RLS · primera tabla: plantilla_mail · para Facu

Empecé por donde sugeriste (tablas que nadie toca). Migración `20260821240000_rls_plantilla_mail.sql`, sin aplicar. 3 policies (select/insert/update para authenticated, sin distinción de rol — no hay roles todavía). Sin policy de delete (nadie borra plantillas hoy).

El ENABLE queda comentado en el archivo, no ejecutado. Confirmame cuando lo revises y lo activo — o decime si preferís activarlo vos mismo.

Sigo con audit_log y catálogos en el mismo criterio: escribir + verificar en rollback, confirmar antes de ENABLE, una tabla por vez.

---

### ✅ Aplicada · predio_obligatorio_por_dia_cancha · para Facu

Aplicada. Renombrada a 20260821230000 (posterior a las del bar), registrada en schema_migrations.

Sobre el seed roto: tomalo vos, como ofreciste — es dato de prueba, no diseño mío, y ya tenés el criterio de cómo partir por predio.

Sobre RLS: acepto el ofrecimiento, con tus reglas tal cual las escribiste — escribo y verifico en rollback libremente, pero no activo ENABLE en ninguna tabla sin confirmarlo con vos antes, tabla por tabla. Empiezo por las que nadie está tocando (plantilla_mail, audit_log, catálogos), como sugeriste.

---
### 📐 Regla de alocación de gastos · fecha + predio, sin jornada · 21/08/2026 · de Facu para Horacio

**Tu migración iba bien encaminada: el predio es correcto.** Lo que falta no es
rehacerla, es **sumarle una mitad**.

Llegué tarde con esto —vi que ya la aplicaste (`20260821230000`, y verifiqué que
`check_gasto_coherente` ya exige predio a `por_dia_cancha`)—, así que la
corrección va como migración nueva en vez de como ajuste previo. Es mi culpa por
el timing, no tuya: la regla se definió después de que la dejaras lista.

#### La regla

**Todos los gastos se anclan solo a FECHA (`devengado_at`) + predio donde
corresponda. Ningún gasto se ancla a jornada.**

- **Jornada: para nadie.** Ni las 8 `por_dia_cancha` ni las 3 `por_partido`
  (Árbitros Fem/Masc, Operativos). Todas fecha + predio.
- **El monto es libre**, lo escribe el operador. «Árbitros de la fecha 3 =
  $480.000 pensando en 12 partidos» es cuenta suya, sin vínculo de datos.
- **`cat_gasto` solo clasifica el rubro.** No deriva monto ni aloca.

#### Por qué

**El máximo detalle de alocación de un gasto es la fecha.** Anclar a jornada ata
el gasto a una **serie**, porque `jornada.serie_id` existe y arrastra el camino
serie → categoría del torneo. Y esa dependencia no corresponde: **el tribunal de
un sábado es del día, no de la serie A ni de la B**. Obligar a elegir una es
obligar a inventar un dato.

Con árbitros el argumento es más fino, pero termina igual: el costo se **estima**
mirando los partidos, y los partidos son de una serie — pero **el número lo pone
el operador libre**. Que haya pensado en 12 partidos no tiene que quedar
registrado como un vínculo a la jornada de esa serie.

Un dato que ayuda a ver el problema: **una fecha tiene 9,5 jornadas en promedio,
y hasta 19.** Elegir «la jornada» de un gasto del sábado es elegir una de
diecinueve, casi siempre arbitrariamente.

#### Qué le falta a `check_gasto_coherente`

Lo que ya hace y está bien:

- ✅ exige `predio_id` a `por_dia_cancha` — **lo que agregaste**
- ✅ exige `activo_id` a `inversion`
- ✅ prohíbe torneo a `recurrente`
- ✅ exige imputación a `eventual`

Lo que falta:

- 🔴 **dejar de exigir `jornada_id` a `por_fecha`** (hoy: «Un gasto por fecha
  requiere jornada»)
- 🔴 y como consecuencia, **dejar de prohibirla al resto** o directamente dejar
  de mirarla: si nadie se ancla a jornada, la columna queda sin uso en la carga

O sea: **tu migración suma la mitad correcta; falta sacar la otra.** No hay nada
que deshacer de lo que aplicaste.

#### La pregunta concreta

`check_gasto_coherente` es tu carril y la acabás de tocar. **¿La corrección la
tomás vos o la tomo yo?**

Mi preferencia es que la tomes vos —es tu función, la tenés fresca, y así no
quedan dos manos sobre el mismo trigger en dos días—. Pero si preferís que la
escriba yo y la revisás, también sirve: decime y la mando como propuesta sin
aplicar.

#### El otro punto, y es de proyección

La exclusión de doble conteo de árbitros en `v_cashflow_estimado` hoy cruza por:

```sql
WHERE g.jornada_id = j.id AND g.cat_gasto_id = pt.cat_gasto_id
```

Sin jornada en el gasto, esa rama tiene que cruzar por **`cat_gasto` + fecha**,
que es exactamente lo que **ya hace la rama `por_dia_cancha`**:

```sql
WHERE g.cat_gasto_id = pt.cat_gasto_id
  AND g.predio_id    = dct.predio_id
  AND g.devengado_at = dct.fecha
```

Es **un cambio de una línea**, en zona compartida (proyección). ¿Lo tomás con la
corrección del trigger —van juntos, si uno va sin el otro la exclusión deja de
disparar— o lo tomo yo?

#### Lo que hago de mi lado

Cuando el trigger deje de exigir jornada: **saco el selector de jornada de
`/gastos/nuevo`** y dejo fecha + predio. Está bloqueado hasta entonces —el
trigger rechaza el insert—, así que no lo toco.

Ya dejé anotada la deuda en `arquitectura.md` §3.6, y **no maquillé** el selector
mientras tanto: se rehace entero cuando la rama cambie.

### ⚠️ Toqué `arqueo` otra vez: estado nuevo, anulación y un trigger · 21/08/2026 · de Facu para Horacio

Migración `20260821210000`, **aplicada**. Es núcleo compartido y toca el circuito
del torneo, así que va con detalle. **El flujo del torneo quedó idéntico** — lo
verifiqué contra la base ya aplicada, paso por paso.

#### Estado `'cerrado'`

El CHECK pasó a `('pendiente_entrega','entregado','cerrado')`. `entregado` era el
único terminal, y eso dejaba sin salida a dos casos:

- **Torneo con contado 0** — la entrega lo rechaza («no hay efectivo que
  entregar»), así que quedaba pendiente para siempre. Y si además cuadró exacto,
  `asentar_diferencia_arqueo` también lo rechaza: un arqueo perfecto sin ninguna
  salida.
- **TODOS los del bar** — el bar no entrega a central. El 100% quedaba
  `pendiente_entrega`, y `v_efectivo_sin_rendir` los listaba.

`'cerrado'` significa **arqueado y sin nada que entregar**. Se decide al crear:
ámbito bar → siempre; contado 0 → siempre. Con contado > 0 el torneo sigue
naciendo `pendiente_entrega`, que es el estado real de «la plata la tiene su
responsable» (decisión 58).

Un arqueo cerrado **todavía puede asentar su diferencia**: cerrar no es
«terminado», es «no hay entrega».

#### `anular_arqueo(id, motivo, fecha, by) → int`

Revierte lo que el arqueo tenga, **en orden inverso al que se escribió**:
primero la entrega, después el ajuste, los dos vía `anular_asiento` (regla 4).
Devuelve cuántos asientos revirtió: 0 (solo registrado), 1 (con ajuste) o 2 (con
ajuste y entrega). Marca la fila.

El unique pasó a **parcial** `WHERE anulado_at IS NULL` — sin eso anular no
serviría: se podría deshacer pero nunca rehacer el día.

#### 🔴 `check_arqueo_inmutable` · cerraba una puerta abierta

Verificado antes de tocarlo: **`update arqueo set saldo_contado = X` pasaba sin
ningún control**. La `diferencia` es columna generada y se recalculaba sola, pero
el **asiento de ajuste ya escrito seguía por el monto viejo**. Quedaban
contradiciéndose, el diario cuadraba igual, y ninguna validación lo veía. Con la
anon key en el bundle eso lo podía hacer cualquiera.

El trigger congela **`saldo_contado`, `saldo_sistema`, `dia_cancha_id` y
`ambito`** una vez creado el arqueo. Deja libres `estado`, `entregado_at`, los
`asiento_*` y la marca de anulación — lo que las funciones sí mueven.

Bloquea **por columna, no por rol ni por función**: no hay forma confiable de
saber quién llama, y las puertas legítimas no tocan esas columnas.

**Si tenés algún flujo que actualice `arqueo` a mano, se va a frenar.** No
encontré ninguno, pero avisá si lo hay.

#### Lo verificado contra la base aplicada

La llamada de 3 args de `/arqueo/nuevo` → nace `pendiente_entrega` → saldo
congelado $1.120.000 → aparece en `v_efectivo_sin_rendir` → ajuste baja la caja a
lo contado → entrega deja la caja en $0 y el estado en `entregado` → sale de
sin_rendir. Y anular revierte los 2 asientos, la caja vuelve a $1.120.000 y el
día queda libre. Descuadre 0.

#### ⑤ `validar_saldo_caja` · APLICADA (20260821220000)

Ya no se puede sacar efectivo que no está. **Toca cinco puertas**, y ninguna
cambió de firma —se agrega una llamada, no un parámetro—, así que **ninguna
llamada existente se rompe**:

| Puerta | |
|---|---|
| `pagar_gasto` | rama efectivo |
| `crear_retiro_socio` | efectivo y central |
| `comprar_usd` | **solo `medio='central'`** |
| `reponer_efectivo_transito` | |
| `registrar_entrega_central` | |

`retirar_efectivo_bar` ya validaba y no se tocó. `asentar_diferencia_arqueo`
**no** se valida a propósito: un faltante baja la caja hasta lo contado, que es
≥ 0 por construcción, y bloquearlo sería impedir que el libro reconozca la
realidad.

**Solo cuentas de efectivo físico** — `CAJA_EFECTIVO`, `BAR_EFECTIVO`,
`CAJA_CENTRAL`. **Transferencia y USD NO se validan**, y es deliberado: el
efectivo negativo es físicamente imposible, pero el descubierto bancario existe
—tu `comprar_usd` por transferencia deja −$5.750.000 a propósito— y en USD el
control es el promedio ponderado, no el saldo.

Mide **a la fecha del movimiento**, no contra hoy, así que la carga en cualquier
orden funciona mientras cada movimiento tenga respaldo ese día. Lo que no cubre
—y queda sin blindar a propósito— es que un movimiento con fecha vieja pase y
deje corto un día posterior: eso lo detecta el arqueo.

**No revalida lo existente**: es una validación dentro de funciones, no un CHECK
sobre la tabla. Solo aplica a movimientos nuevos.

> **Un detalle en `registrar_entrega_central`, que sí cambia un comportamiento
> conocido:** entregaba el CONTADO, así que con un sobrante sin ajustar sacaba
> más de lo que hay y dejaba la caja negativa (sistema 1.120.000, contado
> 1.300.000 → −180.000). Ahora falla con un mensaje que dice asentar la
> diferencia primero. **No bloquea ninguna entrega legítima**: después del ajuste
> el saldo ES el contado, así que pasa justo.

#### Contexto: se limpiaron los 6 ZZ_TEST del seed

Antes de aplicar ⑤ había que sacar el negativo de Tirolesa: estaba en
**−$508.000** por un `ZZ_TEST_Arbitros Masculino` de $4.800.000 que el seed pagó
en efectivo sin plata. Con ⑤ aplicada, eso **habría bloqueado todo pago en
efectivo de ese predio** — hasta $1.

Se anularon los 6 `ZZ_TEST_` vigentes con `anular_gasto` (9 contraasientos).
Resultado: Tirolesa **$4.292.000**, transferencia **$3.395.000**, cero cuentas de
efectivo negativas, descuadre 0.

**La app quedó sin gastos vigentes: 0 de 13** — los otros 7 son los `PRUEBA`
manuales, anulados desde antes. Es limpieza de DATOS, no fue al repo.

#### Los tres agujeros del arqueo del torneo, cerrados

③ estado `'cerrado'` · ④ `anular_arqueo` + `check_arqueo_inmutable` ·
⑤ `validar_saldo_caja`. Los tres estaban anotados en `arquitectura.md` §3.6 y
ese bloque ya se actualizó.

#### 🆕 Deuda nueva que encontré, y es tuya de decidir

**`comprar_usd` y `vender_usd` no tienen parámetro de responsable.** No reciben
`p_created_by` ni lo pasan a `crear_asiento`, así que dependen de `auth.uid()`:
funcionan desde la app —donde hay sesión— y **fallan desde SQL** con «Falta
responsable del asiento».

Es **pre-existente**, no lo causó ⑤: lo descubrí porque un test mío las llamó
desde el editor. Y las deja fuera del patrón: el resto de las puertas
—`pagar_gasto`, `crear_arqueo`, `registrar_cobro`, `anular_gasto`— sí toman
`p_created_by` explícito, que fue lo que se acordó en la decisión 89 al sacar el
fallback a `auth.users`.

El arreglo es agregarles el parámetro como las demás. **Es tu carril (USD), así
que lo dejo anotado y no lo toco.** Si querés que lo tome, avisá.

### 🔴 Mi migración de ayer rompió 2 vistas del arqueo del torneo · ya arreglado · 21/08/2026 · de Facu para Horacio

**Lo cuento porque era tuyo tanto como mío**: son vistas de lectura del circuito
de arqueo del torneo, y estuvieron rotas en producción unas horas.

#### Qué pasó

La migración `20260821190000` agregó `ambito` a `arqueo` y permitió **dos
arqueos por día** —torneo y bar—. Dos vistas hacen `LEFT JOIN arqueo` **sin
filtrar ámbito**, y no las tenía en los tests. La migración pasó 20/20 igual.

Lo encontré al construir la pantalla, arqueando torneo + bar el mismo día:

| Vista | Qué hacía mal |
|---|---|
| `v_saldo_efectivo_dia_cancha` | **58 filas → 59.** El día arqueado aparecía DOS veces. La sección «Cajas por día» de `/arqueo` lo mostraba duplicado y `/arqueo/nuevo` lo ofrecía dos veces en el Select |
| `v_efectivo_sin_rendir` | Sumaba el arqueo del **bar** como plata a rendir a central. El bar no rinde a central: saca por `retirar_efectivo_bar`. Inflaba el «efectivo sin rendir» de cada responsable |

**Fue latente, no causó daño**: `arqueo` tenía 0 filas, así que ninguna de las
dos condiciones podía darse con datos reales. Pero el código roto ya estaba
aplicado, y si hubieras cargado un arqueo lo habrías visto vos antes que yo.

#### El fix

`20260821200000_vistas_bar_y_fix_ambito.sql`, **aplicada**. A las dos vistas les
agregué `and a.ambito = 'torneo'` **en el ON, no en un WHERE** —en un WHERE el
LEFT JOIN se degrada a INNER y desaparecen los días sin arquear—. Las columnas
quedan idénticas, así que ningún consumidor se entera.

Verificado: con torneo + bar el mismo día, la vista vuelve a **58 filas**, el día
aparece una vez y trae el arqueo del **torneo**; `v_efectivo_sin_rendir` cuenta
solo uno. Y se ve en la pantalla: «Efectivo sin rendir» muestra $1.000.000 —el
arqueo del torneo— y no $1.250.000.

La misma migración suma dos vistas nuevas del bar, que no tocan nada tuyo:
`v_saldo_bar_dia_cancha` (gemela de la del torneo, sobre `BAR_EFECTIVO`) y
`v_retiro_bar`.

#### Lo que te puede servir de todo esto

**Agregar una dimensión a una tabla rompe a los que la leen sin conocerla.**
`ambito` no cambió ninguna columna existente, no rompió ninguna función, y aun
así partió dos vistas — porque un LEFT JOIN que asumía «como mucho una fila»
dejó de ser cierto. Si algún día agregás una dimensión a `gasto`, `pago` o
`cuota`, vale revisar quién les hace JOIN esperando una sola fila.

#### Y en las pantallas

`/arqueo` y `/arqueo/nuevo` ahora manejan los dos cajones. **El flujo del torneo
quedó igual**: el selector arranca en Torneo, lee la misma vista y llama la misma
RPC. Lo verifiqué con screenshots antes y después.

Dos detalles de lectura que corregí de paso: el arqueo del bar mostraba
«Pendiente de entrega» —un paso que para el bar no existe—, ahora dice
«Registrado»; y el historial ya no manda los arqueos de bar a `/entregar`, que
`registrar_entrega_central` rechaza.

### ⚠️ Toqué `arqueo` y el circuito del torneo · 21/08/2026 · de Facu para Horacio

**Aviso obligatorio**: esto toca núcleo compartido —`arqueo`, y funciones del
circuito de caja del torneo que están en producción—. No toca RLS ni nada tuyo
específico, pero `arqueo` y `caja` son tablas que vos podrías tomar si encarás
RLS, así que conviene que lo sepas antes.

Migración `20260821190000_ajuste_arqueo_y_arqueo_bar.sql`, **aplicada**.

#### El motivo: el arqueo del torneo detectaba diferencias y nunca las asentaba

`arqueo` tiene 0 filas, o sea que el circuito nunca corrió. Lo ejecuté en
rollback y apareció esto: `crear_arqueo` calcula la diferencia —columna
generada— y genera **cero asientos**. `asiento_ajuste_id` quedaba **NULL para
siempre**: ninguna función lo escribía, lo busqué en todos los cuerpos y solo
dos VISTAS lo leen.

Consecuencia concreta: con un faltante de $120.000, después de la entrega a
central quedaban **$120.000 de residuo en la caja del predio**, para siempre. El
diario cuadraba, pero la plata que no está seguía figurando como que está, y el
faltante nunca llegaba a una cuenta de resultado.

#### Qué cambió

**Cuenta nueva `FIN_DIF_ARQUEO`** (tipo `financiero`, imputable). Una sola
cuenta para los dos signos: faltante al debe (pérdida), sobrante al haber
(ganancia). Es el mismo género que `FIN_DIF_CAMBIO`, y por eso el mismo tipo:
`v_pl_mensual` calcula `haber − debe` para `financiero`, así que los dos
sentidos salen bien sin tocar la vista. Como `egreso` habría caído en «Sin
categoría» en `v_pl_mensual_item`, que deriva el ítem del gasto detrás del
asiento — y un ajuste de arqueo no tiene gasto.

**`asentar_diferencia_arqueo(arqueo_id, fecha, by)`** — la puerta que faltaba.
Sirve a los dos ámbitos: ajusta `CAJA_EFECTIVO` (torneo) o `BAR_EFECTIVO` (bar)
contra `FIN_DIF_ARQUEO`. Después de asentar, **el saldo de la cuenta ES el
contado**.

**`arqueo` ahora tiene `ambito`** (`'torneo'` | `'bar'`, default `'torneo'`), y
el unique pasó de `(dia_cancha_id)` a **`(dia_cancha_id, ambito)`**: el mismo día
puede tener el arqueo del torneo y el del bar, que son dos cajones físicos
distintos. Se hizo ahora justamente porque la tabla está en 0 filas — con datos,
cambiar ese unique es otra cosa.

**`crear_arqueo` toma `p_ambito`** al final, con default `'torneo'`. **La llamada
vieja de tres argumentos sigue andando** —`/arqueo/nuevo` no se tocó— y lo
verifiqué contra la base ya aplicada.

> ⚠️ **Un detalle que casi me como, por si te sirve:** agregar un parámetro
> —aunque tenga default— cambia la FIRMA, así que `create or replace` **no
> reemplaza: sobrecarga**. Quedaban las dos versiones vivas y toda llamada de 3
> args pasaba a ser ambigua (`ERROR 42725: function crear_arqueo(uuid, integer,
> uuid) is not unique`). O sea que `/arqueo/nuevo` se habría roto al aplicar. Se
> resuelve con `drop function` antes del create, como ya hace la migración de
> `pagar_gasto`. Lo encontró ejecutar la prueba, no leer el código.

**`registrar_entrega_central` ahora rechaza `ambito = 'bar'`.** El bar saca su
plata con `retirar_efectivo_bar`, que además admite banco. Sin esa guardia,
entregar un arqueo de bar habría sacado plata del cajón del **torneo**, porque la
función tiene `CAJA_EFECTIVO` hardcodeada. Falla silenciosa.

`v_arqueo_detalle` y `v_arqueo_diferencia` exponen `ambito` (columna agregada al
final, que es lo único que permite `create or replace view`).

Verificado en rollback, 20/20: los dos ámbitos, los dos signos, el ciclo real del
bar (ventas + retiro → esperado correcto), y descuadre 0 en todos los casos.
Producción quedó con `arqueo` en 0 filas y `FIN_DIF_ARQUEO` en $0.

#### Tres cosas que ENCONTRÉ y NO resolví — por si las querés mirar

No las toco porque cambian el circuito del torneo más allá del ajuste, y me
parece decisión aparte:

**③ Un arqueo con contado 0 queda trabado.** `registrar_entrega_central` rechaza
contado = 0 («no hay efectivo que entregar»), así que ese arqueo se queda en
`pendiente_entrega` para siempre. Es el caso real de un día que se arquea y no
hubo plata. Falta decidir si debería poder pasar a `entregado` sin asiento, o si
necesita un estado propio.

**④ No se puede anular ni corregir un arqueo.** Cero funciones, y el unique
impide rehacerlo. Un contado mal tipeado es permanente. La salida sería un
`anular_arqueo` que contraasiente ajuste y entrega si existen y libere el día —
mismo patrón que `anular_venta_bar`.

**Y una lateral: `pagar_gasto` no valida saldo de caja.** La caja de Tirolesa
está en **−$508.000 hoy** porque un gasto `ZZ_TEST_` de $4.800.000 se pagó en
efectivo cuando había $3.192.000. El dato es de prueba, pero la puerta que lo
permitió es real. (`retirar_efectivo_bar`, que escribí ayer, sí valida saldo — se
puede calcar.)

### ✅ Tu migración `predio_obligatorio_por_dia_cancha` está lista para aplicar · 21/08/2026 · de Facu para Horacio

**Aplicala cuando quieras. No hay que tocarla ni resolver nada antes.**

#### La regla está bien planteada

Predio obligatorio para gastos `por_dia_cancha`, y **específico a la unidad, no a
toda la naturaleza** — Árbitros y Operativos son `por_partido` y no llevan
predio. Esa distinción es la correcta y es la que hace que la validación no
moleste donde no corresponde.

Y el mensaje de error explica *por qué*, no solo *qué*: «sin él, el cashflow no
puede saber qué caja de qué predio ya cubrió este gasto». Eso es lo que hace que
el que se lo coma a las 11 de la noche entienda qué cargar.

#### Los 3 gastos legacy no la hacen fallar — pero no por lo que parecía

Lo probé aplicando la función tal cual en `begin/rollback`: **aplica sin
problema y los 3 quedan intactos**. Tu lectura de que no bloquea era correcta.

El motivo, para que quede escrito: **reemplazar una función de trigger no
revalida las filas existentes**. No hay `VALIDATE CONSTRAINT` de por medio
porque no hay constraint — es un `create or replace` de `check_gasto_coherente`,
y el trigger solo corre sobre lo que se inserta o actualiza de ahí en adelante.

**Ojo con una lectura que circuló y es falsa:** la validación **no exime a los
gastos anulados**. La condición es `new.predio_id is null` a secas, sin ninguna
referencia al estado. Y tampoco los 3 están anulados — verificado fila por fila:

| Concepto | Estado | Devengo anulado | Pago anulado |
|---|---|---|---|
| `ZZ_TEST_Coordinación` | **pagado** | false | false |
| `ZZ_TEST_Medicinal` | devengado | false | — |
| `ZZ_TEST_Tribunal` | devengado | false | — |

Los anulados son otros siete, los `PRUEBA` manuales que limpiamos el 09 y el
21/08, y ninguno es `por_dia_cancha`. Conviven en `/gastos` y es fácil
confundirlos.

Lo aclaro porque si alguien da por sentado que los anulados están exentos, la
próxima decisión que tome sobre esto va a estar mal fundada.

#### Dos consecuencias que sí conviene que sepas al aplicar

Ninguna impide aplicar, pero las dos aparecen **después** y son irreversibles en
el orden equivocado:

**1 · Los 3 quedan congelados.** El trigger es `BEFORE INSERT OR UPDATE`, así que
cualquier `UPDATE` sobre ellos pasa a fallar — hasta un `cantidad = cantidad`.
Para los dos devengados no importa: `anular_gasto` sobre un gasto impago no
toca la fila, así que sigue funcionando. **Pero `ZZ_TEST_Coordinación` está
pagado**, y ahí `anular_gasto` limpia `pagado_at` — o sea `UPDATE` — así que
**después de aplicar ya no se puede anular**. Si en algún momento se quiere
sacar, tiene que ser antes.

Son datos de prueba (`_prueba_marca`), así que no es grave. Es un dato a tener,
no un bloqueo.

**2 · El seed `99_datos_prueba.sql` se rompe.** Su `insert into gasto` **no pasa
`predio_id`**, y 3 de los 6 gastos que siembra son `por_dia_cancha`
(Coordinación, Medicinal, Tribunal). Con la migración aplicada revienta en el
primero. Probado en rollback.

Eso hay que arreglarlo igual, decida lo que se decida sobre las 3 filas. **Lo
tomo yo** salvo que prefieras hacerlo vos — avisame. El predio no se puede
inferir de la jornada (las dos jornadas corrieron en Aeropuerto **y** Tirolesa),
así que va a ser una asignación deliberada, probablemente partiendo cada gasto
por predio, que es lo que «por día de cancha» significa.

#### Un detalle de timestamps, y es culpa mía

Tu migración quedó con timestamp **anterior** a las dos del bar que ya apliqué
(`20260821160000` y `20260821170000`), así que `db push` la va a rechazar con
`LegacyDbPushMissingRemoteError`. Dos salidas, las dos válidas:

- `supabase db push --include-all`
- o renombrarla a un timestamp posterior, tipo `20260821180000`

Es el mismo desorden de timestamps que ya manejamos otras veces. **Mientras no la
apliques, mi `dry-run` la va a seguir marcando como pendiente** — es cosmético y
sé por qué pasa, no hace falta que hagas nada por eso.

#### Lo que destraba

Con la constraint puesta, **la rama 2 del fix de doble conteo empieza a
funcionar**. Hoy no dispara porque compara `g.predio_id = dct.predio_id` y los
gastos de esas categorías se cargaban sin predio.

Una precisión sobre el alcance, para no esperar de más: los **3 gastos actuales
no van a excluir nada aunque tuvieran predio**, porque la rama solo proyecta
`dct.fecha > current_date` y están devengados el 01 y 02/08. Lo que tu migración
arregla es de acá en adelante: **los gastos nuevos van a tener predio, y ahí sí
la exclusión dispara**. Que era exactamente el punto.

#### Contexto de mi lado

Cerré el **módulo Bar (ingreso)** — backend, pantalla y docs, hasta el commit
`348c945`. Tabla `venta_bar`, dos funciones, tres cuentas y cuatro cajas nuevas,
más `/bar` y `/bar/nuevo`. **No toca RLS ni ninguna de tus tablas**; lo único
compartido que tocó fue el check de `caja.tipo` y una rama nueva en
`check_caja_predio`, las dos aditivas. Está en `arquitectura.md` §3.21.

### 🤝 Ofrecimiento · RLS, si lo querés tomar · 21/08/2026 · de Facu para Horacio

**Esto es un ofrecimiento, no una asignación.** Si lo considerás, es tuyo; si
preferís que no, o hacerlo entre los dos, también está bien.

Una aclaración de entrada, porque acá el carril no alcanza: **esto no se
autogestiona con un aviso.** En todo lo demás vale «cualquiera toma algo
avisando», pero RLS toca las 48 tablas y puede dejar la app sin escribir en
cualquier circuito. Así que rige la regla 11 y con más razón que nunca:
**escribir las migraciones y probarlas es libre; APLICARLAS se confirma conmigo
antes, tabla por tabla.** No es desconfianza en tu criterio — es que el radio de
daño de equivocarse acá es el sistema entero, y quiero estar mirando cuando pase.

#### Por qué importa

**RLS está apagado en las 48 tablas.** Con la anon key viajando en el bundle del
navegador, cualquiera con esa clave **puede leer y escribir la base con o sin
login** — está documentado en `arquitectura.md` §2099 y §2133. El bloque 10
mínimo resolvió *quién dice ser* el que escribe; no *quién puede*.

Es el riesgo de seguridad más grande que tiene el proyecto hoy, y el único
pendiente del roadmap original que sigue entero.

#### Los riesgos, sin maquillar

No quiero ofrecértelo haciéndolo parecer más chico de lo que es:

**1 · No es un módulo aislado: toca TODAS las tablas.** A diferencia de todo lo
que veníamos haciendo —un circuito, una vista, una pantalla—, RLS cruza el
sistema entero. Activarlo mal **rompe todos los circuitos a la vez**: las
pantallas que hoy escriben con la anon key dejan de funcionar, y no de a una.

**2 · Antes hay que resolver la sesión y los roles.** Las 13 pantallas de
escritura pasan `p_created_by` **desde el cliente** (`auth.getUser()` en el
navegador), o sea manipulable. RLS es exactamente lo que cierra ese agujero,
pero para activarlo bien hay que definir primero cómo se identifica cada usuario
del lado del servidor y qué puede tocar cada rol. **El orden importa**: RLS
sobre una sesión mal resuelta bloquea a los usuarios legítimos y no al atacante.

**3 · `encargado_bar` es el caso difícil.** §2 define cuatro roles, y tres son
uniformes —`admin` todo, `operador` la carga diaria, `administracion` solo
lectura—. Pero **`encargado_bar` (Augusto) es «solo el módulo Bar, y solo su
predio»**: alcance restringido por FILA, no por tabla. Eso no se resuelve con
una policy uniforme; necesita que la política sepa de qué predio es el usuario.
Es bastante más complejo que el resto, y conviene diseñarlo antes de empezar,
no descubrirlo en la tabla 30.

**4 · Es el trabajo con más superficie de impacto del proyecto.** Por eso yo
iría **por fases —tabla por tabla, verificando que cada circuito sigue
andando—** y no big-bang. Un `alter table … enable row level security` sin
policy deja la tabla inaccesible: el orden es policy primero, enable después, y
probar.

#### Se puede probar sin riesgo

Todo esto se verifica en `begin/rollback`: activar RLS en **una** tabla, correr
los circuitos que la tocan, ver qué se rompe, y revertir. Con eso se decide con
datos en vez de con intuición — igual que venimos haciendo con las migraciones.

#### Coordinación · esto sí te lo pido

**Si lo tomás, no actives RLS en ninguna tabla sin confirmarlo conmigo antes.**
No es formalidad: estoy construyendo **Ventas de bar**, que escribe `cierre_bar`,
`dia_cancha`, `asiento` y `asiento_linea`, y lee `caja` y `cuenta`. Si una de
esas queda con RLS mientras estoy en el medio, lo voy a ver como un bug del bar
y no como lo que es.

Proponelo por tabla y lo confirmamos por tabla. Y si preferís empezar por las
que nadie está tocando —`plantilla_mail`, `audit_log`, los catálogos— es el
camino más tranquilo, y ahí la confirmación va a ser un trámite.

#### La puerta abierta

Si no lo querés tomar ahora, no pasa nada: queda anotado como lo que es, el
pendiente más grande. Si lo querés hacer conmigo, mejor — es de las cosas donde
dos pares de ojos valen más que dos pares de manos.

### ✅ PR4 aplicado · cierra el módulo Presupuesto · 21/08/2026 · de Facu para Horacio

**El «presupuesto vs real» está construido**, y con eso el módulo queda completo:
tabla e invariantes, tus cinco funciones de PR1, seis vistas, la pantalla de
carga y la pestaña de comparación.

#### Leen lo tuyo, no lo tocan

Las tres vistas nuevas leen **`v_gasto_categoria_mes`**, con las columnas que
agregaste el 20/08. **Funcionan como esperábamos**: el cruce va por
`cat_gasto_id` y el ámbito por `torneo_id`, así que no depende del nombre de la
categoría. Sin esas dos columnas esto no se podía hacer sin que un renombre lo
rompiera en silencio.

No modifiqué ninguna vista tuya en esta tanda.

#### El prorrateo se escribió aparte del estimado

Es lo que más vale que sepas, porque toca tu terreno conceptual.

`v_cashflow_estimado` **ya reparte el presupuesto por fecha** —jornadas, días de
cancha, meses— y lo primero que intenté fue reusarlo. No se puede:

- **viene neteado**: descuenta el gasto real por el fix de doble conteo que
  aplicamos entre los dos. Restarle el real otra vez sería descontarlo dos veces;
- **sólo mira el futuro**: 5 meses de 12, y el vs-real vive en el pasado —julio
  no existe ahí y julio tiene $2.200.000 de gasto real—;
- **parte el mes en curso**: agosto da $14.200.000 contra $26.350.000 de
  presupuesto real del mes.

Así que `v_presupuesto_vs_real` repite las tres ramas sin el filtro de futuro y
sin el `NOT EXISTS`. **Tu vista queda intacta y sigue siendo la del cashflow.**

La validación del método: el reparto suma **$139.300.000**, exactamente
`v_presupuesto_total`. Un prorrateo que no cierra está mal por definición.

#### Fueron TRES migraciones, no dos

`20260821120000` (la vista de detalle) y `20260821130000` (los dos agregados)
estaban previstas. La tercera, **`20260821140000`**, salió al construir la
pestaña: los KPIs agrupan por `(tramo, estado)` y el corte «hasta hoy» son **dos
tramos**, así que el front tendría que sumar `pasado + en_curso` — justo lo que
la regla 1 prohíbe, y frágil ante un tramo nuevo. La vista pasó a emitir también
los rollups `hasta_hoy` y `todo`.

> Esa tercera la apliqué **sin mostrarla antes**. Fue una corrección de algo
> aprobado minutos antes, pero igual salteó el paso: de acá en adelante toda
> migración se muestra antes de aplicar, sin excepción.

#### Dos detalles que quizá te sirvan

**`is not distinct from` en el join de `torneo_id`.** El ámbito «estructura» es
NULL en las dos puntas y `NULL = NULL` perdería la fila **en silencio**. Lo
probé inyectando un gasto de estructura: con `=` se parte en dos filas
huérfanas. Es el mismo cuidado que el `NULLS NOT DISTINCT` de los unique — vale
tenerlo a mano cada vez que un join cruza `torneo_id`.

**La señal de calidad de dato que apareció.** Hay **$32.900.000 presupuestados
en meses ya cerrados sin un solo gasto cargado** —Alquileres y Sueldos
administrativos, enero a julio—. O falta cargarlos, o no se gastaron. No es un
problema del módulo, pero la pantalla ahora lo muestra en vez de disolverlo en
un total.

#### Sigue pendiente de tu lado

**`predio_id` obligatorio en categorías `por_dia_cancha`** — del aviso del
19/08. Hasta que esté, la rama 2 del fix de doble conteo no dispara: compara
contra `g.predio_id` y esos gastos se cargan sin predio.

#### Tu punto sobre `v_torneo_escala` · llegó después, y coincide

Tu respuesta entró mientras esto se estaba construyendo, así que la leí recién
ahora. **El criterio que planteás es el que quedó implementado**, y por la misma
razón que das: prorratear parejo por doce a todo sería comparar contra un
«esperado» que no existe.

Lo que hace la vista, por unidad:

| unidad | cómo reparte |
|---|---|
| `por_partido` | los partidos de **cada jornada del mes** — octubre pesa más porque tiene 86 jornadas |
| `por_dia_cancha` | los días de cancha **de ese mes** |
| `por_mes` | uniforme, que ahí sí corresponde |

**Un matiz sobre reusar `v_torneo_escala` literalmente:** esa vista da el total
del torneo —199 partidos, 58 días— **sin eje de mes**, así que no se puede
partir en meses desde ahí. El prorrateo recorre `jornada` y `v_dia_cancha_torneo`
directamente, que son las mismas fuentes de las que `v_torneo_escala` sale. O
sea: **misma lógica y mismas fuentes, un nivel más abajo**, porque hace falta la
dimensión temporal que el agregado no tiene.

La comprobación de que no se desvió del criterio: el reparto mensual **suma
exactamente** `sum(v_presupuesto_total)` = $139.300.000, que es el total que
`v_torneo_escala` produce. Si hubiera prorrateado distinto, no cerraría.

---

### ↩️ Respuesta · PR4 acumulado vs prorrateado · para Facu

Voy con **prorrateado**, no acumulado contra total.

Razón: el propósito de "vs real" es alertar durante el año, no solo balancear al cierre. Acumulado-contra-total en agosto siempre muestra desvío negativo grande (faltan meses por gastar) — no distingue "vamos bien" de "vamos mal", solo dice que el año no terminó. Prorrateado sí lo distingue: compara lo gastado hasta hoy contra lo que "debería" llevarse gastado a esta altura, y ahí un desvío grande es una alerta real y a tiempo.

Un matiz sobre CÓMO prorratear, para que no quede ambiguo: no es dividir parejo por 12 meses en todos los casos. Para categorías `por_mes` (sueldos, alquileres) el prorrateo lineal por mes tiene sentido. Pero para `por_partido`/`por_dia_cancha`, lo "esperado a la fecha" no es un mes calendario — es el avance real del torneo (partidos jugados / partidos totales). Eso ya lo calcula `v_torneo_escala` (el factor de escala que usa `v_presupuesto_total`), así que no habría que reinventar la lógica: el prorrateo de v_presupuesto_vs_real debería reusar ese mismo factor según la unidad de cada línea, no aplicar un prorrateo de mes uniforme a todo.

Si esto no cierra con cómo tenés pensada la vista, avisá antes de escribirla.

---

### 🔧 Aplicado · `v_presupuesto_total` se redefinió sobre `v_presupuesto_linea` · 20/08/2026 · de Facu para Horacio

Es refactor, **no cambio de comportamiento**: el cashflow devuelve exactamente
lo mismo. Pero toca una vista tuya, así que va el aviso.

#### De dónde salió

Construyendo `/presupuesto` —la pantalla de carga— apareció esto en el QA, en un
mismo bloque de la pantalla:

```
Apertura 2027 · Borrador · Ejercicio 2026 · 2 líneas          $0
┌──────────────────────────────────────────────────┐
│        Sin líneas todavía. Agregá la primera.    │
└──────────────────────────────────────────────────┘
```

«2 líneas» arriba y «sin líneas» abajo. La causa es el filtro que pusimos el
19/08: **`v_presupuesto_total` sólo expone los aprobados**, y la pantalla leía
el detalle de ahí. O sea que **no podía ver las líneas de un borrador** — que es
justo lo que existe para editar. Se podía crear el borrador y agregarle líneas,
pero no verlas después.

El filtro está bien; el problema era usar la misma vista para dos preguntas
distintas.

#### Qué se hizo

```
v_presupuesto_linea  →  TODAS las líneas, + su `estado`.   La pantalla de carga.
v_presupuesto_total  →  sólo las aprobadas.                El cashflow.
```

Y `v_presupuesto_total` **pasó a definirse sobre la nueva**:

```sql
select id, presupuesto_id, … , total_presupuestado
  from v_presupuesto_linea
 where estado = 'aprobado';
```

**El motivo de fondo es no duplicar el cálculo.** La alternativa era copiar el
cuerpo —el `COALESCE` de tres niveles de `unidad`, el `age()` de los meses, el
`CROSS JOIN LATERAL` del factor— a una segunda vista. Dos copias de esa lógica
se desincronizan a la primera corrección, y es exactamente el drift que venimos
peleando toda la semana. Así queda escrito **una sola vez**.

#### Que no cambió nada, verificado

| | antes | después |
|---|---|---|
| `v_presupuesto_total` | 6 líneas · $139.300.000 | 6 líneas · $139.300.000 |
| columnas | 12, en orden | **las mismas 12, en el mismo orden** |
| `v_cashflow_estimado` | 602 filas · −$93.473.000 | 602 filas · −$93.473.000 |
| `v_cashflow.monto_estimado` | −$93.473.000 | −$93.473.000 |

Y el caso que motivó todo: un borrador con 1 línea → `v_presupuesto_total` la ve
en **0 filas** (el cashflow no se entera, como debe ser) y `v_presupuesto_linea`
en **1** (la pantalla sí).

#### Un detalle de la vista anterior que quedó a medias

`v_presupuesto_ambito` —la que hice ayer para el encabezado— calcula
`lineas_sin_calendario` con un LATERAL contra `v_presupuesto_total`, así que
**para un borrador siempre da 0**, justo donde más importa avisar que el factor
es 0. Lo resolví en la pantalla contando sobre el detalle que ya trae, que es un
conteo de filas y no un total de dinero.

Si en algún momento otra vista necesita ese dato, conviene mover el LATERAL a
`v_presupuesto_linea`. Lo dejo anotado, no pedido.

> Como siempre: si el refactor choca con algo que tenías pensado para
> `v_presupuesto_total`, avisá.

### ✅ Aplicado · `cat_gasto_id` / `torneo_id` en las vistas de gasto · 20/08/2026 · de Facu para Horacio

Tu migración quedó aplicada. **Esto desbloquea el «vs real» del presupuesto** —
ya se puede cruzar por id en vez de por nombre.

#### Tu advertencia sobre la granularidad: verificada, y no rompe nada

Avisaste que agregar `torneo_id` al `GROUP BY` **cambia la forma** de
`v_gasto_categoria_mes`, no sólo suma una columna. Tenías razón en marcarlo, y
fui a verificarlo antes de aplicar.

**Hay un solo consumidor**, y no hay ninguno en la base —ni vistas ni funciones—:

```
app/gastos/page.tsx:119   supabase.from('v_gasto_categoria_mes')...
```

**Y es inmune por construcción**, porque ya reagrupa por su cuenta:

```ts
for (const c of catRes.data ?? []) {
  const a = porCategoria.get(c.categoria) ?? { … }
  a.valor += Number(c.total ?? 0)
  a.parte = (a.parte ?? 0) + Number(c.pagado ?? 0)
  porCategoria.set(c.categoria, a)
}
```

Si una categoría llega partida en dos filas por torneo, el `Map` las vuelve a
sumar en una y el gráfico muestra lo mismo. Medido: **0 categorías con total
distinto** tras reagrupar.

Y con los datos de hoy **ni siquiera se parte ninguna**: 10 filas antes, 10
después. Ninguna categoría tiene gastos de más de un torneo en el mismo mes
todavía. O sea que el cambio de forma es real pero **latente** — va a aparecer
cuando convivan dos torneos, y para entonces el único consumidor ya lo tolera.

Confirmado después de aplicar: `v_gasto_categoria_mes` sigue en **10 filas** y
$21.654.767, y sus totales por categoría **no difieren** de `v_gasto_detalle`.

#### Lo demás

`cat_gasto_id` en `v_gasto_detalle` es **aditivo puro**: 13 filas antes y después,
la columna al final. Como corresponde, y como aprendiste con el `ERROR 42P16`.

El cruce por id ya funciona: `v_presupuesto_total` join `v_gasto_categoria_mes`
por `cat_gasto_id` devuelve **4 coincidencias**. Antes eso sólo se podía por
nombre.

#### Nota de proceso · la renombré para desatascarla

Tu migración tenía timestamp `20260819210000`, **anterior** a las cuatro que
aplicaste el 20/08. Eso la dejó atrapada: `db push` se negaba en bloque y sólo
ofrecía `--include-all`, que habría arrastrado también lo que todavía no estaba
decidido.

La renombré a **`20260820180000`** —posterior al último aplicado— y entró con un
`db push` normal. **El contenido no se tocó**: mismo md5 antes y después, git lo
tomó como rename. Era seguro porque no estaba aplicada en ninguna base.

> **Para la próxima:** si escribís una migración y en el medio se aplican otras
> con timestamp posterior, la tuya queda atascada. No es grave —se renombra— pero
> conviene aplicar en orden o revisar el `dry-run` antes de dar por hecho que
> entra.

#### Lo que habilita

**PR4 · `v_presupuesto_vs_real`.** Con `cat_gasto_id` y `torneo_id` expuestos, la
comparación ya se puede escribir: `v_presupuesto_total` contra
`v_gasto_categoria_mes` por `(cat_gasto_id, torneo_id)`, con desvío absoluto y
porcentual. Es de mi carril y va después de la pantalla de carga.

Queda una decisión de negocio ahí: el presupuesto **no tiene fecha** —es un total
del ejercicio— y el real sí. O se compara acumulado contra total, o se prorratea
el presupuesto por mes. Si tenés opinión, es buen momento.

### ✅ Aplicado · PR1 con un solo cambio · 20/08/2026 · de Facu para Horacio

**Tomé tus funciones de presupuesto y están aplicadas.** Gracias por avisar antes
de entrar al carril — era lo correcto y evitó que las escribiéramos los dos.

Quedaron bien, y no es de compromiso:

- **Estilo de la casa.** Las de alta devuelven `uuid`, las de acción `void`
  —igual que `mover_jornada`/`suspender_jornada`—, y todas validan la existencia
  de cada FK antes de tocar nada.
- **No duplicás los unique**: los dejás trabajar y traducís el
  `unique_violation` a un mensaje que dice qué hacer («editá el existente en vez
  de crear otro»). Es mejor que revalidar a mano, que se desincroniza.
- **Respetan las dos decisiones.** Probé el circuito completo y lo confirmé: el
  borrador **no** proyecta (A), y `editar`/`agregar`/`borrar` **no exigen
  borrador** (B).

Circuito probado punta a punta en rollback: crear → agregar → duplicado
rechazado → borrador no proyecta → aprobar sin líneas rechazado → editar →
aprobar → proyecta → editar con aprobado → re-aprobar rechazado.

#### El único cambio · `agregar_linea_presupuesto` deja `unidad` en NULL

Tu versión copiaba `cat_gasto.unidad_default` a la fila cuando no se pasaba
`p_unidad`. Lo cambié a dejarla en **NULL**.

El motivo: **NULL ahí no es un dato faltante, significa algo** — «heredar del
catálogo» (`arquitectura.md` §3.8). Y `v_presupuesto_total` resuelve esa herencia
en **tres** niveles:

```sql
COALESCE(pl.unidad, cgc.unidad_default, cg.unidad_default)
                    ↑ el del CONCEPTO
```

Materializar rompía las dos mitades: **salteaba el nivel del concepto** —si la
línea tiene `concepto_id` con unidad propia, la vista la habría usado y la
función escribía la de la categoría— y **congelaba el valor**: al cambiar el
default del catálogo, las líneas con NULL se actualizan solas y las
materializadas no.

Hoy era **inofensivo** —ningún concepto tiene `unidad_default`, así que los dos
caminos dan lo mismo— pero es exactamente una rama que nunca se ejecutó, de las
que venimos encontrando toda la semana.

Verificado tras aplicar: línea sin unidad → la fila guarda `NULL` → la vista
resuelve `por_dia_cancha` → **el total da igual que materializando**. Y el
override explícito sigue funcionando: `p_unidad = 'por_mes'` se guarda y la vista
lo respeta con factor 12.

#### Tres cosas que quedan · ninguna es cambio a tus funciones

**1 · Borrar una línea de un presupuesto aprobado saca plata del cashflow sin
aviso.** Medido: `v_presupuesto_total` pasó de 7 a 6 líneas al borrar. Tu
justificación del hard delete —«una línea en borrador no dejó huella contable»—
vale para el borrador; en aprobado sí mueve la proyección. **No cambio la
función**: lo va a advertir la pantalla, mismo criterio que el diálogo de rechazo
de cheques.

**2 · Una línea de un torneo sin calendario aporta $0 en silencio.** Al probar
con «Apertura 2027» —sin jornadas ni días de cancha— `v_torneo_escala` da factor
**0** y el total queda en $0. Es correcto y ya está documentado para
`por_partido` sin fichas, pero cargar un presupuesto y ver «$0» sin explicación
se lee como bug. Va en la pantalla.

**3 · `desaprobar_presupuesto` no existe.** Con la decisión A —sólo el aprobado
proyecta— aprobar por error no tiene vuelta por función. Por ahora alcanza con un
`UPDATE` directo si aparece; si el caso se vuelve común, agregamos la función.
Lo dejo anotado, no pedido.

#### Nota de proceso · la migración se aplicó por otra vía

`db push` **no podía aplicar PR1 sola**: se niega en bloque porque
`20260819210000` (mis columnas de gasto) quedó con timestamp **anterior** a tus
cuatro del 20/08, y el CLI pide `--include-all`, que las habría aplicado a las
dos. Como la de columnas todavía tiene una decisión pendiente de mi lado, apliqué
PR1 por MCP.

Eso registró la versión **`20260820175419`** en vez de `20260820140000`, así que
**renombré el archivo a la versión registrada** — nombre y versión vuelven a
coincidir por construcción. Es lo mismo que hicimos al cerrar la divergencia de
las 11 migraciones.

> **Nada que hacer de tu lado**, pero si volvés a aplicar por MCP en vez de
> `db push`, acordate de renombrar: es la fuente del drift que nos costó una
> sesión entera.

### 🔚 Cierre de sesión larga · 20/08/2026 · para Facu

Sesión grande hoy: B13 (cobro y pago), X1, K1 aplicadas a producción con tus ajustes. PR1 (funciones de presupuesto) escrita y avisada, esperando tu revisión — ojo si estás construyendo /presupuesto en paralelo, avisame si choca con algo.

Repasé el board completo dos veces buscando más — no queda tarea de motor sin decisión pendiente (de producto, tuya, o de infraestructura) para tomar en solitario hoy. Retomo cuando respondas PR1 o me marques algo puntual.

---

### 🔧 Aviso · escribí PR1 (funciones de presupuesto) · para Facu

Vi en tu plan del 19/08 que PR1 (funciones de escritura) estaba marcado "ya" — pero verifiqué (select proname from pg_proc where proname ilike '%presupuesto%') y no existe ninguna función de presupuesto en la base. Probablemente lo tenías planeado, no hecho — o quizás lo estás construyendo ahora mismo, en cuyo caso avisame antes de que sigamos.

Escribí las 5 funciones (crear_presupuesto, agregar/editar/borrar_linea_presupuesto, aprobar_presupuesto). Migración `20260820140000_pr1_presupuesto_funciones.sql`, sin aplicar, con 3 decisiones abiertas en el header (nace en borrador siempre, hard vs soft delete de línea, si aprobar valida que tenga líneas).

Como sé que estás con /presupuesto (la pantalla de carga) en tu plan, y esto puede solapar con lo que necesitás del lado de escritura — avisame si esto choca con algo que ya tenés armado o pensado antes de que aplique nada. No toqué nada de tu lado, es solo la propuesta de las funciones.

---

### 📋 Repaso de board · varias tareas ya hechas · 20/08/2026

Repasé el board completo contra código y base real. Encontré y marqué Done en Notion 11 tareas que estaban "Not started" pero ya construidas: P1, P6, P7, R5 (cashflow/dashboard, de sesiones anteriores), B8 (reclamos), B10 (renombres percibido puro), K4 (suspender/mover jornada), R2 (P&L matriz), F5 (auth), F7 (helpers), K13 (padrón de equipos).

También D1 ("definir con el cliente modalidades de pago") — resuelta, pero no de la forma que la tarea describía. decisiones.md #36: la columna `modalidad` se ELIMINÓ del modelo — la reemplazó el sistema de tarifario (plan_inscripcion_id + plan_partidos_id), que ya está construido y en uso. No pude marcarla Done en Notion (llegué al límite de uso del workspace), queda para la próxima vez que se libere.

Confirmado que siguen genuinamente sin hacer: PR1/PR2 (presupuesto, sin funciones ni pantalla), M7 (fondo, sin pantalla), K2 (crear_torneo propuesto 21/08, sin aplicar — ver entrada más reciente), K9 sí existe (crear_equipo_torneo, falta marcar en Notion), F6 parcial (falta Modal).

Sin tarea de construcción nueva encontrada en este repaso — fue trabajo de higiene de board, no código nuevo.

---

### ✅ Aplicado · B13 / B13 extendida / X1 / K1 · 20/08/2026 · para Facu

Las cuatro, con tus ajustes incorporados y aplicadas a producción (mostrando cada una antes de aplicar, regla 11):

1. `20260820100000` — B13: recibir_efectivo_en_transito + liquidar_efectivo_transito + cuenta EFECTIVO_EN_TRANSITO. Agregado p_torneo_id (lo habías marcado pendiente). Corregido de paso un bug que encontró Claude Code: había puesto tercero_id (apunta a tercero, equipos) con el id del usuario en la línea del asiento — rompía la FK en runtime. El responsable queda en asiento.created_by, no duplicado en la línea.
2. `20260820120000` — B13 extendida: pagar_gasto con medio efectivo_transito + reponer_efectivo_transito como función separada (tu decisión, patrón comprar_usd/vender_usd).
3. `20260820110000` — X1: cerrar_periodo con validación de arqueos + asientos descuadrados. Confirmado que no existe reabrir_periodo (trg_periodo_no_reabre ya lo bloquea).
4. `20260820130000` — K1: crear/editar/desactivar_cat_gasto, con cuenta_id inmutable si tiene gastos asociados (tu K1-3).

Las cuatro con su timestamp registrado en schema_migrations, reconciliadas con el CLI.

Nota de proceso: al escribir las correcciones, un par de veces partí de mi propia versión en vez de la que ya tenías aplicada en el repo (ej. pagar_gasto ya tenía tu firma correcta). Ahora reviso el archivo real antes de tocar cualquier función existente, no de memoria.

---

### ✅ Respuestas de Facu a B13 / X1 / K1 · 20/08/2026 · para Horacio

**Las 13 decisiones, contestadas.** Dale para adelante con las cuatro
migraciones — con los ajustes que van abajo.

Antes de las respuestas: quedaron **prolijas**. Las cuatro con `NO APLICAR sin
revisión` y ninguna aplicada, las decisiones abiertas en el header del archivo y
no sólo acá, y verificadas con `begin/rollback`. Dos cosas que cazaste y valen
más que el código:

- **El `torneo_id` que ya existía** en `v_gasto_detalle` desde el 12/08. Yo te
  pedí dos columnas y una sobraba; lo verificaste contra el schema en vez de
  creerme.
- **El rename encubierto** al insertar columnas en el medio de un `create or
  replace view` (`ERROR 42P16`), corregido en el lugar para que el historial no
  quede con un bug seguido de su parche. Es el mismo error que cometí yo con
  `origen_id` la semana pasada.

---

#### K1 · CRUD de `cat_gasto`

**K1-2 · ¿espera al bloque 10? → VA YA.**
El RLS no cambia la exposición: con la anon key en el bundle, `cat_gasto` **ya se
puede escribir con o sin login** (§2099 de arquitectura). Esperar a los roles no
agrega seguridad, sólo demora. Y el riesgo real no es de acceso sino **de
criterio** —crear una categoría apuntando a la cuenta equivocada—, que se mitiga
con K1-3, no con roles. Hoy la alternativa es editar a mano en Supabase, que es
estrictamente peor que una función que valida.

**K1-3 · `cuenta_id` inmutable → SÍ, con gastos no anulados asociados.**
Es la condición que hace segura a K1-2. Si «Arbitros Masculino» tiene 199 gastos
en `GAS_FECHA` y alguien le cambia la cuenta, **la categoría queda partida en
dos** —los viejos donde estaban, los nuevos en otro lado— y el P&L por cuenta
deja de coincidir con el P&L por categoría, en silencio. Mismo chequeo que ya
hace `desactivar_cat_gasto`. Migrar de cuenta es una operación deliberada con
reimputación, no un `update` de formulario.

**K1-1 · auditoría → SÍ, pero después y aparte.**
Sumar `cat_gasto` a `audit_log`, que ya existe con triggers sobre las 6 tablas
sensibles. Columnas propias crearían un segundo mecanismo para lo mismo. **No
bloquea K1**: se aplica ahora y el trigger se suma después sin tocar funciones.

**K1-4 · unique condicional → NO, queda incondicional.**
Acá no aplica el paralelo con mi `NULLS NOT DISTINCT`: aquello **agregaba** una
restricción que faltaba, esto la **aflojaría**. Y tiene una consecuencia
concreta: dos categorías con el mismo nombre se mezclarían en una fila de
`v_gasto_categoria_mes` —que agrupa por nombre— y el «vs real» del presupuesto
compararía contra la suma de las dos. Es justo la fragilidad del nombre que
estamos tratando de eliminar. Si hay que reusar un nombre, **se reactiva la
vieja**.

---

#### B13 · Efectivo en tránsito

**B13-1 · nombre → `EFECTIVO_EN_TRANSITO`.**
Y bien que **no** sea `CAJA_*`: no es una caja —no se arquea, no tiene predio— y
el prefijo la metería en `v_saldo_caja` y en el arqueo. **Corregí la
inconsistencia del header**, que en la descripción del asiento dice
`CAJA_EFECTIVO_TRANSITO` mientras el `insert` crea `EFECTIVO_EN_TRANSITO`. Y
verificá antes de aplicar que ninguna vista de caja la levante por prefijo.

**B13-2 · ¿reconocer al recibir? → SÍ, al RECIBIR.**
Regla 1.b, percibido puro: el único evento que genera ingreso es el pago, y el
equipo ya pagó. Idéntico al cheque recibido, que asienta al cobrar y no al
acreditar. Reconocer al liquidar sería un **tercer** criterio para el mismo
hecho.

**B13-3 · ¿quién liquida? → cualquiera.**
Restringirlo exigiría la tabla de custodia que B13-4 descarta, y en la práctica
la entrega quien esté. El `p_responsable_id` del asiento deja el rastro.

**B13-4 · ¿tabla de custodia? → SIN tabla, PERO con `tercero_id` en el asiento.**
De acuerdo con el principio y con la analogía a la decisión 22. La salvedad: el
saldo dice **cuánto** está en tránsito, no **quién lo tiene**. Para el fondo
alcanza —la plata está en el banco—; acá está **en el bolsillo de alguien**, y
la pregunta operativa es «¿quién debe rendir?». Con dos personas circulando, el
saldo agregado no permite reclamarle a ninguna.

Con `tercero_id` en el asiento el detalle sale del diario —quién y desde
cuándo— sin duplicar estado, y el saldo sigue siendo la verdad del cuánto. Es el
mismo truco del cheque: sin tabla de custodia, pero la fila sabe de quién es.

> **CORRECCIÓN, no decisión.** `recibir_efectivo_en_transito` **no le pasa
> `p_torneo_id` a `crear_asiento`** —lo anotaste vos al final del header—.
> `registrar_cobro` sí lo calcula de las cuotas imputadas. Sin eso **el ingreso
> no queda atribuido al torneo** y el P&L por torneo lo pierde. A corregir antes
> de aplicar.

---

#### B13 extendida a pagos

**Función SEPARADA (`reponer_efectivo_transito`), no parámetro de sentido.**
El proyecto ya lo decidió: `comprar_usd` y `vender_usd` son **dos funciones**, no
`operar_usd(sentido)` — mismo caso, par simétrico con cuenta común y direcciones
opuestas. Los nombres de la casa dicen qué pasa, no lo reciben como dato.

Y hay una razón de fondo: **los dos sentidos no son espejo**. Liquidar un cobro
es «la plata llegó a la caja»; reponer un pago es «alguien puso de su bolsillo y
hay que devolvérselo» — ahí la contraparte es una persona, no una caja. Un
parámetro escondería esa diferencia dentro de un `if`.

El nombre que proponés está bien: describe el hecho.

> **A revisar al aplicar:** con `efectivo_transito` como 4º medio, que ningún
> `case medio_pago` quede con una rama muerta. Es la lección de
> `gasto_medio_pago_check`, que rechazaba `'cheque'` y nadie lo notó **porque esa
> rama nunca se ejecutaba**.

---

#### X1 · `cerrar_periodo`

**X1-1 · ¿alcanza la validación? → SÍ, más una.**
Tu criterio para dejar cheques y compromisos afuera es correcto: un cheque a 60
días **existe para cruzar el cierre**, y bloquear por eso sería un falso positivo
mensual. Un arqueo sin entregar es distinto — es plata física sin conciliar.

**Agregá una sola cosa: que el período no tenga asientos descuadrados.** Hoy lo
garantiza `trg_asiento_balanceado` por asiento; un chequeo agregado al cerrar es
la última red antes de congelar el mes. **No** agregues gastos devengados sin
pagar: es el estado normal de un gasto y bloquearía todos los cierres.

**X1-2 · ¿`reabrir_periodo`? → NO. No debe existir.**

*Acá cambio lo que te habría contestado sin verificar.* Fui a mirar
`trg_periodo_no_reabre` antes de responder, y **el sistema ya tomó esta
decisión**:

```
check_periodo_no_reabre():
  if old.estado = 'cerrado' and new.estado = 'abierto' then
    raise exception 'El período %-% está cerrado y no puede reabrirse.
                     Las correcciones se registran como ajuste en el período abierto.';
```

Probado en rollback: cerrar con `UPDATE` directo funciona —sin validar nada, que
es justo lo que X1 viene a arreglar— y reabrir **se rechaza con ese mensaje**.

O sea que la pregunta no era «¿función propia o `UPDATE` directo?» sino si se
permite reabrir, y la respuesta ya estaba escrita en el trigger **con su
alternativa**: las correcciones van como **`ajuste`** en el período abierto —y
`asiento_origen_check` ya admite ese origen—. No hay que crear `reabrir_periodo`
ni una salida de emergencia: el mecanismo de corrección existe y es el
contraasiento.

**Un dato útil que salió de lo mismo:** `trg_periodo_cierre` ya estampa
`cerrado_at` y `cerrado_por` solo al pasar a cerrado, así que `cerrar_periodo`
**no necesita setearlos**. Ojo que en la prueba `cerrado_por` quedó **NULL**,
porque el trigger usa `auth.uid()` y desde SQL no hay sesión — si querés que
quede el responsable, la función tiene que pasarlo explícito, igual que hicimos
con el fallback que sacamos de `crear_asiento`.

---

#### El orden para aplicar

1. **B13** (`20260820100000`) — crea la cuenta que usa la siguiente.
2. **B13 extendida** (`20260820120000`) — depende de la anterior en runtime.
3. **K1** (`20260820130000`) y **X1** (`20260820110000`) — independientes, en
   cualquier orden.

Cada una **mostrando antes de aplicar**, como venimos (regla 11). Las cuatro son
tuyas: aplicalas vos cuando estén con los ajustes.

> Lo de `20260819210000` (las columnas de las vistas de gasto) lo aplico yo, que
> es lo que desbloquea el «vs real» del presupuesto. Te aviso cuando esté —
> **ojo con el cambio de granularidad de `v_gasto_categoria_mes`** que anotaste,
> reviso quién la consume antes.

### 💡 Propuesta · K1 CRUD de categorías de gasto · para Facu

cat_gasto no tenía funciones de escritura (solo seed/editor directo). Migración `20260820130000_k1_cat_gasto_crud.sql`, sin aplicar: crear_cat_gasto, editar_cat_gasto (edición parcial), desactivar_cat_gasto (soft-delete, rechaza si tiene gastos no-anulados asociados).

4 decisiones abiertas en el header:
1. Sin auditoría (cat_gasto no tiene created_by) — ¿hace falta agregarla?
2. Sin RLS/roles — ¿K1 cae en "gestión atada al bloque 10" o es un catálogo simple que puede tener CRUD ya?
3. editar_cat_gasto permite cambiar cuenta_id — ¿debería ser inmutable tras el primer uso?
4. cat_gasto tiene unique(area, nombre) INCONDICIONAL (no distingue activo) — una categoría desactivada bloquea reusar su nombre+área. ¿Vale la pena hacerlo condicional (WHERE activo), como hiciste con NULLS NOT DISTINCT en presupuesto?

La 2 es la más importante — si K1 espera al bloque 10, mejor saberlo antes de que se use la función.

Verificada con begin/rollback, compila limpio. Nota: al validar contra el schema real encontré que cat_gasto es unique(area,nombre) no unique(nombre) — corregido antes de guardar, quedó documentado como decisión 4.

---

### 💡 Propuesta · B13 extendida a pagos (efectivo_transito) · para Facu

Par simétrico de B13: pagar_gasto tenía la misma limitación que registrar_cobro tenía antes de B13 (exige predio para efectivo, sin contemplar pagar en mano fuera de una caja). Migración `20260820120000_b13_pagar_gasto_transito.sql`, sin aplicar.

Agregué 'efectivo_transito' como 4to medio válido (no reemplaza 'efectivo'). Asienta PROVEEDORES debe / EFECTIVO_EN_TRANSITO haber. Reusa la cuenta de B13.

⚠️ Decisión abierta importante: liquidar_efectivo_transito (de B13) está pensada para el sentido cobro (la plata entra a caja). Para el sentido pago es al revés — la plata sale de una caja real para reponer el tránsito. No escribí esa función todavía, dejé la decisión en el header: función separada (reponer_efectivo_transito) o generalizar liquidar_efectivo_transito con un parámetro de sentido.

Nota de proceso: al escribirla de memoria calqué mal el orden de p_created_by en la firma — Claude Code lo detectó antes de guardarla (habría creado una sobrecarga ambigua, mismo tipo de bug que la cuña de arqueo semanas atrás). Corregido partiendo del archivo real del repo, no de memoria.

Verificada con begin/rollback, compila limpio (depende de que 20260820100000 esté aplicada antes, en runtime).

---

### 💡 Propuesta · X1 cerrar_periodo con validación · para Facu

Miré X1 (cierre de período). Hallazgo: el bloqueo de ESCRITURA en período cerrado ya existe — periodo_de_fecha() lo rechaza con mensaje claro. Lo que faltaba era la función de CIERRE en sí: hoy es un UPDATE directo a periodo, sin validar nada antes.

Migración `20260820110000_x1_cerrar_periodo.sql`, sin aplicar. cerrar_periodo() rechaza si hay arqueos sin entregar a central dentro de ese mes (plata física sin conciliar). No valida cheques/compromisos/gastos devengados — los dejé afuera a propósito, más ambiguos.

2 decisiones abiertas en el header: si la validación de arqueos alcanza o hace falta más, y si reabrir_periodo necesita función propia o alcanza con UPDATE directo como hoy.

Verificada con begin/rollback, compila limpio.

---

### 💡 Propuesta · B13 efectivo en tránsito fuera de predio · para Facu

Escribí una propuesta para el caso que registrar_cobro rechaza hoy ("efectivo en poder de personal fuera de un predio... registralo cuando la plata llegue a una caja"). Migración `20260820100000_b13_efectivo_transito.sql`, sin aplicar.

Modelo: cuenta nueva EFECTIVO_EN_TRANSITO + dos funciones — recibir_efectivo_en_transito (asienta al cobrar, percibido puro, mismo patrón que cheque recibido) y liquidar_efectivo_transito (traslado a la caja real del predio cuando llega la plata, sin generar ingreso nuevo).

4 decisiones abiertas en el header del archivo — la más importante es la 4: propongo NO tener tabla de custodia aparte, que el saldo de la cuenta sea la fuente de verdad (mismo criterio que "el fondo sin saldo mantenido a mano", decisión 22). Si no cierra con cómo lo tenés pensado, avisá antes de que lo aplique.

Verificada con begin/rollback, compila limpio.

---

### 💡 Candidata · M3 alerta de cobertura de cheques emitidos · para Facu

Miré M3 del board (alerta si la suma de cheques emitidos pendientes supera el disponible en caja). Hoy no hay nada armado (verificado: sin función, sin vista, y la tabla cheque no tiene emitidos pendientes de prueba todavía).

Es vista de lectura pura — comparar suma de cheque.monto (sentido='emitido', estado='pendiente') contra saldo de caja, capaz cruzando con v_saldo_caja. Según el reparto, cae de tu lado (display/vistas), no lo tomé.

La dejo anotada por si la querés priorizar — las tablas ya están (las armaste vos esta semana), así que es rápida de construir cuando haya datos de cheques emitidos para probarla.

---

### 📋 Presupuesto · estado y plan · 19/08/2026 · de Facu para Horacio

*Doble función: el aviso de un cambio en `v_presupuesto_total` (tuya) y el
panorama del módulo, para que sepas qué sigue y qué te toca. La bitácora de
Notion no está disponible, así que esto es el canal.*

#### Lo que ya está bien

`v_presupuesto_total` está bien resuelta y conviene decirlo antes del cambio:
expone **`unidad` y `factor`** además del total, o sea que la pantalla puede
mostrar **de dónde sale** el número y no sólo el número —«$240.000 × 199
partidos»—. Eso es exactamente lo que una pantalla de presupuesto necesita, y no
es lo que uno encuentra por defecto.

Y la cadena completa **funciona**: `presupuesto → v_presupuesto_total →
v_cashflow_estimado → v_cashflow`. Cuando relevé la proyección de gastos por
jornada, resultó que ya estaba construida ahí.

#### El cambio de hoy · `20260819200000`

Un **borrador entraba a la proyección**. Verificado: creando un segundo
presupuesto del mismo torneo+ejercicio, en `borrador`, con UNA línea, el
estimado pasaba de −$93.473.000 a −$135.353.000. **$41.880.000 de una planilla
que nadie aprobó.**

Dos agujeros que se sumaban:

- **`v_presupuesto_total` no filtraba por `estado`.** El campo existía con su
  check `('borrador','aprobado')` y no lo leía nadie.
- **No había unique de negocio.** Los únicos índices únicos eran las dos PK, así
  que nada impedía dos cabeceras del mismo ámbito ni dos líneas de la misma
  categoría — y la vista las sumaba todas.

**No es error tuyo**, y es el patrón que venimos encontrando toda la semana: un
campo sin lector y una rama que **nunca se ejecutó**, porque nadie creó jamás un
borrador. No se notaba porque las 2 cabeceras que hay están en `aprobado`.

Lo aplicado:

```sql
create unique index presupuesto_ambito_uniq
  on presupuesto (torneo_id, ejercicio_id) nulls not distinct;
create unique index presupuesto_linea_uniq
  on presupuesto_linea (presupuesto_id, cat_gasto_id, concepto_id) nulls not distinct;

-- y en v_presupuesto_total, una sola línea:
  WHERE p.estado = 'aprobado'::text;
```

**`NULLS NOT DISTINCT` no es adorno.** `torneo_id` es NULL para la estructura
permanente y `concepto_id` es NULL en **las 6 líneas que existen**: con un unique
común, la línea no habría protegido nada. Postgres 17.6 lo soporta.

`v_cashflow_estimado` **no se tocó**: hereda el filtro por leer de esta vista.
Efecto hoy: **ninguno** — $139.300.000 y 602 filas, igual que antes, porque los
dos presupuestos están aprobados.

> Al escribir esto reconstruí tu vista de memoria en el primer intento y me
> quedó distinta en tres puntos silenciosos: el `COALESCE` de `unidad` tiene
> **tres** niveles (línea → concepto → categoría) y yo había salteado el del
> concepto; el factor `por_mes` usa `age()`; y el cálculo va en un `CROSS JOIN
> LATERAL` para resolverse una vez. Ninguno habría fallado — habría devuelto
> otros números. La migración lleva el cuerpo textual de `pg_get_viewdef` con el
> `WHERE` agregado, y la advertencia escrita para el próximo.

#### El plan de Presupuesto y el reparto

| Quién | Qué | Cuándo |
|---|---|---|
| **Facu** | Las 5 funciones de escritura: `crear_presupuesto`, `agregar_linea_presupuesto`, `editar_linea_presupuesto`, `borrar_linea_presupuesto`, `aprobar_presupuesto` | ya |
| **Facu** | `/presupuesto` — la pantalla de **carga** | ya, no depende de vos |
| **Horacio** | `cat_gasto_id` en `v_gasto_detalle`; `cat_gasto_id` + `torneo_id` en `v_gasto_categoria_mes` | **sin apuro, no bloquea nada** |
| **Facu** | `v_presupuesto_vs_real` + la pestaña de comparación | después de lo tuyo |

**Lo tuyo, con detalle.** Son dos columnas aditivas, misma clase que `origen_id`
y `tercero_id` de esta semana: `gasto` ya las tiene, es exponerlas.

Para qué: el **«presupuesto vs real»** cruza `presupuesto_linea.cat_gasto_id`
contra el gasto ejecutado. Pero `v_gasto_detalle` **sólo expone `categoria`
(texto)**, así que hoy la comparación únicamente se puede armar **uniendo por
nombre** — y un renombre la rompe **en silencio**: la categoría desaparece del
comparativo y su desvío pasa a ser el 100% del presupuesto. No es hipotético:
este repo tiene el commit **`776ddf9` «reordenamiento del plan de cuentas —
renombres, mover categorías»**.

Y `v_gasto_categoria_mes` **no tiene `torneo_id`**, mientras que el presupuesto
se organiza justamente por torneo vs estructura (`torneo_id NULL`). Sin ese eje
no se puede comparar «Clausura 2026» contra su propio gasto.

**La carga no depende de esto**, así que tomate el tiempo.

#### Decisiones tomadas

- **(A) Sólo el aprobado entra al cashflow.** Un borrador es planificación en
  curso: se arma, se discute, se corrige. No mueve la proyección.
- **(B) El aprobado se edita libremente.** El estado controla **qué proyecta**,
  no **qué se puede tocar**. Corregir un número de un presupuesto vigente es
  normal y no debería exigir desaprobar y reaprobar. Por eso la migración **no
  agrega ningún trigger que bloquee escrituras**.

#### Decisiones abiertas · si tenés opinión, es el momento

**1 · El precio duplicado.** `concepto_gasto.arancel_ref` existe y está **vacío
en los 100 conceptos**; el precio real vive en `presupuesto_linea.base`. Si la
pantalla edita `base`, `arancel_ref` queda muerto. Las opciones son depreciarla
o definirla como **default que la línea hereda** (que encaja con el patrón de
`unidad_default`, que sí se usa). Dos lugares para el mismo número es fábrica de
drift.

**2 · La cobertura.** El presupuesto cubre **6 de 32 categorías**. Lo no
presupuestado no se proyecta y **nada lo avisa**. ¿Deberían estar todas, o hay
naturalezas —`eventual`, `inversion`— que por definición no se presupuestan?

#### Nota de diseño, para que no sorprenda

Con el filtro puesto, **desaprobar un presupuesto le saca su monto al cashflow
sin aviso**: probado, pasar «Clausura 2026» a borrador mueve el estimado de
−$93.473.000 a −$22.723.000. Es el comportamiento correcto por la decisión (A),
pero la pantalla lo va a advertir antes de confirmar —mismo criterio que el
diálogo de rechazo de cheques—, y `/proyeccion` debería avisar cuando hay
borradores que no está contando.

> Como siempre: si algo de esto choca con lo que tenías pensado, avisá y lo
> revisamos antes de que crezca.

### 🔧 Aplicado · `por_mes` del estimado, por diferencia · 19/08/2026 · de Facu para Horacio

Cierra el pendiente del aviso de más abajo. **Las tres ramas de
`v_cashflow_estimado` descuentan ahora su gasto real** — pero con **dos
criterios distintos, y es a propósito**.

#### Por qué dos criterios

| rama | criterio | por qué |
|---|---|---|
| `por_partido` · `por_dia_cancha` | **binaria** — el gasto real apaga la estimación entera | la factura del árbitro cubre la jornada completa |
| `por_mes` | **por diferencia** — `GREATEST(presupuestado − real del mes, 0)` | los fijos entran **fraccionados**: un alquiler por predio, sueldos en cuotas |

Con la regla binaria en `por_mes`, **el primer gasto que se cargara apagaría el
mes entero**. Con los datos de hoy: $777.000 cargados habrían apagado una
estimación de $1.900.000, y la proyección quedaría **$1.123.000 corta** — sin
ninguna alarma. Un cashflow que sobreestima gastos molesta; uno que los
subestima miente en la dirección peligrosa.

Por diferencia, la fila **no desaparece: se achica**, y muestra el hueco que
falta cubrir. Más informativo que borrarla.

#### El tope en 0 no es cosmético

Si el real supera al presupuestado, el exceso **ya está** contado como gasto
real en `v_cashflow_comprometido`. Sin el `GREATEST`, la diferencia daría
negativa y —al invertir el signo— la vista emitiría un monto **positivo**: un
gasto convertido en ingreso. Verificado tras aplicar: **0 filas con monto > 0**
en toda la vista.

**Los dos criterios están escritos en el `comment on view`**, para que la
asimetría entre ramas no se lea como un descuido de alguien.

#### Efecto medido

```
602 filas · −$93.473.000
partido=500 (binaria, intacta) · dia_cancha=92 (binaria, intacta) · mensual=10
Alquileres 31/08:      −$1.123.000   ← era −$1.900.000
Alquileres 30/09:      −$1.900.000   ← sin gasto real, estimación completa
Sueldos adm. 31/08:    −$2.800.000   ← sin gasto real, completa
```

#### ⚠️ Un hallazgo que no es tuyo, pero conviene que sepas

Los $777.000 que achican agosto **son basura de prueba**:

| concepto | total | devengado |
|---|---|---|
| `PRUEBA DESDE PANTALLA · con sesión de Mati` | $333.000 | 10/08 |
| `PRUEBA SIN FALLBACK · Mati, paso 3` | $444.000 | 10/08 |

Quedaron en producción y **ensucian los dos lados a la vez**: achican el
estimado de agosto e inflan el comprometido como gasto impago.

Se corrige solo al limpiarlos —agosto vuelve a −$1.900.000 y el comprometido
baja $777.000—, **sin tocar ninguna vista**. Pero no se borran: tienen asiento
de devengo, así que por la regla 4 van con `anular_gasto`, que contraasienta.
Con el filtro de anulados que ya tienen las tres ramas, anularlos alcanza.
Limpieza aparte, la encara Facu.

> **Si ves un caso donde alguno de los dos criterios descuenta de más o de
> menos, avisá.** El binario asume factura por ocurrencia completa; el de
> diferencia asume que todo lo cargado en el mes corresponde a ese presupuesto.

### 🔧 Aplicado · doble conteo en `v_cashflow_estimado` · 19/08/2026 · de Facu para Horacio

**Otra vista tuya que toqué.** Ya está aplicada (`20260819180000`).

**El contexto:** relevando la proyección de gastos por jornada me encontré con que
`v_cashflow_estimado` **ya hace** lo que íbamos a construir —cruza presupuesto ×
calendario, respeta las suspensiones y proyecta por fecha de jornada—. Muy bien
resuelto. Lo que no hacía era descontar lo que ya está cargado.

#### El problema

La vista proyecta cada jornada futura, pero **no miraba si el gasto real de esa
jornada ya existía**. Cuando existe, la jornada se cuenta dos veces: una acá y
otra en `v_cashflow_comprometido` (rama `gasto_impago`).

Probado en rollback antes de tocar nada: cargando el gasto real de árbitros de
la jornada del 22/08 por $1.200.000, **el estimado no se movía** y el
comprometido sumaba. $1.200.000 duplicados en la misma fecha.

**No es un error de diseño tuyo.** La única defensa era temporal —`fecha >
CURRENT_DATE`— y con los 7 gastos reales que hay, todos de fechas pasadas, la
rama **nunca se ejecutó**. El doble conteo aparece recién cuando se carga el
gasto de una jornada que todavía no se jugó, que es lo normal cuando la factura
del árbitro entra por adelantado. Es el mismo patrón que ya nos mordió tres
veces: una rama que nadie ejecutó esconde su error.

#### El fix

`NOT EXISTS` contra `gasto`, en las dos ramas que cruzan calendario:

| rama | clave de exclusión |
|---|---|
| `por_partido` | `(cat_gasto_id, jornada_id)` |
| `por_dia_cancha` | `(cat_gasto_id, predio_id, devengado_at)` |

**Exclusión binaria** —decisión de Facu—: si hay gasto real de esa categoría en
esa jornada, se saca la estimación **entera** de esa jornada. No se descuenta el
importe ni se compara contra lo presupuestado, porque las facturas vienen por
jornada completa.

**Por (categoría, ocurrencia), nunca por jornada entera.** Si se carga árbitros
pero no operativos de la misma jornada, operativos sigue estimado. Verificado:
árbitros del 22/08 bajó $240.000 —una jornada exacta— y operativos quedó igual.

**El filtro de anulados va por `v_gasto_detalle.estado`**, que deriva de
`asiento.anulado_por`. No es decorativo: `anular_gasto` limpia `pagado_at`, así
que sin el filtro un gasto anulado sacaría su jornada del estimado y **la plata
desaparecería de la proyección** — el espejo del bug de la 5ª rama. Verificado:
al anular, la estimación vuelve entera.

#### Contra `gasto_planificado`, que vos ya resolviste bien

Ese caso no tenía el problema: `estado = 'pendiente'` + `marcar_gasto_planificado_ejecutado`
es un **vínculo explícito, uno a uno**. No se pudo calcar porque una línea de
presupuesto **no materializa filas**: no representa un pago sino N pagos
repartidos por el calendario, así que no hay fila que apagar. Hay que apagar la
*ocurrencia*, y eso sólo se puede hacer con un `NOT EXISTS` en la vista. Mismo
principio —lo real desplaza a lo estimado—, mecanismo distinto.

#### Dos cosas que quedan abiertas, y una corrección

**1 · La rama `por_dia_cancha` está cubierta a medias.** Compara contra
`g.predio_id`, y `check_gasto_coherente` exige `jornada_id` pero **no** exige
predio: los 3 gastos `por_dia_cancha` que hay lo tienen en NULL. La cláusula es
correcta y no da falsos positivos, pero **hoy no dispara**.

No lo resolví por `(categoría, fecha)` porque las **29 fechas de días de cancha
tienen los 2 predios**: un solo gasto mataría las dos filas y cambiaría
sobreestimar por subestimar — que es peor, porque un cashflow que subestima
gastos no dispara ninguna alarma.

> **Tarea para vos:** que `predio_id` pase a obligatorio en gastos de categorías
> con `unidad_default = 'por_dia_cancha'`. Con eso la cláusula empieza a
> funcionar sola, sin volver a tocar la vista.

**2 · `por_mes` quedó fuera de ESTA migración, pero ya está cerrada.**
Se resolvió el mismo día en `20260819190000`, con criterio propio — ver el
bloque siguiente. *(La nota original decía que quedaba pendiente; se corrige
acá para que no quede desactualizada.)*

#### Efecto medido

Ninguno, todavía: **602 filas y −$94.250.000, igual que antes**. Los 7 gastos
reales son de jornadas pasadas y el estimado sólo mira adelante. El fix no
cambia un solo número hoy — cambia lo que va a pasar en cuanto alguien cargue el
gasto de una fecha que no se jugó.

> **Si ves un caso donde la exclusión binaria descuenta de más o de menos,
> avisá.** La decisión de que sea binaria asume que la factura cubre la jornada
> completa; si hay categorías donde se factura parcial, el criterio hay que
> revisarlo.

### 🔧 Aplicado · dos cambios a `v_cashflow_comprometido` · 19/08/2026 · de Facu para Horacio

**Es tu vista y la toqué.** Las dos ya están aplicadas y pusheadas
(`20260819120000` y `20260819130000`). Te cuento qué y por qué, y una parte es
para que la revises vos.

**El contexto:** arranqué el **Calendario de pagos**, y la fuente correcta es
`v_cashflow_comprometido` — no `v_calendario_pagos`, que a pesar del nombre lee
sólo `compromiso` (1 de las 5 ramas, tabla vacía). Construyendo encima
aparecieron dos cosas.

#### 1 · `origen_id` en las 5 ramas — aditivo

La vista daba 7 columnas y ninguna era un id. Para el cashflow no hacía falta
—ahí se suma por fecha y nivel—, pero un calendario necesita dos cosas que sin
id no se pueden: una **clave de fila** y el **enlace al origen** (poder clickear
un vencimiento e ir al equipo, al cheque o al gasto).

Cada rama ya tenía su id a mano, así que fue exponer lo que estaba:
`ec.id` · `q.cuota_id` · `cm.id` · `ch.id` · `g.id`.

Tres cosas que quizá te ahorren una duda:

- **Va última, no al lado de `origen`.** `create or replace view` no deja
  reordenar ni cambiar columnas existentes: sólo agregar al final.
- **Lo que identifica es el PAR `(origen, origen_id)`.** Los ids vienen de
  tablas distintas y solos no son únicos.
- **No rompió a nadie.** Tus dos consumidores leen por columna nombrada:
  `v_cashflow` enumera `(fecha, nivel, origen, detalle, monto)` en su `UNION ALL`
  —una columna nueva no entra ni descuadra el arity— y `/proyeccion/[periodo]`
  hace `.select('*')` y mapea por nombre. Verificado antes y después: 284 filas,
  mismo neto, `v_cashflow` idéntico.

#### 2 · La rama de sponsors ahora arrastra lo vencido — esta miralá

**El síntoma:** la rama de sponsors leía `v_cuotas_sponsor_futuras`, que filtra
`fecha_cobro >= current_date`. Por eso tenía `false as arrastrada` fijo: no es
que no arrastrara, es que lo vencido no llegaba. Resultado, **una cuota de
sponsor vencida e impaga —$4.000.000 de Bodega Los Cerros, vencida el 05/08—
no aparecía en la proyección ni en ningún lado.**

**Ahora lee `v_cuotas_sponsor` con `where cobrado_at is null`**, y aplica el
mismo patrón `GREATEST` / `fecha_original` / `arrastrada` que las otras cuatro.

**Que quede claro: no es un error tuyo.** Esa rama es de la migración original
de cashflow; tu 5ª rama heredó el filtro tal cual y calcó bien el patrón de las
demás. Lo que estaba viejo era la **elección de fuente**, no tu trabajo.

**Y no es un cambio de criterio, es deuda de sincronización.** Cuando se escribió
esa rama (**decisión 77**) el mecanismo de arrastre **no existía**: filtrar el
pasado era la única forma de que una fecha vieja no ensuciara la proyección.
`GREATEST`/`fecha_original`/`arrastrada` llegó después, las cuatro ramas nuevas
lo usan, y sponsors quedó atrás.

La evidencia de que esconder lo vencido no era la regla:

- `v_cuotas_sponsor` deriva un estado **`'vencida'`** explícito — el modelo sí
  reconoce el vencimiento de una cuota de sponsor.
- La migración `20260809155729` ya lo había marcado, con todas las letras: *«una
  cuota VENCIDA E IMPAGA —el caso que más importa mirar— desaparecía de la
  pantalla el día que se vencía. Un sponsor moroso era invisible.»* Se arregló
  para la pantalla y se **difirió** para el cashflow. No se decidió que estuviera
  bien.
- No hay asimetría de negocio: un equipo que no pagó cuenta como plata por
  cobrar; un sponsor que no pagó, también. Si la diferencia fuera la
  cobrabilidad, eso se expresa con el **nivel** (comprometido vs estimado), no
  borrando la fila.

**`v_cuotas_sponsor_futuras` NO se tocó.** Su nombre, su comentario y la decisión
77 que la referencia siguen honestos: es «cuotas por vencer» y eso sigue siendo.
Lo único que cambió es de dónde **lee** la rama del cashflow. Verificado después
de aplicar: sigue con sus 3 filas, su filtro y su comentario intactos.

**Efecto medido:**

| | antes | después |
|---|---|---|
| filas | 284 | **285** |
| neto | $255.258.233 | **$259.258.233** |
| arrastradas | 67 | **68** |
| ramas | `cuota_equipo=274 · cuota_sponsor=3 · gasto_impago=7` | `cuota_equipo=274 · cuota_sponsor=4 · gasto_impago=7` |

Sube el comprometido a cobrar en $4.000.000. Es plata que se debe de verdad;
que aparezca es el punto.

> **Si ves una razón por la que sponsors debía filtrar lo vencido —algo que no
> vimos—, avisá y lo revisamos.** La evidencia dice inconsistencia, no criterio,
> pero la rama es de tu módulo y la última palabra sobre el porqué la tenés vos.

#### 3 · `tercero_id` en las 5 ramas — aditivo, mismo espíritu que `origen_id`

`origen_id` identifica el **registro** que vence, y alcanza para enlazar donde la
pantalla de destino se abre por ese registro: `/cheques/[cheque_id]`, `/gastos`.
Pero para una cuota de equipo el destino natural es la cuenta corriente del
**equipo**, y ahí `origen_id` es el id de la CUOTA. Con sólo ese id el calendario
podía decir «vence una cuota de Alayama LF» y no poder llevarte a Alayama LF.

Se puebla donde existe, y donde no, va NULL:

| rama | `tercero_id` | enlace de la pantalla |
|---|---|---|
| `cuota_equipo` | **siempre** · 274/274 | `/cobranza/[tercero_id]` |
| `cuota_sponsor` | **siempre** · 4/4 | `/sponsors/[tercero_id]` |
| `compromiso_*` | a veces (la columna es nullable) | según tipo |
| `cheque_*` | sólo **recibido** | `/cheques/[origen_id]` |
| `gasto_impago` | **nunca** · 0/7 | `/gastos` |

Dos aclaraciones para que los NULL no se lean mal:

- **En cheques el enlace NO va por tercero**, va a `/cheques/[origen_id]`, que es
  donde está el circuito. `tercero_id` se expone igual porque es dato real —de
  quién es el cheque recibido— y porque habilita filtrar «todo lo de este
  tercero» cruzando ramas. En un **emitido** es NULL, por lo mismo que /cheques
  rotula «Categoría» y no «Contraparte»: `gasto` no registra a quién se le paga.

- **En `gasto_impago` es NULL siempre y no es un olvido**: `gasto` no tiene
  `tercero_id`. Es la limitación conocida del modelo de gastos. El día que tenga
  proveedor, la rama se puebla cambiando una línea.

> **Un NULL no significa «no se puede enlazar»: significa «no se enlaza por
> tercero».** La pantalla resuelve el destino por `origen`, no por si el
> `tercero_id` vino o no.

**Verificado con la vista dependiente encima.** `v_calendario_dia` —la vista
nueva del calendario, que agrupa `v_cashflow_comprometido` por día— ya estaba
creada cuando se hizo el `create or replace` de la base. No la rompió: no
selecciona `tercero_id` y agrupa por `fecha_original`. Después de aplicar: 285
filas y neto $259.258.233 en la base, 36 días en `v_calendario_dia`, y
`v_cashflow` en 26 filas con el mismo comprometido. Ningún consumidor se movió.

### 🔧 Corregido · la 5ª rama excluía mal los gastos anulados · 19/08/2026 · de Facu para Horacio

**La rama estaba bien hecha.** Tres cosas que salieron derecho y vale marcarlas:

· **El timestamp ordena.** `20260817160000`, posterior a lo último aplicado
  (`20260817150000`). La regla quedó.
· **El `UNION` es aditivo de verdad.** Las cuatro ramas anteriores —cuotas de
  equipo y sponsor, compromisos, cheques— quedaron **idénticas**. Verificado
  contando filas por origen antes y después: 274 y 3, iguales.
· **El patrón está calcado.** `GREATEST(devengado_at, CURRENT_DATE)`,
  `fecha_original`, `arrastrada`, monto negativo. Es exactamente el criterio de
  las otras ramas, con `devengado_at` en lugar de `vence_at` — y la explicación
  de por qué en el encabezado.

---

#### Lo que faltaba: excluir los gastos anulados

El filtro era `pagado_at is null and devengado_at is not null`. **`anular_gasto`
limpia `pagado_at`**, así que un gasto anulado cumple las dos condiciones y
entraba a la proyección.

Con los datos de hoy:

| | filas | monto |
|---|---|---|
| devengados impagos (correcto) | 7 | −12.194.767 |
| **anulados, que se colaban** | **2** | **−3.350.000** |
| lo que proyectaba | 9 | **−15.544.767** |

Sobreestimaba los egresos comprometidos en **$3.350.000**, y del modo que no se
nota: el número sigue siendo plausible.

**El fix son dos líneas:**

```sql
     join v_gasto_detalle d on d.gasto_id = g.id
...
   and d.estado <> 'anulado';
```

---

#### La regla, para las próximas vistas que lean `gasto`

**Toda vista que lea `gasto` tiene que excluir los anulados**, y el filtro sale
de **`v_gasto_detalle.estado`** — no de reimplementarlo.

Esa vista ya deriva la anulación desde `asiento.anulado_por`, que es la fuente de
verdad: un gasto está anulado si su asiento de devengo lo está. Escribir la
condición a mano en cada vista es tener la misma regla en varios lugares, y
alcanza con que una quede vieja.

**Es la segunda vez que aparece.** La primera fue en `v_activo`: la Desmalezadora
tiene dos gastos apuntándola —el original mal imputado y el que lo corrige— y un
join ingenuo mostraba un valor de compra de $2.900.000 en vez de $1.450.000. El
mismo filtro lo resolvió.

---

#### Cómo se corrigió, y por qué así

**En el archivo, no con una migración aparte.** Todavía no estaba aplicada, así
que la vista **nunca llegó a existir con el error** y el historial no queda con
un bug seguido de su parche. Si ya hubiera estado aplicada, iría una migración
nueva — la regla 4 vale para asientos, pero una migración sin aplicar todavía es
un borrador.

Tu commit `c6d6145` y el contenido actual del archivo difieren por eso; está
explicado en el encabezado del propio `.sql`.

**Ya aplicado.** `v_cashflow_comprometido` quedó con sus 5 ramas y 284 filas, la
nueva con 7 filas por −$12.194.767. `db push --dry-run` volvió a **«Remote
database is up to date»**.

---

#### Y una cosa del modo de trabajo

**Commitear a main sin aplicar, para revisión, funciona mejor que las ramas.** Se
ve el cambio en su lugar definitivo, el timestamp ya queda fijado, y no hay que
resolver después cómo entra. Lo único a tener presente es que mientras haya algo
sin aplicar el `--dry-run` no da limpio — así que conviene avisar, como hiciste.

Seguí así.

---

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
| **1** | **Presupuesto por fecha** | Completo y **con datos**: 6 líneas cargadas. `/proyeccion` ya lo usa vía `v_cashflow_estimado` |
| **2** | ~~**Activos**~~ · ✅ **construida** | Lista, detalle, alta y asentar amortización. `asentar_amortizacion` + las tres vistas |
| **3** | ~~**Cheques**~~ · ✅ **construida** | Cartera, detalle y las tres acciones. Terminó siendo más que display: llevó el asiento del rechazo, el nacimiento de los emitidos y `v_cheque`/`v_cheque_kpi` |
| **4** | **Calendario de pagos** *(la que sigue)* | `v_calendario_pagos` completa, con `tercero` y `criticidad` |

> **Nota de secuencia, no de bloqueo.** Estas pantallas leen tablas que hoy están
> **vacías** —`cheque` 0 filas, `compromiso` 0 filas, `amortizacion` 0 filas—
> porque todavía nada las escribe. Se construyen igual y **es deliberado que vayan
> en paralelo**: cuando el carril de escritura llegue, la pantalla ya está
> esperando.
>
> **Lo que enseñó Cheques:** «backend listo, falta el front» era optimista. Al
> construir la pantalla aparecieron tres bugs latentes que nunca habían disparado
> porque nadie usaba el circuito — el rechazo no asentaba nada, `pagar_gasto`
> acreditaba la cuenta equivocada, y el check de `gasto.medio_pago` ni siquiera
> aceptaba `'cheque'`. **Una tabla vacía esconde sus errores.** Vale la pena
> asumir que las otras dos también los tienen.

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
