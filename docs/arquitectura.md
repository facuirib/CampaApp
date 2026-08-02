# Campa — Arquitectura

**Versión:** Draft 21 · agosto 2026 · módulo USD: caja de cobertura valuada por promedio ponderado, diferencia de cambio solo realizada, y el diario confirmado monomoneda
**Referencias:** `supabase/migrations/` (esquema ejecutable) · `CLAUDE.md` (reglas) · `docs/decisiones.md`
**Stack:** Next.js 15 (App Router + TypeScript) · Tailwind · Supabase (Postgres + Auth + RLS) · Vercel

**Alcance.** Campa es una herramienta de **gestión financiera** para la operación de un torneo de fútbol amateur. Reemplaza cinco planillas de Excel por una fuente única de datos.

**Lo que Campa no es.** No es un sistema contable. La contabilidad formal —balance, liquidación de IVA, amortizaciones fiscales— la hace un estudio externo. Campa incorpora los criterios contables que **afectan la lectura financiera** y descarta los que solo sirven para el balance.

La partida doble está por debajo de todo el sistema, pero como **garantía de consistencia**, no como producto: es lo que impide que dos pantallas muestren números distintos.

## Qué cambió desde el Draft 20

Tercer módulo de la capa societaria, y **el más liviano: no se crea estructura**. La tabla `usd_operacion`, la caja USD y las cuentas `CAJA_USD` y `FIN_DIF_CAMBIO` ya existían desde el schema inicial, sin uso. Solo faltaba la lógica.

**El diario es monomoneda, y se explicita como principio** (§3.7). `asiento_linea` no tiene moneda ni cantidad, y no hay ninguna columna de divisa en el schema. La complejidad del dólar queda **aislada en `usd_operacion`**: la **tenencia** sale de ahí, el **costo en libros** del diario, y el PPP es el puente. Ya estaba así; ahora está dicho.

**Valuación por promedio ponderado** (§3.7). `costo_libros / tenencia_usd`, **derivado y no guardado**. Se mantiene solo: al vender, `CAJA_USD` baja exactamente por el costo de salida, así que lo que queda conserva el promedio.

**La diferencia de cambio es solo realizada** (§3.7). Los dólares quedan a su costo hasta que se venden; nada de ganancias en papel. **`revaluacion` sale del dominio** de `usd_operacion.tipo` — un valor que el modelo no usa es una trampa, misma limpieza que `por_jornada` en la pieza 5. Esto **reemplaza** la fila "Revaluación → no realizado" que §3.7 traía del schema original.

> **Dos cosas que el relevamiento encontró.** `FIN_DIF_CAMBIO` es de tipo `financiero`, así que `v_resultado_producto` no la toma —correcto por la decisión 12— pero **la "línea aparte" donde debería verse no existe**: ninguna vista la lee, y hoy la diferencia de cambio se registraría sin aparecer en pantalla. Y el promedio cruza **dos fuentes**: si alguien asienta contra `CAJA_USD` sin registrar la operación, el promedio queda mal **en silencio** y todas las ventas posteriores salen a un costo equivocado.

---

## Qué cambió desde el Draft 19

Segundo módulo de la capa societaria.

**Devengo lineal · el tercer patrón de reconocimiento** (§3.20). Equipos por percibido puro, socios por devengo mensual de un fijo, sponsors por **devengo lineal prorrateado**: el contrato se reconoce repartido en los meses que cubre. Tres naturalezas distintas, tres tratamientos, cada uno argumentado.

**Dos calendarios separados** (§3.20). El **reconocimiento** es parejo y mensual —responde *cuánto ganó el negocio este mes*—; el **cobro** son las cuotas en sus fechas —responde *cuándo entra la plata*—. Un contrato de 1.200.000 reconoce 100.000 por mes y puede cobrarse en tres cuotas de 400.000. Colapsarlos obligaría a mentir en una de las dos preguntas.

**Ingreso diferido como pasivo que se libera** (§3.20). Al firmar se asienta `DEUDORES_SPONSORS` / `INGRESO_DIFERIDO` **sin tocar el P&L**: se firmó, no se ganó nada aún. Cada mes el devengo libera una porción contra `ING_SPONSORS`.

**De las tres cuentas, una ya existía.** `ING_SPONSORS` está en el plan desde el schema inicial, sin uso. Se crean `DEUDORES_SPONSORS` e `INGRESO_DIFERIDO`. **Cuenta de deudores propia y no la `DEUDORES` genérica**: ésa se diseñó para equipos y la decisión 1 la sacó de juego, así que reusarla mezclaría deuda de equipos —que no es saldo contable— con deuda de sponsors, que sí lo es.

**Nivel empresa, `torneo_id = NULL`** (§3.20), como los sueldos de socios. El contrato es anual y cubre los dos torneos. **Consecuencia a tener presente:** el ingreso de sponsors no entra en la contribución de ningún torneo, y `v_comparador_torneos` compara sin él.

> **Un detalle que parece menor y no lo es** (§3.20). `total / meses` no siempre da exacto: 1.000.000 en 12 meses deja 0,04 huérfanos, y `INGRESO_DIFERIDO` nunca cerraría en cero. **El último período devenga el remanente** en vez de la cuota teórica, así el pasivo cierra exacto por construcción.

---

## Qué cambió desde el Draft 18

Primer módulo posterior al rediseño calendario-por-serie. Introduce **dos patrones que el sistema no tenía**.

**El sueldo del socio se devenga — Forma B** (§3.19). Es la **excepción deliberada al percibido puro** de §1.b, y no una inconsistencia: el ingreso de un equipo puede no ocurrir nunca, pero el sueldo del socio es un compromiso cierto que existe cada mes se retire o no. No registrarlo hace que **la caja parezca toda del negocio cuando parte ya está comprometida**.

**Dos cuentas nuevas: `GAS_SOCIOS` (egreso) y `SOCIOS_A_PAGAR` (pasivo)** (§3.19). Egreso y no patrimonio: el sueldo de socios es **costo del negocio**. Cuenta propia separada de `GAS_SUELDOS` para poder distinguir el sueldo operativo del de los dueños. **Ninguna vista se toca**: `v_resultado_producto` filtra por tipo de cuenta, así que `GAS_SOCIOS` entra al P&L y el pasivo no.

**Es costo de la empresa, no del torneo** (§3.19). El asiento va con `torneo_id = NULL`, a nivel estructura permanente: el sueldo existe todos los meses haya torneo o no, e imputarlo a uno exigiría el prorrateo que la **decisión 5** prohíbe. La contribución de cada torneo queda intacta; lo que baja es el resultado de la empresa.

**El sueldo acordado se versiona con historial** (§3.19). **Primer parámetro versionado de verdad**: `config_contable` tiene `vigente_desde` pero es una fila única sin historial —y no la lee nadie—, así que no servía de molde. Cambiar el sueldo es insertar una fila, no editar: es lo que permite recalcular un mes viejo con el sueldo que regía entonces.

**El devengo mensual escribe solo** (§3.19). **Rompe con el único precedente** de proceso mensual: `proponer_amortizaciones` propone y el operador confirma (decisión 23), porque una amortización es una estimación. El sueldo es un monto acordado y conocido — no hay nada que revisar. Idempotente por `(socio, período)` y disparado explícitamente, no por cron.

**El retiro de sueldo no se mezcla con el fondo de inversión** (§3.15, §3.19). El fondo ya modela plata de socios en el sentido contrario. Uno cancela un pasivo devengado, el otro mueve respaldo: cuentas y conceptos separados, o `v_dependencia_fondo` deja de significar lo que dice.

---

## Qué cambió desde el Draft 17

**Los playoffs ya colgaban de serie** (§3.5). La pieza 1 movió *toda* `jornada`, no solo la liga. La pieza 6 **no mueve nada**: cierra tres agujeros que quedaron abiertos porque la rama `es_playoff` nunca se ejercitó — no hay puerta de creación (`crear_jornada` hardcodea `es_playoff = false`), el `unique (serie_id, numero)` no protege playoffs porque `numero` es `NULL`, e `instancia` no tiene dominio.

**El formato de instancia es una tabla, no un CHECK** (§3.5). `formato_instancia (nombre, cantidad_partidos, orden)`, sembrada con cuartos=4 / semifinal=2 / final=1. Cerrarlo con literales sería violar la regla 12: otro torneo puede tener octavos, repechaje o final a ida y vuelta, y tiene que entrar con sus datos sin tocar código.

**`crear_playoff` es la cuarta puerta** (§3.5). Extiende la decisión 49 al playoff. Valida contra el formato y contra `(serie_id, instancia)`, que es la identidad natural que faltaba. `mover_jornada` y `suspender_jornada` ya servían.

**`equipo_playoff` — quién juega cada instancia** (§3.5). En la liga juegan todos los de la serie siempre; en playoff **la clasificación es dato** y no se deriva de nada. Sin esa tabla no hay a quién cobrarle.

**La cuota de playoff se genera después de la ficha, por instancia jugada** (§3.5). B0 sigue excluyéndolas y está bien: al armar la ficha no se sabe si el equipo va a clasificar, y facturarle a 16 equipos una final que juegan 2 sería inventar deuda. Se cobra lo que se juega a medida que se juega.

> **⚠ Bug latente que esta pieza destapa** (§3.3, §3.5). `v_torneo_escala.partidos` calcula `equipos ÷ 2` por jornada **sin excluir playoffs**: la final de Libre A daría 8 partidos en vez de 1. Con 3 instancias × 20 series el presupuesto `por_partido` se infla mucho y **en silencio** — misma clase que la bomba del 284. Hoy no molesta porque hay 0 playoffs. **La decisión 45 queda acotada a la liga**: en un cuadro la cantidad de partidos depende del formato, no del tamaño de la serie.

---

## Qué cambió desde el Draft 16

**El arqueo cuelga de `dia_cancha`** (§3.6). `jornada_id` + `predio_id` → `dia_cancha_id`, más el `unique` que hoy falta. Implementa la decisión 46, que estaba escrita en presente sin estar construida. La tabla tiene 0 filas y ningún consumidor: no hay backfill.

**El efectivo se consolida en dos etapas** (§3.6). Cobro y arqueo pasan el fin de semana en el predio; la entrega a central es el lunes. **No hay estado contable intermedio "en tránsito"**: el arqueo pendiente *es* el estado, y el saldo sin rendir de una persona sale de sumar sus arqueos pendientes. Inventarle una cuenta sería modelar un pasivo que se resuelve solo el lunes.

**Escenario A: la plata baja al entregar, no al arquear** (§3.6). Un único asiento predio → central en la entrega. **El arqueo del fin de semana es control puro y no mueve plata.**

**`saldo_sistema` se congela** (§3.6). El arqueo es un acta histórica: si mañana se corrige un asiento viejo, el saldo esperado de ese arqueo no cambia. Se deriva del diario al calcularlo; lo que se guarda es la foto.

**La diferencia se registra, no se resuelve** (§3.6). Faltante o sobrante quedan asentados y ahí se detienen. Quién se hace cargo es un paso posterior, y puede no ocurrir nunca. **Reemplaza** al criterio anterior, que la resolvía con un asiento como parte del arqueo.

> **Dos bloqueos estructurales encontrados al relevar** (§3.6). El asiento predio → central **no se puede expresar hoy**: `asiento_linea` no tiene `predio_id` —el predio está en la cabecera—, así que con una sola cuenta `CAJA_EFECTIVO` las dos líneas del traslado se netean a cero y el saldo del predio no baja. Y `check_caja_predio` rechaza una caja de efectivo sin predio, que es exactamente lo que sería la central. La salida propuesta es una cuenta `CAJA_CENTRAL` propia; se cierra al construir.

**Correcciones doc↔schema** (§3.6). `caja` se documentaba como `(id, tipo unique)` y la tabla real siempre fue `(id, tipo, nombre, predio_id, activo)` — `tipo` no es único porque hay una caja de efectivo por predio. Y `arqueo` se documentaba con `fecha date not null`, que nunca existió. **Tercera aparición del mismo patrón** (antes: `presupuesto_linea`): conviene una pasada de verificación doc↔schema.

---

## Qué cambió desde el Draft 15

**El costo variable tiene tres unidades, y `por_jornada` no es ninguna de ellas** (§3.3). `por_jornada` **sale del dominio**: era la unidad correcta cuando una jornada era la fecha N de un género, y dejó de serlo cuando pasó a ser la fecha N de una serie. La reemplazan **`por_partido`** y **`por_dia_cancha`**. `por_mes`, `anual` y `unico` no se tocan.

**La unidad vive en el catálogo, con override en la línea** (§3.3). Un concepto tiene *naturalmente* su unidad —un arbitraje es por partido, siempre— así que el default va en `cat_gasto`/`concepto_gasto` y se hereda. La línea de presupuesto puede sobrescribirlo para el caso raro. Sin el default, cada línea nueva vuelve a decidir algo que ya estaba decidido, y basta una mal cargada para que el total se corra.

**`dia_cancha` es una tabla propia** (§3.5). La entidad `(fecha, predio)` que el Draft 15 nombró no existía en la base: `jornada` no tiene predio, y las únicas tablas con fecha *y* predio son de movimiento —`asiento`, `gasto`, `pago`—. No se puede contar los días de cancha de un torneo mirando los gastos ya cargados. **Es compartida**: el presupuesto la cuenta, el arqueo (§3.6) cuelga de ella. Una sola definición de "día de operación de un predio", no dos.

**Se desarma la bomba de `v_presupuesto_total`** (§3.8). Hoy multiplica por `count(*) from jornada … estado <> 'suspendida'`. Con jornadas por género daba 28; con jornadas por serie da **284**. Un presupuesto se habría mostrado **diez veces más grande** sin que nada fallara ni avisara. Pasa a multiplicar por la unidad que corresponde a cada línea. **Las tablas de presupuesto están vacías** —0 filas en `presupuesto`, `presupuesto_linea` y `gasto`—, así que se arregla antes de que exista el primer número mal.

**Clasificación inicial de las 16 categorías `por_fecha`** (§3.3): 3 por partido, 8 por día de cancha, 5 aparte (4 de bar + 1 de administración). El bar no escala con partidos ni con días de cancha —escala con consumo— y tiene su propio tratamiento.

---

## Qué cambió desde el Draft 14

**Gestión de jornadas por funciones validadas** (§3.5). `crear_jornada`, `mover_jornada` y `suspender_jornada`. **Una lógica, dos puertas**: el seed que carga el Clausura y el módulo de calendario que vendrá después llaman a las mismas funciones. No hay dos caminos que validen distinto. Son agnósticas del torneo (regla 12): reciben serie, número y fecha.

**La autonomía de la cuota es parcial** (§3.4). Refina la decisión 41 sin contradecirla: el **monto** se copia siempre, pero el **vencimiento** solo en las cuotas fijas. La cuota de liga lo **deriva de `jornada.fecha`** en vivo. La inscripción vence un día administrativo fijo; la de liga vence cuando se juega esa fecha, y esa fecha puede moverse.

**Suspender una jornada saca su cuota del circuito de cobro** (§3.5). Un equipo cuya fecha se suspendió **no es moroso de esa cuota**: no se jugó, no corresponde reclamarla. Vuelve al circuito al reprogramar, con el vencimiento nuevo.

**Las vistas de deuda tienen que distinguir los dos tipos de cuota.** Fija por `vence_at` propio; de liga derivando de la jornada y excluyendo las suspendidas. Es el punto de la pieza que más cuidado necesita: si una vista se olvida, un equipo aparece debiendo algo que nadie le va a cobrar.

**Queda por resolver al construir:** `cuota.vence_at` es hoy `NOT NULL`. Derivar el vencimiento obliga a elegir entre dejarlo nulo para las cuotas de liga —fuente única— o mantenerlo como caché sincronizada por trigger.

**Nada de esto está construido.** Es la pieza 2 del rediseño: las funciones, los cambios de vista y el seed de las 284 jornadas se hacen juntos, contra esta sección.

---

## Qué cambió desde el Draft 13

**La jornada cuelga de la serie, no del género.** Identidad `(serie_id, numero)`; el género y el torneo se derivan subiendo `serie → categoria`. El modelo anterior no podía representar el calendario real: distintas series del mismo género juegan la misma fecha en días distintos —Libre A su fecha 3 el 15/8, +35 B el 29/8— y `(torneo, genero, numero)` colapsaba fechas que en la realidad difieren. **Clausura 2026: 284 jornadas** en lugar de 28.

**Fecha de calendario ≠ jornada.** Una *fecha* es un día concreto en el que juegan muchas series; una *jornada* es la fecha N de **una** serie. 29 fechas, 284 jornadas en el Clausura. De ahí emerge `(fecha, predio)` —el día de operación de un predio— como entidad natural.

**Tres unidades de costo variable** (§3.3). Los gastos `por_fecha` dejan de escalar todos igual: **por partido** (árbitros, veedores, ballboys — se multiplica por `equipos ÷ 2`), **por día de cancha** (fotografía — 1 por `(fecha, predio)`) y **fijo mensual**. Un sábado con 6 series en un predio son 48 arbitrajes y un solo servicio de fotografía.

**El arqueo cuelga de `(fecha, predio)`**, no de la jornada. Controla la caja física de un predio en un día, y ese día jugaron varias series: la plata no distingue de cuál vino.

**Playoffs también por serie.** La final de Libre A y la de Libre B son jornadas distintas. No están en el calendario validado —no tienen fecha aún— y se cargan cuando se definan.

**⚠ `v_presupuesto_total` — la pieza 5 tiene que llegar antes que el primer presupuesto cargado.** La vista cuenta jornadas del torneo sin distinguir la unidad del costo. Con jornadas por género daba 28; con jornadas por serie da **284**. Un presupuesto `por_jornada` se multiplicaría por diez **sin fallar ni avisar** — no es un error de schema, es un número diez veces más grande en pantalla.

La bomba se arma en la **pieza 2**, cuando se cargue la grilla: hoy la vista da 0 porque `jornada` está vacía. La desarma la **pieza 5**, implementando las tres unidades (decisión 44). Entre una y otra, cualquier presupuesto que se cargue va a estar mal. Las tablas `presupuesto` y `presupuesto_linea` están vacías hoy, así que todavía no hay ningún número incorrecto — pero es una ventana que hay que cerrar antes de abrirla.

**La PK de `jornada` no cambia.** Sigue siendo `id`, así que las siete FKs que la apuntan —`asiento`, `pago`, `gasto`, `arqueo`, `cuota`, `plan_tarifa_linea.hito_jornada_id` y el `reprograma_a` propio— no se tocan. Cambia la identidad natural y la columna.

**Nada de esto está construido.** Es diseño asentado. Las seis piezas —migración de `jornada`, `generar_grilla_liga`, la rama `por_partido` de B0, arqueo, unidades de costo y playoffs— se construyen contra esta sección. La base sigue con `jornada` por género y vacía, así que no hay backfill.

---

## Qué cambió desde el Draft 12

**Capa nueva en el modelo: `categoria` → `serie`.** Catálogos por torneo, clonados del anterior al crear uno nuevo. La jerarquía pasa a ser `torneo → categoria → serie → equipo_torneo`. **El género es atributo de la categoría**, no del equipo ni del tercero: Libre/+30/+40 son masculinas, Femenino/Flex femeninas.

**`equipo_torneo.categoria` deja de ser texto libre.** El `'+40 A'` de string suelto se reemplaza por `serie_id`, FK al nivel más específico; categoría y género se derivan subiendo. Sale también `modalidad` —su `CHECK` quedó de un modelo anterior al tarifario y no alcanza para expresar las dos elecciones que exige el plan—, reemplazada por una FK a `plan_tarifa` por concepto.

**Traducción de tarifario a cuotas, definida.** El motor de generación mira la **regla** de cada línea, no el concepto: `fecha_fija` → 1 cuota con fecha propia, `por_partido` de liga → una cuota por fecha atada a la jornada, `bloque_adelantado` → 1 cuota con el total, playoffs → ninguna. El concepto solo se usa después, para rutear el asiento del cobro.

**La cobranza queda atada al calendario.** Las cuotas `por_partido` vencen con su jornada y se mueven si se reprograma. Mover una jornada recalcula el cashflow proyectado y los vencimientos de equipo desde la misma fuente — principio (i) alcanzando a la cobranza.

**El monto se copia, no se lee.** El tarifario es el molde; la cuota, la pieza ya fundida. Editar el tarifario no recalcula cuotas ya generadas, y una cuota puntual se puede ajustar a mano sin marca especial.

Todo esto está en §3.4. **Es diseño asentado, pendiente de implementar**: no hay migración ni código. El orden de construcción es estructura → ficha (B0) → cobro, y cada bloque necesita al anterior.

---

## Qué cambió desde el Draft 11

**Ingresos por percibido puro.** El único evento que genera ingreso contable es el pago: `Caja` al debe, `Ingresos` al haber. Las cuotas **no generan ningún asiento** — quedan como términos de pago: cronograma, mora y base del cashflow. `DEUDORES` sale del circuito de equipos. La cuota hereda el concepto (inscripción / partidos) de la línea del plan, que es lo que resuelve a qué cuenta de ingreso se imputa el cobro.

**⚠ El cambio es asimétrico.** Pasan a percibido **los ingresos**. Los **gastos siguen por devengo**, con sus dos asientos —devengo al cargar, pago al pagar— sin ninguna modificación (§3.3, regla 7 de CLAUDE.md, decisión 12). Un reemplazo ciego de la palabra "devengo" rompería el modelo de gastos. Consecuencia: para ingresos el P&L y la caja muestran lo mismo; para gastos siguen contando cosas distintas.

**Se cierra la pregunta abierta del Draft 11.** Qué disparaba el asiento de devengo dejó de tener sentido: el disparador es el pago. El bloque de §3.4 se eliminó.

Toca el principio (b), el (h), §3.3, §3.4, §3.10, §3.17, §3.18, §5 y la decisión cerrada 1. El razonamiento —y qué decía cada versión anterior— queda en §8 → Decisiones reemplazadas, que ahora registra las dos vueltas.

Nada de esto está implementado todavía: es cambio de documentación. El código y las vistas siguen sin implementar ningún reconocimiento de ingresos — `crear_asiento()` no se invoca desde ninguna función de negocio, así que hoy no hay ni percibido ni devengado.

---

## Qué cambió desde el Draft 10

> **⚠ Superado por el Draft 12.** El devengo progresivo que se describe acá duró un solo draft: los ingresos pasaron a percibido puro. Se conserva como registro de lo que se decidió entonces. El razonamiento del cambio está en §8.

**Devengo progresivo por vencimiento (Camino 2).** Reemplaza a la Opción A, que facturaba el torneo completo al armar la ficha. Ahora las cuotas se siguen creando todas juntas —el plan de pago queda cerrado desde el inicio— pero cada una se devenga al vencer. **La deuda de un equipo es su mora**: cuotas vencidas e impagas. El cashflow se deriva de la estructura de vencimientos, no de sumar fichas. Toca el principio (b), §3.4, §3.18, §5 y la decisión cerrada 1. El razonamiento del cambio, y qué decía la decisión anterior, quedan registrados en §8 → Decisiones reemplazadas.

**Abierto: qué dispara el asiento de devengo** (§3.4). El principio dice que cada cuota se devenga al vencer, pero no qué genera ese asiento. Tres opciones —proceso agendado, devengo perezoso, devengo por jornada— con un trade-off que toca el principio (c). **Hay que definirlo antes de implementar B0.**

Nada de esto está implementado todavía: es cambio de documentación. El código y las vistas siguen calculando como en el Draft 10.

---

## Qué cambió desde el Draft 7

Las migraciones 002 y 003 modificaron el modelo. Este documento refleja el estado real.

**Integridad de períodos** (002). La fecha del asiento se valida contra su período; un período cerrado no se puede reabrir; `cerrado_por` y `cerrado_at` se completan solos.

**Pagos parciales** (002). Tabla `pago_imputacion`: un pago se reparte entre varias cuotas, una cuota recibe varios pagos. `cuota.pagado_at` pasa a ser derivado.

**Caja por predio** (002). Efectivo tiene una caja por predio; transferencia y USD son globales. El arqueo es por jornada + predio.

**Deuda por equipo** (003). La deuda se consolida por tercero, no por torneo. `v_deuda_equipo` y `v_deuda_detalle`.

**Imputación elegida** (003). `sugerir_imputacion()` propone —priorizando el torneo en curso— e `imputar_pago()` guarda lo que eligió el operador. `imputar_pago_automatico()` queda deprecada: decidía sola en casos ambiguos y podía dejar a un equipo impago en el torneo en curso.

**Anticipos** (003). El sobrante de un pago queda como saldo a favor del equipo. No expira ni se pierde al cambiar de torneo.

---

## Qué cambió desde el Draft 6

**Reenfoque financiero.** Decisión del dueño: el foco es financiero, no contable. El libro diario baja a `Configuración → Registro de movimientos`; el P&L pasa a llamarse Resultados y se reordena por pregunta de negocio. Salen del alcance el IVA discriminado, el plan de cuentas como pantalla y el balance patrimonial.

**Prioridades confirmadas del dueño**, en este orden:
1. Previsión de caja a 6-12 meses con escenarios
2. Cobranza: cuánto falta cobrar y cuándo entra
3. Rentabilidad real por torneo
4. Punto de equilibrio

Las dos primeras son la misma pregunta —cuándo entra la plata— y la cobranza alimenta la previsión, así que reforzar una mejora la otra.

**Rediseño de la estructura de gastos.** `cat_gasto.grupo` se reemplaza por dos ejes independientes: `naturaleza` (por_fecha / recurrente / eventual / inversion) y `area` (torneo / predio / bar / administracion). Resuelve el hueco del gasto eventual —mantenimiento, compras de predio— que el modelo anterior no podía representar.

**Activos y amortización.** Compras grandes se activan y amortizan mensualmente, con umbral de materialidad para no ahogar la carga.

**Compromisos, cheques y fondo de inversión.** Tres tipos de obligación que faltaban: cuotas de moratoria, cheques emitidos, facturas con vencimiento. Más el calendario de pagos que los integra.

---

## 1. Principios de diseño

**a. La Fecha es la unidad operativa central, no el mes.** Cada jornada (`Fecha 9 · Libre A · 14-jun`) es la unidad contra la que se cargan ingresos de equipos y egresos operativos. El mes es una vista derivada, no la unidad de trabajo.

**b. El ingreso se reconoce al cobrar (percibido puro).** El único evento que genera ingreso contable es el pago: `Caja` —efectivo, transferencia o valores a depositar— al debe, la cuenta de `Ingresos` que corresponda al haber. Las `cuota` **no generan ningún asiento**: son términos de pago —cronograma, base de la mora y del cashflow (§3.10)—, no hechos contables. No interviene `Deudores`: lo que un equipo debe no vive en el libro diario, vive en `cuota`. La cuota hereda de la línea del plan el concepto (inscripción / partidos), y de ahí se resuelve a qué cuenta de ingreso se imputa el cobro. **La deuda de un equipo es su mora**: cuotas vencidas e impagas — cifra operativa, para reclamar, no un saldo contable. **Asimetría deliberada:** esto vale para ingresos; los **gastos siguen por devengo**, con dos asientos (§3.3). Por eso, para ingresos el P&L y la caja muestran lo mismo, y para gastos siguen contando cosas distintas. *Reemplaza al devengo progresivo del Draft 11, que a su vez había reemplazado a la Opción A — las dos vueltas y su razonamiento están en §8.*

**c. Una sola fuente de verdad — dos dominios, una fuente en cada uno.** Ninguna pantalla calcula su propio número: toda cifra visible sale de una vista, nunca del front. De dónde sale esa vista depende de qué clase de número es.

**Lo contable —resultado, P&L, caja, saldos de cuenta— deriva de `asiento_linea`, sin excepción.** Es la regla más importante de la arquitectura: es lo que hace que el sistema no reproduzca el problema del Excel, donde cada planilla llegaba a un total distinto. Ningún número contable se calcula por fuera del diario, ni siquiera "solo para mostrar".

**Lo operativo —mora, cronograma de pagos, cartera por vencer, tasa de cobranza, cashflow proyectado— deriva de `cuota`.** Es planificación, no contabilidad: describe qué se acordó cobrar y cuándo, que es un hecho comercial. Con ingresos por percibido (principio b) la cuota no genera asiento, así que buscar esos números en el diario no sería más riguroso — sería buscarlos donde no están.

Esto no es una excepción al principio ni un permiso para calcular por fuera. **Cada dominio tiene una fuente y solo una, y no se cruzan:** un número contable jamás se deriva de `cuota`, y uno operativo jamás se reconstruye desde el diario. Lo que estaría mal —y es exactamente el problema del Excel— es que un mismo número tuviera dos orígenes posibles.

**d. El negocio es unificado; los predios son logística.** No hay rentabilidad por predio ni por categoría. Repartir costos compartidos exigiría un criterio arbitrario. Los predios se usan para arqueo de caja y organización operativa, no como centros de resultado.

**e. Terminología: Efectivo y Transferencia.** Nunca "declarable/no declarable", "blanco/negro" ni equivalentes, ni en UI ni en comunicación ni en nombres de tablas.

**f. La empresa es la entidad contable; los torneos son centros de resultado.** Todo asiento pertenece a un ejercicio; algunos además pertenecen a un torneo. Lo que no pertenece a ninguno es **estructura permanente** y se resta una sola vez del resultado de la empresa. Prorratearla entre torneos volvería a introducir números que nadie puede defender.

**g. El catálogo de gastos es infraestructura, no configuración cosmética.** Categoría obligatoria, concepto opcional (del catálogo o texto libre). Presupuesto y gasto real comparten categoría, y por eso el desvío se calcula solo. La categoría tiene **dos ejes**: naturaleza (cómo se carga y presupuesta) y área (a quién se imputa).

**h. La previsión distingue hechos de supuestos.** Comprometido (cuota impaga con vencimiento) y recurrente (gasto fijo mensual) son hechos. Estimado (proyección de presupuesto y calendario) es supuesto. Se muestran diferenciados. Que la cuota no genere asiento (principio b) no la vuelve un supuesto: el compromiso existe aunque no esté en el diario.

**i. El calendario es el motor de la previsión.** Suspender o mover una jornada recalcula el bloque estimado de esa fecha, sin tocar lo comprometido ni lo recurrente.

**j. Los compromisos de pago son más ciertos que los de cobro.** Un cheque emitido se debita sí o sí en su fecha; una cuota de equipo puede pagarse tarde. La proyección no aplica la misma tasa de cumplimiento a los dos lados.

**k. La contabilidad de Campa es de gestión, no fiscal.** Si el estudio amortiza un bien en 10 años por tabla fiscal pero en la cancha dura 5, en Campa se usan 5. Los dos sistemas son paralelos y no necesitan cuadrar entre sí.

---

## 2. Roles

| Rol | Alcance |
|---|---|
| `admin` | Todo. Guille y Agus (socios/dueños). |
| `operador` | Carga diaria: pagos, gastos de fecha, arqueos. Sin configuración ni societario. Mati. |
| `administracion` | Solo lectura sobre toda la operación y las finanzas. Puede exportar y cerrar períodos. Yas. |
| `encargado_bar` | Solo el módulo Bar, y solo su predio. Augusto. |

Nota: el rol antes llamado `contador` se renombra a `administracion`. La distinción importa: es un perfil de control, de solo lectura sobre la operación, sin capacidad de modificar asientos.

---

## 3. Modelo de datos

### 3.1 Núcleo contable

> **Nota de ejecución.** Los bloques SQL están ordenados por concepto, no por dependencia. Al crear el esquema, el orden correcto es: `ejercicio` → `predio` → `torneo` → `jornada` → `periodo` → `cuenta` → `tercero` → `asiento` → `asiento_linea` → resto. Alternativamente, crear las tablas sin FK y agregarlas después con `alter table ... add constraint`.


Es el cimiento. Todo lo demás escribe acá y lee de acá.

```sql
create table ejercicio (
  id            uuid primary key default gen_random_uuid(),
  anio          int not null unique,
  fecha_desde   date not null,
  fecha_hasta   date not null,
  estado        text not null default 'abierto'   -- abierto | cerrado
);

create table torneo (
  id            uuid primary key default gen_random_uuid(),
  ejercicio_id  uuid references ejercicio(id),    -- nullable — un ejercicio contiene varios torneos (Apertura+Clausura); un torneo puede sembrarse sin ejercicio asignado
  nombre        text not null,                    -- 'Apertura 2026'
  temporada     temporada not null,               -- apertura | clausura
  anio          smallint not null,                -- 2026
  activo        boolean not null default true,    -- el torneo en curso
  fecha_desde   date,
  fecha_hasta   date,
  cant_fechas   int  not null default 10,
  estado        text not null default 'planificado', -- planificado | en_curso | cerrado
  unique (temporada, anio)                        -- un solo Apertura por año
);

create table periodo (
  id            uuid primary key default gen_random_uuid(),
  ejercicio_id  uuid not null references ejercicio(id),
  anio          int not null,
  mes           int not null check (mes between 1 and 12),
  estado        text not null default 'abierto',  -- abierto | cerrado
  cerrado_por   uuid references auth.users(id),
  cerrado_at    timestamptz,
  unique (ejercicio_id, anio, mes)
);

create table cuenta (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,             -- '1.1.01', '5.1.01'
  nombre        text not null,
  tipo          text not null,                    -- activo|pasivo|patrimonio|ingreso|egreso|financiero
  imputable     boolean not null default true,
  padre_id      uuid references cuenta(id)
);

create table asiento (
  id            uuid primary key default gen_random_uuid(),
  periodo_id    uuid not null references periodo(id),
  torneo_id     uuid references torneo(id),       -- NULL = estructura permanente
  fecha         date not null,
  jornada_id    uuid references jornada(id),      -- opcional: ancla a una fecha del calendario
  predio_id     uuid references predio(id),
  origen        text not null,                    -- pago_equipo|gasto_fecha|gasto_fijo|bar|arqueo|sponsor|socio|usd|ajuste
  origen_id     uuid,                             -- id del registro que lo generó
  descripcion   text not null,
  anulado_por   uuid references asiento(id),
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

create table asiento_linea (
  id            uuid primary key default gen_random_uuid(),
  asiento_id    uuid not null references asiento(id) on delete cascade,
  cuenta_id     uuid not null references cuenta(id),
  debe          numeric(16,2) not null default 0,
  haber         numeric(16,2) not null default 0,
  tercero_id    uuid references tercero(id),      -- equipo, sponsor o socio
  check (debe >= 0 and haber >= 0),
  check ((debe > 0 and haber = 0) or (haber > 0 and debe = 0))
);
```

**Ejercicio — nota de diseño.** El ejercicio se mantiene como columna vertebral contable (`periodo`, resultado y presupuesto dependen de él). Por decisión operativa actual no se cargan ejercicios con fechas fiscales manualmente; los cierres se hacen mensuales sobre año calendario derivados de la fecha del asiento. La creación formal de ejercicios con fechas se activa cuando el estudio contable externo lo requiera. Por eso `torneo.ejercicio_id` es nullable: un torneo puede vivir sin ejercicio asignado hasta entonces.

**Invariantes que deben forzarse en base, no en la app:**

```sql
-- Debe = Haber por asiento
create or replace function check_asiento_balanceado() returns trigger as $$
declare d numeric; h numeric;
begin
  select coalesce(sum(debe),0), coalesce(sum(haber),0) into d,h
  from asiento_linea where asiento_id = coalesce(new.asiento_id, old.asiento_id);
  if d <> h then
    raise exception 'Asiento % no balancea: debe=% haber=%', coalesce(new.asiento_id,old.asiento_id), d, h;
  end if;
  return null;
end $$ language plpgsql;

create constraint trigger trg_asiento_balanceado
  after insert or update or delete on asiento_linea
  deferrable initially deferred
  for each row execute function check_asiento_balanceado();

-- No se escribe sobre período cerrado
create or replace function check_periodo_abierto() returns trigger as $$
begin
  if (select estado from periodo where id = new.periodo_id) = 'cerrado' then
    raise exception 'El período está cerrado';
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_periodo_abierto before insert or update on asiento
  for each row execute function check_periodo_abierto();
```

El asiento **nunca se borra ni se edita**: se anula con un contraasiento que apunta al original vía `anulado_por`. Es lo que hace auditable el sistema.

### 3.2 Ámbito: empresa vs. torneo

La distinción vive en una sola columna: `asiento.torneo_id`.

| `torneo_id` | Significado | Ejemplo |
|---|---|---|
| con valor | Imputable a ese torneo | Árbitros de la Fecha 9 |
| `NULL` | Estructura permanente | Alquiler de enero, sueldo administrativo |

Las tres vistas del negocio salen de agrupar por esa columna:

```sql
-- Contribución por torneo y estructura permanente
create view v_resultado_producto as
select
  e.anio,
  coalesce(t.nombre, 'Estructura permanente') as producto,
  sum(case when c.tipo = 'ingreso' then l.haber - l.debe else 0 end) as ingresos,
  sum(case when c.tipo = 'egreso'  then l.debe  - l.haber else 0 end) as egresos,
  sum(case when c.tipo = 'ingreso' then l.haber - l.debe else 0 end)
  - sum(case when c.tipo = 'egreso' then l.debe - l.haber else 0 end) as contribucion
from asiento a
join periodo p       on p.id = a.periodo_id
join ejercicio e     on e.id = p.ejercicio_id
join asiento_linea l on l.asiento_id = a.id
join cuenta c        on c.id = l.cuenta_id
left join torneo t   on t.id = a.torneo_id
where a.anulado_por is null and c.tipo in ('ingreso','egreso')
group by e.anio, coalesce(t.nombre, 'Estructura permanente');
```

**Regla:** la estructura permanente no se prorratea. Ni por cantidad de equipos, ni por meses, ni mitad y mitad. Se resta una sola vez del resultado de la empresa.

### 3.3 Catálogo de gastos — dos ejes

Sale de `gastos_campa.xlsx`: 34 categorías y 111 conceptos, remapeados a dos dimensiones independientes.

**Eje 1 · Naturaleza** — determina cómo se carga, se presupuesta y se proyecta al flujo:

| Naturaleza | Se ancla a | Presupuesto | Ejemplos |
|---|---|---|---|
| `por_fecha` | jornada + predio | según su unidad — ver abajo | Árbitros, veedores, ballboys, fotografía |
| `recurrente` | mes | monto mensual × meses | Alquileres, sueldos, EPEC |
| `eventual` | fecha calendario | monto anual por categoría | Mantenimiento, compras de predio |
| `inversion` | fecha + activo | monto + vida útil | Desmalezadora, arcos, heladera |

#### Las tres unidades del costo variable

No todos los gastos `por_fecha` escalan igual. Meterlos a todos en "× jornadas" era correcto mientras la jornada era la fecha N de un **género**; con jornadas por **serie** deja de serlo, y la distinción se vuelve obligatoria:

| Unidad | Escala con | De dónde sale el multiplicador | Ejemplos |
|---|---|---|---|
| **`por_partido`** | cada partido tiene los suyos | Σ sobre las jornadas no suspendidas de `equipos de la serie ÷ 2` | árbitros, veedores, ballboys |
| **`por_dia_cancha`** | el día de operación de un predio | `count(*) from dia_cancha` del torneo (§3.5) | fotografía, guardias, limpieza, estacionamiento |
| **`por_mes`** | el mes | meses del ejercicio | alquileres, sueldos |

`anual` y `unico` siguen como estaban: no escalan.

La diferencia entre las dos primeras es grande, no cosmética. Un sábado con 6 series jugando en un predio son **48 partidos** —48 arbitrajes— pero **un solo** servicio de fotografía.

**`por_jornada` sale del dominio.** No se conserva por compatibilidad. Era la unidad correcta bajo el modelo viejo y ahora es ambigua: "por jornada" no dice si se refiere al partido o al día. Dejarla disponible garantiza que alguien la elija y multiplique por 284.

**La unidad se hereda del catálogo; la línea puede sobrescribirla.**

| Dónde | Rol |
|---|---|
| `cat_gasto` / `concepto_gasto` | **default** — la unidad natural del concepto |
| `presupuesto_linea.unidad` | **override** — `null` = heredar; con valor = este caso es distinto |

Un arbitraje es por partido siempre; no es una decisión que deba tomarse de nuevo en cada línea de presupuesto. Sin default, cada línea vuelve a decidir algo ya decidido, y **basta una mal cargada para que el total se corra** sin que nada falle. El override existe porque el caso raro existe —un servicio que este torneo se contrata por día y el que viene por partido— y forzarlo a crear un concepto nuevo ensuciaría el catálogo.

**Clasificación inicial · las 16 categorías `por_fecha`**

Es punto de partida cargado como datos, no verdad de schema: se corrige con un `update`, sin migración.

| Unidad | # | Categorías |
|---|---|---|
| **`por_partido`** | 3 | Árbitros Femenino · Árbitros Masculino · Operativos *(todas de área `torneo`)* |
| **`por_dia_cancha`** | 8 | Coordinación · Media · Medicinal · Tribunal · Viáticos *(área `torneo`)* · Estacionamiento · Guardias · Limpieza *(área `predio`)* |
| **aparte** | 5 | Extras · Limpieza · Productos · Proveedores *(área `bar`)* · Administración *(área `administracion`)* |

Total 16 ✓ — `3 + 8 + 5`.

**Viáticos hereda del concepto que refleja.** La categoría espeja a otras —Ballboys, Veedores, Guardias, Estacionamiento, Limpieza— así que su unidad no es uniforme a nivel categoría: el viático de un ballboy escala como el ballboy. Se clasifica por **concepto**, no por categoría, y por eso la unidad vive también en `concepto_gasto` y no solo en `cat_gasto`.

**Dos categorías se llaman "Limpieza"** y son filas distintas: una de área `predio` y otra de área `bar`. Conviven bajo `unique (area, nombre)` y se clasifican distinto. Al cargar la clasificación hay que discriminar por área o se pisa una con la otra.

**El bar no escala con el torneo.** No con partidos y no con días de cancha: escala con **consumo**. Coca, hielo, descartables — un sábado de mucha venta cuesta más que uno de poca, y la cantidad de partidos no lo predice. Meterlo en cualquiera de las dos unidades de torneo daría un número con forma de presupuesto y sin relación con la realidad. Queda fuera de las unidades variables hasta que se defina su tratamiento propio. Lo mismo Administración, que es estructura permanente (§3.2) y no se prorratea entre torneos.

**Eje 2 · Área** — determina a quién se imputa: `torneo` · `predio` · `bar` · `administracion`.

**Por qué dos ejes y no uno.** El modelo anterior usaba `grupo ∈ {fecha, recurrente, bar}`, que mezclaba temporalidad con área. El sueldo del encargado de bar es recurrente y de área bar; el hielo de la jornada es por fecha y de área bar; una heladera es inversión y de área bar. Los tres caían en `grupo='bar'` y no se podían presupuestar con la lógica correcta.

Ver `campa_schema.sql` §3 para el DDL y `seed.sql` para el contenido completo.

**Normalizaciones aplicadas al importar:**

| En el Excel | En el catálogo | Motivo |
|---|---|---|
| `Augusto` | `Encargado de bar` | Era una persona donde iba una categoría |
| `Risata` | `Proveedores` | Ídem |
| `Sistema` | `Sistema y equipamiento` | Ambiguo |

**Categorías agregadas** (no existían en el Excel): `Mantenimiento eventual`, `Compras e insumos de predio`, `Equipamiento`.

**Carga de gasto:** categoría obligatoria; concepto opcional —del catálogo o texto libre—. Los cargados libres se marcan en la UI para poder promoverlos al catálogo si se repiten.

**Un gasto son dos asientos:**

| Momento | Debe | Haber |
|---|---|---|
| Cargar (devengo) | `Gasto` | `Proveedores a pagar` |
| Pagar | `Proveedores a pagar` | `Caja` |

Separarlos permite que el P&L y la caja cuenten cosas distintas sin contradecirse. **Esto vale para gastos y sigue vigente**: es la mitad devengada del modelo. Los ingresos van por el camino opuesto —se reconocen recién al cobrar (principio b)—, así que la distinción devengado/pagado aplica a esta tabla y no a los ingresos.

**Coherencia forzada en base.** El trigger `check_gasto_coherente` valida que la naturaleza y el anclaje sean consistentes: un gasto `por_fecha` exige jornada, uno `recurrente` no puede tener torneo, uno `inversion` exige activo.

### 3.4 Terceros y cuentas corrientes

Equipos, sponsors y socios comparten la misma mecánica: débitos, créditos, saldo. Se modelan como un solo tipo con discriminante.

#### Estructura del torneo · categoría y serie

*Diseño asentado, pendiente de implementar.*

Capa de catálogos **por torneo**, igual que el tarifario: cada torneo tiene la suya y se clona del anterior al crearlo.

```
torneo → categoria → serie → equipo_torneo (la ficha)
```

**`categoria`** es la división que corre el equipo: Libre, +30, +40, Femenino, Flex.

**El género es atributo de la categoría** — no del equipo ni del tercero. Libre, +30 y +40 son masculinas; Femenino y Flex, femeninas. Un club que presenta equipo en Libre y otro en Femenino tiene dos fichas, cada una en su categoría, y el género de cada una sale de ahí. Ponerlo en `tercero` sería incorrecto: el mismo club juega en ambos.

**`serie`** es el nivel dentro de la categoría: A, B, C. **Cuelga de la categoría, no del torneo**: la "Serie A de Libre" y la "Serie A de +30" son filas distintas y no comparables. Las series crecen con el tiempo —una categoría que arranca con A y B puede sumar C—, por eso son datos y no un enum.

```sql
create table categoria (
  id        uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references torneo(id) on delete cascade,
  nombre    text not null,              -- 'Libre', '+30', '+40', 'Femenino', 'Flex'
  genero    genero not null,            -- lo heredan las fichas, subiendo desde la serie
  orden     smallint,
  unique (torneo_id, nombre)
);

create table serie (
  id           uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references categoria(id) on delete cascade,
  nombre       text not null,           -- 'A', 'B', 'C'
  orden        smallint,
  unique (categoria_id, nombre)
);
```

**Un equipo está en exactamente una categoría y una serie.** La ficha apunta a la **serie**, que es el nivel más específico; categoría y género se derivan subiendo por las FKs. No se duplican en `equipo_torneo`: si estuvieran, podrían contradecir a la serie.

**Se clonan al crear el torneo**, junto con el padrón y el tarifario (§5). El torneo nuevo arranca con la estructura del anterior y se ajusta: se agregan series, se mueven equipos.

**Ascensos y descensos no se modelan como evento.** Un equipo que sube de B a A en el torneo siguiente simplemente tiene otra ficha, en otro torneo, apuntando a otra serie. El historial queda por acumulación: se reconstruye el recorrido de un equipo leyendo sus `equipo_torneo` ordenados por torneo. No hace falta tabla de movimientos ni registro de ascensos.

> **Ojo con la palabra "categoría".** En este documento nombra dos cosas sin relación: la **categoría del torneo** (esta sección, la división que corre el equipo) y la **categoría de gasto** (`cat_gasto`, §3.3, el eje naturaleza/área). El prefijo de tabla las distingue; en prosa hay que leer el contexto.

#### Terceros, fichas y cuotas

```sql
create table tercero (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,          -- equipo | sponsor | socio
  nombre      text not null,
  email       text,                   -- para reclamos y recibos
  contacto    text,
  activo      boolean not null default true
);

create table equipo_torneo (              -- la "ficha" del equipo en un torneo
  id             uuid primary key default gen_random_uuid(),
  tercero_id     uuid not null references tercero(id),
  torneo_id      uuid not null references torneo(id),
  serie_id       uuid not null references serie(id),  -- categoría y género se derivan subiendo
  plan_inscripcion_id uuid not null references plan_tarifa(id),  -- opción elegida, concepto='inscripcion'
  plan_partidos_id    uuid not null references plan_tarifa(id),  -- opción elegida, concepto='partidos'
  medio_previsto medio_pago not null,           -- congela precio_efectivo o precio_transferencia
  responsable_id uuid references auth.users(id),
  total_facturado numeric(16,2) not null default 0,  -- suma de las cuotas (trigger); NO es la deuda
  unique (tercero_id, torneo_id)
);

create table cuota (
  id                uuid primary key default gen_random_uuid(),
  equipo_torneo_id  uuid not null references equipo_torneo(id) on delete cascade,
  numero            int not null,
  vence_at          date not null,
  monto             numeric(16,2) not null,
  pagado_at         date,
  unique (equipo_torneo_id, numero)
);
```

**`total_facturado` no es la deuda.** Es la suma de las cuotas, mantenida por trigger (`sync_total_facturado`, decisión 27). Mide el tamaño del plan de pago, no lo que el equipo debe hoy, y **tampoco es un importe facturado** —bajo percibido puro no se factura nada al armar la ficha—: el nombre quedó heredado. **La deuda es la mora**: cuotas con `vence_at < current_date` y sin cancelar. Es el número que se reclama.

**`equipo_torneo.asiento_id` quedó sin uso.** Nació para apuntar al asiento del devengo total. Sin devengo de ingresos no hay ningún asiento que colgar de la ficha: el asiento del cobro pertenece a `pago`, que ya tiene su propia columna `asiento_id`. Nada la escribe hoy, así que no hay dato que migrar.

**La cuota lleva el concepto.** Como el cobro se imputa a una cuenta de ingreso concreta (`ING_INSCRIPCIONES` o `ING_PARTIDOS`), la cuota tiene que saber de qué concepto viene. Lo hereda de la línea del plan de tarifa que la originó (§3.18).

**Estado de cobranza — calculado, no almacenado:**

```sql
create view v_estado_cuota as
select c.*,
  case
    when c.pagado_at is not null            then 'al_dia'
    when c.vence_at < current_date          then 'cuota_vencida'
    when c.vence_at <= current_date + 7     then 'proxima_a_vencer'
    else 'al_dia'
  end as estado
from cuota c;
```

No se usan tramos de antigüedad 30/60/90: el vencimiento lo define la modalidad de pago del equipo, así que la antigüedad genérica no significa nada acá.

#### De línea del tarifario a cuota · B0

*Diseño asentado, pendiente de implementar.*

Armar la ficha genera todas sus cuotas, traduciendo las líneas de las dos opciones elegidas (`plan_inscripcion_id` y `plan_partidos_id`).

**El motor de generación mira la `regla` de la línea, no el concepto.** Es el principio que ordena toda la traducción:

| `regla` de la línea | `es_playoff` | Genera | Vencimiento |
|---|---|---|---|
| `fecha_fija` | — | **1 cuota por línea** | Fecha propia de la línea (`hito_jornada_id` / `fecha_referencia`), **independiente del calendario de juego** |
| `por_partido` | `false` | **1 cuota por fecha** del rango `fecha_desde`..`fecha_hasta` — 10 fechas, 10 cuotas del arancel unitario | **Atado a la jornada**: cada cuota vence con su fecha del calendario y **se mueve si la jornada se reprograma** |
| `bloque_adelantado` | — | **1 cuota** con el total del bloque (el importe cargado ya es el total, no unitario) | Fecha del bloque |
| `por_partido` | `true` | **ninguna** | — |

**Una línea `fecha_fija` de partidos se comporta igual que una de inscripción.** Las tres cuotas de "Partidos · Opción 2 · Cuotas" son `fecha_fija`: vencen en su fecha propia y **no** se atan a ninguna jornada, aunque sean de partidos. El vencimiento atado a jornada aplica **solo** a las líneas `por_partido`.

**El concepto no participa de la generación.** `inscripcion` / `partidos` se usa después, y para otra cosa: rutear el asiento del cobro a su cuenta de ingreso (decisión 31). Son dos responsabilidades separadas, y confundirlas lleva a atar al calendario cuotas que tienen fecha propia.

**Playoffs no generan cuota al armar la ficha.** Si el equipo clasifica no se sabe, y `cantidad_esperada = 3` es un máximo teórico —cuartos, semi, final—, no un hecho. Se cobran aparte cuando el equipo clasifica.

**Los dos orígenes de vencimiento**, que es lo que conecta cobranza con el calendario:

| Origen | Qué lo fija | Se mueve si… |
|---|---|---|
| **Fecha propia** (`fecha_fija`, `bloque_adelantado`) | la línea del tarifario | nunca: es compromiso de calendario, independiente del juego |
| **Jornada** (`por_partido` de liga) | `jornada.fecha` | se reprograma la jornada |

Mover una jornada recalcula el cashflow proyectado **y** los vencimientos de las cuotas de equipo, desde la misma fuente. Es el principio (i) —el calendario es el motor de la previsión— alcanzando también a la cobranza.

*Consecuencia de modelo:* una cuota `por_partido` tiene que saber de qué jornada depende, así que `cuota` gana una FK a `jornada`, nullable —las de fecha propia no la usan—. Cómo se mantiene `vence_at` sincronizado al reprogramarse la jornada se resuelve al implementar; hay precedente de triggers de sincronización (`sync_total_facturado`, `sync_cuota_pagada`).

**El monto se copia, y desde ahí la cuota es autónoma.** Cada línea tiene `precio_efectivo` y `precio_transferencia`; la cuota tiene un solo `monto`. Al generarla se copia el que corresponde al `medio_previsto` de la ficha, y ahí termina el vínculo de importe: `cuota.monto` es un valor propio, no una lectura del tarifario.

**El tarifario es el molde; la cuota, la pieza ya fundida.** Tres consecuencias, todas deliberadas:

- **Editar el tarifario no recalcula cuotas ya generadas.** Corregir un precio afecta solo a las fichas que se armen después. Las cuotas vivas no se mueven — un equipo no se entera de que le cambiaron el precio a mitad de torneo.
- **Que el equipo pague por otro medio no reabre el importe.** El precio se fijó al armar la ficha; el medio de pago real, al cobrar, es otra cosa.
- **Una cuota puntual se puede ajustar a mano.** Es caso raro y no lleva marca especial: con editar `monto` alcanza. No hace falta ni un flag de "ajustada" ni una tabla de excepciones — el monto de la cuota ya es la fuente de verdad de lo que ese equipo debe pagar.

Esto es lo que permite que `total_facturado` —suma de las cuotas por trigger— siga siendo correcto después de un ajuste manual: se recalcula solo, sin consultar el tarifario.

**La autonomía es parcial, y depende del tipo de cuota** *(refina lo anterior, no lo contradice)*. El **monto** se copia siempre. El **vencimiento** no:

| Tipo de cuota | Monto | Vencimiento | Autonomía |
|---|---|---|---|
| **Fija** — inscripción, bloque adelantado | copiado | copiado, `vence_at` propio | **total** |
| **De liga** — `por_partido` | copiado | **derivado de `jornada.fecha`** | **parcial** |

Las dos tienen naturaleza distinta. La inscripción vence **un día administrativo fijo**: se acordó esa fecha y no depende de que se juegue nada. La de liga vence **cuando se juega esa fecha** — y esa fecha puede moverse o suspenderse.

Por eso la cuota de liga guarda `jornada_id` y lee el vencimiento de ahí, en vivo. Mover la jornada mueve su vencimiento sin tocar la cuota; suspenderla la saca del circuito de cobro (§3.5). Es la decisión 39 funcionando de verdad, no solo declarada.

**Nota de nomenclatura — tres cosas parecidas que no se mezclan.**

| Tabla | Qué es | Sentido | Contraparte |
|---|---|---|---|
| `cuota` | Cronograma de pago de un equipo en un torneo | **cobrar** | el equipo |
| `compromiso` + `plan_pago` | Moratoria de Campa con un organismo | **pagar** | municipalidad, rentas |
| `plan_tarifa` | Catálogo de precios del torneo (§3.18) | — | ninguna: es plantilla |

Se parecen de nombre y no tienen relación. `generar_cuotas_plan()` genera **compromisos**, no cuotas, pese a cómo se llama; y `compromiso.tipo` admite el valor `'cuota_plan'`, que tampoco es una `cuota`.

**El modelo ya lo impide por estructura, no por convención.** `cuota.equipo_torneo_id` es `NOT NULL` con FK a `equipo_torneo`: toda fila de `cuota` cuelga de la ficha de un equipo en un torneo. Una moratoria no tiene ficha —`plan_pago` ni siquiera tiene `tercero_id`, tiene `organismo`—, así que no puede entrar. Y las vistas de cobranza llegan a `cuota` únicamente a través de `equipo_torneo`, con lo cual tampoco podrían contarla si estuviera.

No hay nada que refactorizar. Esta nota existe para que el parecido de los nombres no haga dudar de una separación que ya es correcta.

**El asiento lo dispara el pago, y nada más.** Armar la ficha, crear las cuotas y vencer una cuota no escriben en el libro diario. Quien implemente B0 (`crear_equipo_torneo`) no emite ningún asiento: la función arma la ficha y su cronograma, y ahí termina su responsabilidad contable.

#### El circuito de cobro — decisiones tomadas, pendientes de implementar

Ninguna de las cinco está construida. Se asientan para que quien implemente no las vuelva a discutir.

**1 · `cuota.plan_tarifa_linea_id`, FK `NOT NULL`.** Toda cuota de equipo nace de una línea del tarifario y hereda de ella el concepto (`inscripcion` / `partidos`), el precio y la regla de vencimiento. Es lo que resuelve a qué cuenta de ingreso se imputa el cobro.

`NOT NULL`, no opcional: **no existen cuotas de equipo sin tarifario**. Las cuotas de moratoria —que sí carecen de él— no viven en `cuota` sino en `compromiso` (ver la nota de nomenclatura al final de la sección), así que el caso que justificaría una FK nullable no existe.

Se prefiere la FK a copiar el enum dentro de `cuota`: mantiene fuente única y da acceso también al precio y a la regla, no solo al concepto.

**2 · `registrar_cobro()` atómica.** Una sola función registra el pago, imputa y asienta, en una transacción. El asiento **no** se cablea dentro de `imputar_pago()`, que hoy recibe un pago ya insertado: eso dejaría el registro y el asiento en dos pasos separables, y si el segundo falla queda plata registrada sin movimiento en el diario. `registrar_cobro()` reutiliza `imputar_pago()` tal como está, sin modificarla.

**3 · El asiento se deriva de la imputación**, no del pago en bruto. Cada imputación aporta una línea al haber, ruteada por el concepto de su cuota:

| Concepto de la cuota | Cuenta al haber |
|---|---|
| `inscripcion` | `ING_INSCRIPCIONES` |
| `partidos` | `ING_PARTIDOS` |

El debe es una sola línea, por el total del pago, en la caja del medio:

| `medio_pago` | Cuenta al debe |
|---|---|
| `efectivo` | `CAJA_EFECTIVO` — exige `predio_id` (principio: el arqueo es por predio) |
| `transferencia` | `CAJA_TRANSFERENCIA` |
| `cheque` | `VALORES_A_DEPOSITAR` |

Un pago repartido entre cuotas de conceptos distintos produce **un asiento con varias líneas al haber**, no varios asientos.

**4 · El excedente se imputa a la cuota siguiente.** Si un equipo paga más que la cuota corriente, el excedente reduce la próxima: paga 520 sobre una cuota de 500 y la siguiente baja 20. **No es un anticipo: es imputación normal**, resuelta por `imputar_pago()` tal como ya existe. La plata siempre tiene concepto —el de la cuota a la que se aplica—, y de ahí sale su cuenta de ingreso (decisión 3).

Por eso el anticipo prácticamente no ocurre: el excedente se absorbe en el cronograma. Un sobrante sin concepto solo aparecería si un pago excediera el total de **todas** las cuotas del equipo. Para ese borde: `ING_INSCRIPCIONES`, **por convención explícita para un caso improbable, no como mecanismo principal**. Si empezara a aparecer seguido, la regla está mal y hay que revisarla, no ampliarla. En ese caso raro el ingreso se reconoce al entrar, y aplicar el anticipo después **no genera asiento** —ya se reconoció—; `anticipo` y `anticipo_uso` siguen llevando el seguimiento operativo del saldo a favor.

*Dependencia de implementación.* La regla exige que `imputar_pago()` pueda imputar a cuotas **no vencidas**: cuando el excedente baja la cuota siguiente, esa cuota normalmente todavía no venció. Hoy la función no filtra por vencimiento, pero hay que confirmarlo contra el resto del circuito y ajustar al construir `registrar_cobro()`.

**5 · Orden de construcción: estructura → ficha → cobro.**

| # | Bloque | Qué incluye |
|---|---|---|
| **a** | **Catálogos de estructura** | `categoria` y `serie` por torneo, más el clonado al crear un torneo nuevo (§5) |
| **b** | **Ficha · B0 `crear_equipo_torneo`** | FK `cuota → plan_tarifa_linea` (decisión 1), generación de cuotas según la regla de cada línea, precio congelado por `medio_previsto` |
| **c** | **Cobro · `registrar_cobro()`** | pago + imputación + asiento |

El orden no es preferencia: cada bloque necesita al anterior. Sin `serie` la ficha no tiene a qué apuntar ni de dónde derivar el género, y sin género no se encuentra el tarifario. Sin fichas ni cuotas no hay nada que cobrar. Y la FK de la decisión 1 tiene que existir **antes** de que se escriba la primera cuota: agregarla después obligaría a reconstruir a mano de qué línea del tarifario salió cada una.

### 3.5 Calendario del torneo · `jornada` (capa transaccional, motor de cashflow)

Define qué día se juega cada fecha del torneo. Es el motor del cashflow: mover o suspender una jornada recalcula ingresos y costos de esa fecha; los costos fijos mensuales no se tocan.

```sql
create table predio (
  id      uuid primary key default gen_random_uuid(),
  codigo  text not null unique,        -- TIR | AEP
  nombre  text not null,
  activo  boolean not null default true
);

create table jornada (
  id                uuid primary key default gen_random_uuid(),
  serie_id          uuid not null references serie(id),  -- género y torneo se derivan subiendo
  numero            smallint,                      -- fecha de liga (null en playoff)
  instancia         text,                          -- 'cuartos' | 'semi' | 'final' (playoff)
  es_playoff        boolean not null default false,
  fecha             date,                          -- null hasta programar
  estado            text not null default 'programada', -- programada | jugada | suspendida | reprogramada
  reprograma_a      uuid references jornada(id),   -- rastro de reprogramación
  cantidad_esperada smallint,                      -- base de estimación de ingreso
  unique (serie_id, numero),                       -- identidad: fecha × serie
  check (
    (es_playoff and instancia is not null and numero is null)
    or (not es_playoff and numero is not null and instancia is null)
  )
);
```

*Construido* — migración `20260801121708_jornada_por_serie.sql`, con las 284 jornadas del Clausura sembradas.

**La jornada cuelga de la serie, no del género.** La identidad es `(serie_id, numero)`. El género y el torneo se derivan subiendo `serie → categoria`, el mismo patrón que la ficha (decisión 36): no se duplican, porque duplicarlos permitiría que contradigan a la serie.

**Por qué cambió.** El modelo anterior tenía identidad `(torneo_id, genero, numero)`: una jornada *era* la fecha N de un género, igual para todas las series de ese género — 28 jornadas por torneo. Pero **el calendario real es por serie**: distintas series del mismo género juegan la misma fecha en días distintos. Van casi siempre sincronizadas y se desfasan en fechas puntuales. Libre A juega su fecha 3 el 15/8 y +35 B la juega el 29/8; el modelo por género no puede representarlo, colapsa fechas que en la realidad difieren.

Consecuencia práctica: la cuota de liga de un equipo (decisión 39, vencimiento atado a la jornada) se ataba a una jornada genérica de género, con fecha aproximada. Ahora se ata a **la jornada real que ese equipo juega**, con su fecha correcta.

**Clausura 2026: 284 jornadas** — 12 series masculinas × 15 fechas + 8 femeninas × 13.

**La PK no cambia.** Sigue siendo `id` (uuid), así que las siete FKs que apuntan a `jornada.id` —`asiento`, `pago`, `gasto`, `arqueo`, `cuota`, `plan_tarifa_linea.hito_jornada_id` y el `reprograma_a` de la propia tabla— **no se tocan**. Lo que cambia es la identidad *natural* y la columna: sale `genero`, entra `serie_id`.

#### Fecha de calendario vs. jornada

Distinción central del modelo nuevo, y la que ordena todo lo demás:

| | Qué es | Cuántas en el Clausura |
|---|---|---|
| **Fecha** | un día concreto (sáb 8/8/2026). Ese día juegan muchas series | **29** |
| **Jornada** | la fecha N de **una** serie | **284** |

Una fecha agrupa muchas jornadas. Y de ahí emerge una entidad natural que antes no existía: **`(fecha, predio)` = el día de operación de un predio**. De ella cuelgan el arqueo y los costos por día de cancha — es la tabla `dia_cancha`, abajo.

**Cantidad de partidos por jornada: se deriva, no se carga.** Es `equipos de la serie / 2` — 16 equipos dan 8 partidos, 14 dan 7. Sin excepciones conocidas. Es la base de los costos por partido.

**Estado y reprogramación.** `estado` (programada/jugada/suspendida/reprogramada) + `reprograma_a` (rastro de la reprogramación). Suspender una jornada la saca de la proyección y del presupuesto de esa semana; reprogramar mueve el vencimiento atado. Es el punto donde el calendario deja de ser informativo y pasa a ser el motor de la previsión.

**Playoffs: también por serie.** La final de Libre A y la de Libre B son jornadas distintas, coherente con la liga. Misma tabla, flag `es_playoff`, campo `instancia` en lugar de `numero`. No se autogeneran —cantidad y fecha se desconocen hasta terminar la liga— y no están en el CSV de calendario validado. Detalle completo abajo.

**Estimación de ingreso automática.** Cada jornada proyecta ingreso estimado = arancel del tarifario (por género + regla) × `cantidad_esperada`. Vale igual para liga no jugada y para playoffs. El estimado se reemplaza por lo comprometido cuando se arman las fichas. Coherente con el principio (c) y con la proyección de caja por niveles de certeza (§3.16).

**Grilla.** `generar_grilla_liga()` pasa de sembrar 28 filas fecha × género a cargar las **284 desde el calendario validado por serie** (`supabase/seeds/clausura_2026_04_calendario.csv`). Sus parámetros `p_fechas_masc` / `p_fechas_fem` dejan de tener sentido: cada serie tiene su propia cantidad de fechas y sus propios días.

**Puente con el tarifario.** El placeholder `hito_calendario` (texto) fue reemplazado por el FK real `plan_tarifa_linea.hito_jornada_id → jornada(id)`. Cada línea `fecha_fija` apunta a la jornada que define su vencimiento; reprogramar la jornada recalcula el vencimiento.

#### `dia_cancha` · el día de operación de un predio

*Diseño asentado, pendiente de construir.*

```sql
create table dia_cancha (
  id        uuid primary key default gen_random_uuid(),
  fecha     date not null,
  predio_id uuid not null references predio(id),
  unique (fecha, predio_id)        -- identidad natural
);
```

**Por qué es una tabla y no un `select distinct`.** La entidad se nombró en el Draft 15 pero no existía en ninguna parte: `jornada` **no tiene predio** —una serie juega su fecha N, el modelo no dice dónde— y las únicas tablas con `fecha` *y* `predio_id` son de movimiento: `asiento`, `gasto`, `pago`. Derivarla de ahí sería circular: **para presupuestar los días de cancha habría que mirar los gastos ya cargados**, que es exactamente lo que todavía no pasó. El día de operación es un hecho del calendario, anterior al primer gasto.

**El torneo se deriva, no se guarda.** Mismo criterio que `jornada` (decisión 36): sale de las jornadas que se juegan esa fecha. Guardarlo permitiría que contradiga al calendario, y obligaría a un trigger de coherencia para impedirlo.

**Es compartida, y ese es el punto.** El presupuesto la **cuenta** —multiplicador de las líneas `por_dia_cancha` (§3.3)—; el arqueo **cuelga** de ella (§3.6). Son los dos usos que el Draft 15 había identificado por separado, y comparten la misma definición de "día de operación de un predio". Dos definiciones paralelas se desincronizarían: el presupuesto contando 58 días y el arqueo esperando 54.

**Un día de cancha puede no tener jornada.** El predio opera con el bar abierto, o con un evento, y no se juega. `crear_dia_cancha` **no exige jornada**: si la exigiera, la caja de esos días se quedaría sin dónde colgar, y el arqueo es justamente el otro consumidor de la tabla.

**Dos consumidores, dos lentes.** Comparten la tabla y la miran distinto, deliberadamente:

| | Qué mira | Por qué |
|---|---|---|
| **Arqueo** (§3.6) | la **tabla**, todas las filas | si hubo caja ese día en ese predio hay que contarla, haya habido fútbol o no |
| **Presupuesto** (§3.3) | la vista **`v_dia_cancha_torneo`**, que hace *inner join* contra `jornada` | un día de solo bar no lleva fotógrafo ni árbitros; contarlo inflaría el presupuesto con un día que el torneo no jugó |

La distinción entre "día de operación" y "día de torneo" es **una lente de lectura, no una restricción de escritura**. Ponerla en la escritura obligaría a elegir una de las dos y romper al otro consumidor. Es el mismo criterio de fuente única de §1.c: una sola tabla, y cada dominio la lee como le corresponde.

Las jornadas suspendidas no cuentan para la lente de presupuesto: si todas las de una fecha están suspendidas, esa fecha no se jugó y el presupuesto por día de cancha baja. El arqueo de ese día sigue existiendo.

**Se gestiona con funciones, igual que la jornada** — una lógica, dos puertas (abajo). El seed del Clausura y el módulo de calendario que vendrá después llaman a la misma función validada.

**Clausura 2026: 29 fechas × 2 predios activos = 58 días de cancha** como caso base. No es una constante del schema (regla 12): entra como datos. Las excepciones conocidas —domingos con un solo predio, semifinal y final— se cargan como tales, no se asumen.

#### Gestión de jornadas · una lógica, dos puertas

*Construido* — migración `20260801131425_gestion_jornadas.sql`.

Las jornadas se cargan y se editan por dos vías que comparten **la misma lógica validada**:

- **Seed** — hoy: carga el Clausura 2026 desde el CSV validado.
- **App** — más adelante: el módulo de calendario, desde pantalla.

Las dos llaman a las mismas funciones. **No hay dos caminos que validen distinto**, que es el error clásico: el seed carga algo que la pantalla habría rechazado, o al revés.

Las funciones son **agnósticas del torneo** (regla 12): reciben serie, número y fecha. No saben qué es "Clausura" ni cuántas fechas tiene una serie. Lo específico entra como datos.

| Función | Qué hace |
|---|---|
| `crear_jornada(serie_id, numero, fecha)` | Alta validada: la serie existe, el número no se repite en esa serie —respeta `unique (serie_id, numero)`—, la fecha es válida o `null` (se permite sembrar la grilla antes de programar los días) |
| `mover_jornada(jornada_id, nueva_fecha)` | Cambia la fecha. **Las cuotas de liga recalculan su vencimiento solas**, porque lo derivan de `jornada.fecha` en vez de tenerlo copiado |
| `suspender_jornada(jornada_id)` | La jornada pasa a `suspendida`. Sus cuotas de liga **salen del circuito de cobro** |

**Reprogramar es mover una suspendida.** Vuelve a `programada` con la fecha nueva, y sus cuotas vuelven al circuito con el vencimiento nuevo.

#### Estado de la jornada y efecto en su cuota de liga

| Estado de la jornada | Qué pasa con la cuota de liga |
|---|---|
| `programada`, con fecha | vencimiento = `jornada.fecha`, circuito normal |
| `programada`, sin fecha | sin vencimiento todavía — B0 no la genera hasta que haya fecha |
| **`suspendida`** | **fuera del circuito de cobro**: no es deuda vencida hasta que se reprograme |
| `jugada` | vencimiento = `jornada.fecha`, se cobra normalmente |

**Lo que más cuidado necesita: una cuota de liga cuya jornada está suspendida no debe aparecer como deuda.** Un equipo cuya fecha se suspendió **no es moroso de esa cuota** — no se jugó, no corresponde reclamarla. Si las vistas no lo contemplan, el equipo aparece debiendo algo que nadie le va a cobrar, y la pantalla de deudores pierde credibilidad.

#### Playoffs · el cuadro es de la serie

*Diseño asentado, pendiente de construir — pieza 6.*

**Los playoffs ya cuelgan de serie.** La pieza 1 movió *toda* `jornada`, no solo la liga: `serie_id` es `NOT NULL` y no queda rastro de `genero`. La final de Libre A y la de Libre B son jornadas distintas, y las series no se mezclan — `jornada.serie_id` es una sola, así que un cuadro cruzado no es representable ni por accidente.

Lo que faltaba no era el recolgado sino **tres agujeros**, que es lo que esta pieza cierra:

| Agujero | Hoy | Consecuencia |
|---|---|---|
| **Sin puerta** | `crear_jornada` **hardcodea `es_playoff = false`** y exige `numero` positivo | la única vía sería `insert` directo, justo lo que la decisión 49 vino a evitar |
| **`unique` que no protege** | `unique (serie_id, numero)`, y en playoff `numero` es `NULL` | Postgres considera cada `NULL` distinto: se pueden crear **infinitas finales de Libre A** sin que nada falle |
| **`instancia` sin dominio** | ningún CHECK | `'final'`, `'Final'`, `'semi'`, `'semifinal'` pasan todas, y después no agrupan |

`mover_jornada` y `suspender_jornada` no se tocan: operan por `id` y ya son agnósticas del tipo de jornada.

##### El formato es una tabla, no un CHECK

```sql
create table formato_instancia (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null unique,   -- cuartos | semifinal | final
  cantidad_partidos smallint not null,      -- 4 | 2 | 1
  orden             smallint not null
);
```

Estructura estándar, igual en todas las series de los dos géneros:

| Instancia | Equipos | Partidos |
|---|---|---|
| cuartos | 8 | **4** |
| semifinal | 4 | **2** |
| final | 2 | **1** |

**Los equipos no se guardan: son `partidos × 2`.** Guardar los dos permitiría que se contradigan, y el que hace falta para presupuestar es el de partidos.

**Cerrar el dominio con `check (instancia in ('cuartos','semifinal','final'))` sería violar la regla 12.** Ese es el formato de *este* torneo: otro puede tener octavos, repechaje, tercer puesto, o final a ida y vuelta. Un torneo nuevo tiene que entrar con sus datos, sin tocar código — y ese es el test.

`jornada.instancia` se valida **contra esta tabla**. Editable y extensible sin migración.

##### `crear_playoff` · la cuarta puerta

```sql
crear_playoff(serie_id, instancia, fecha default null,
              cantidad_partidos default <del formato>) → uuid
```

Extiende la decisión 49 —una lógica, dos puertas— al playoff. Crea la jornada con `es_playoff = true` y sin `numero`, valida que la serie exista, que la instancia esté en `formato_instancia`, y **la unicidad de `(serie_id, instancia)`**, que es la identidad natural que el `unique` roto no cubría.

`fecha` puede ser `null`: el playoff se crea cuando se define el cuadro y se programa después con `mover_jornada`. Cantidad y fecha se desconocen hasta que termina la liga, así que no se autogeneran ni están en el CSV de calendario.

##### `equipo_playoff` · quién juega cada instancia

```sql
create table equipo_playoff (
  id                 uuid primary key default gen_random_uuid(),
  equipo_torneo_id   uuid not null references equipo_torneo(id),
  jornada_playoff_id uuid not null references jornada(id),
  unique (equipo_torneo_id, jornada_playoff_id)
);
```

En la liga no hace falta —juegan todos los de la serie, siempre— pero en playoff **la clasificación es el dato**: quién llegó a semifinal no se deriva de nada que el sistema tenga. Sin esta tabla no hay a quién cobrarle.

##### La cuota de playoff se genera después, por instancia

**Hoy B0 excluye los playoffs de la generación de cuotas, y está bien.** Lo hace por triple partida: la validación los saltea y las dos ramas del CTE los dejan afuera. Los "0 cuotas de playoff" del test de B0 son deliberados.

**Al armar la ficha no se puede saber**: no existen las jornadas de playoff, no hay fechas, y sobre todo **no se sabe si el equipo va a clasificar**. Facturarle a los 16 equipos de la serie una final que juegan 2 sería inventar deuda.

**Se cobra por instancia jugada, no un paquete al clasificar.** El equipo juega cuartos → cuota de cuartos; pasa a semifinal → cuota de semifinal. Es el mismo criterio que la liga: se factura lo que se juega, a medida que se juega. Un equipo eliminado en cuartos no debe la semifinal.

```sql
generar_cuotas_instancia(jornada_playoff_id) → int
```

Genera **una cuota por equipo registrado en esa instancia**, con el arancel de la línea `es_playoff` del tarifario de su género, atada a la jornada de playoff. El vencimiento **se deriva de `jornada.fecha`**, mismo patrón que la cuota de liga (decisión 50) y sincronizado por el mismo trigger: reprogramar la final mueve el vencimiento de sus cuotas sin tocar ninguna cuota.

**Percibido puro intacto** (§1.b): la jornada de playoff no genera asiento y la cuota tampoco. El ingreso aparece al cobrar, igual que todo lo demás.

El tarifario ya tiene la línea, **solo en la opción "Pago por fecha"** — quien eligió "Cuotas" paga un total plano que ya la incluye:

| Género | Regla | Precio ef/tr | `cantidad_esperada` |
|---|---|---|---|
| masculino | `por_partido`, `es_playoff` | 470.000 / 530.000 | 3 |
| femenino | `por_partido`, `es_playoff` | 150.000 / 180.000 | 3 |

Sin `fecha_desde`/`fecha_hasta`, con carve-out explícito en `chk_por_partido`.

##### El playoff no infla el presupuesto

> **⚠ Bug latente que esta pieza destapa.** `v_torneo_escala.partidos` (§3.3) calcula `equipos de la serie ÷ 2` **por cada jornada no suspendida, sin excluir playoffs**. Para la liga es correcto. Para un playoff no: la final de Libre A es **1 partido**, no `16 ÷ 2 = 8`. Hoy no molesta porque hay 0 playoffs; en cuanto se creen, cada instancia infla el multiplicador `por_partido` del presupuesto — con 3 instancias × 20 series, mucho, y **en silencio**. Misma clase que la bomba del 284.

El arreglo separa los dos casos:

| Tipo de jornada | Partidos |
|---|---|
| **liga** | `equipos de la serie ÷ 2` — se deriva (decisión 45) |
| **playoff** | `jornada.cantidad_partidos` — **es dato** |

**La decisión 45 queda acotada a la liga.** "Los partidos se derivan del tamaño de la serie" vale mientras juegan todos contra todos; en un cuadro la cantidad depende del **formato**, no del tamaño de la serie. Por eso `formato_instancia` trae el default y `jornada` guarda el valor efectivo — una semifinal a partido único y otra a ida y vuelta son formatos distintos y el número tiene que poder diferir.

##### Alcance: el backend ahora, el bracket después

Esta pieza construye **solo el backend**: `formato_instancia`, `crear_playoff`, `equipo_playoff`, `generar_cuotas_instancia` y el arreglo de `v_torneo_escala`.

**La pantalla de bracket** —elegir los 8 que pasan a cuartos, los 4 a semifinal, los 2 a la final— es front, y va después. Invoca estas mismas funciones: una lógica, dos puertas, igual que en jornadas. Lo que la pantalla llena es `equipo_playoff`, y de ahí salen las cuotas.

#### Impacto en las vistas de deuda

Hoy "¿esta cuota está vencida?" se responde con el `vence_at` propio de la cuota. Para las de liga pasa a depender del **estado y la fecha de su jornada**. Toda vista que calcule deuda —`v_deuda_detalle`, `v_estado_cuota`, `v_cuenta_corriente_equipo`, `v_deuda_equipo`, `v_cobranza_kpi`— tiene que distinguir:

- **Cuota fija**: `vence_at` propio, como hoy.
- **Cuota de liga**: derivar de la jornada, y **excluir las de jornada suspendida** del cálculo de deuda vencida.

Se revisa vista por vista al construir.

> **Resuelto al construir la pieza 2.** `cuota.vence_at` **se mantuvo `NOT NULL`, como caché sincronizada por trigger** (`trg_sync_cuota_vence_at`), con el precedente de `sync_total_facturado`. Dejarlo nulo habría roto los **ocho consumidores** que lo leen —cinco vistas más `generar_cuotas_plan`, `sugerir_imputacion` y `crear_equipo_torneo`—. El trigger va **sobre `jornada`**, no dentro de `mover_jornada`, para que un `update` directo también propague.

### 3.6 Caja, arqueo y consolidación de efectivo

#### El estado real de `caja`

```sql
create table caja (
  id        uuid primary key default gen_random_uuid(),
  tipo      text not null,               -- efectivo | transferencia | usd
  nombre    text not null,
  predio_id uuid references predio(id),
  activo    boolean not null default true
);
```

*Hasta el Draft 16 esta sección documentaba `caja` como `(id, tipo unique)`. **La tabla real siempre fue ésta**, y es la correcta: `tipo` no es único, porque hay **una caja de efectivo por predio**. Corregido contra el schema.*

Filas hoy: `Efectivo Tirolesa` @ TIR · `Efectivo Aeropuerto` @ AEP · `Caja Transferencia` (global) · `Caja USD` (global). El trigger `check_caja_predio` garantiza que efectivo tenga predio y que el resto no.

**El efectivo se discrimina por `asiento.predio_id`, no por cuenta.** Hay una sola cuenta contable `CAJA_EFECTIVO`; el predio vive en la cabecera del asiento, y `v_saldo_caja` filtra por él. Esto importa para la consolidación, abajo.

Efectivo se cuenta (arqueo); transferencia se concilia contra el extracto.

#### El circuito real del efectivo

*Diseño asentado, pendiente de construir — pieza 4.*

La plata cobrada en un predio el fin de semana no llega a la administración ese mismo día. Hay dos momentos, y **el modelo tiene que distinguirlos**:

```
COBRO (finde)          ARQUEO (finde)              ENTREGA (lunes)
efectivo entra    →    control: contado vs    →    plata del predio a central
a la caja del          sistema congelado;          un asiento de traslado;
predio                 registra diferencia         el arqueo pasa a 'entregado'
                       NO mueve plata
```

**No hay estado contable intermedio "en tránsito".** El arqueo mismo *es* el estado: un arqueo hecho y no entregado **significa** que la plata la tiene su responsable. El saldo sin rendir de una persona sale de sumar sus arqueos pendientes — no necesita cuenta propia, y agregarle una sería inventar un pasivo que se resuelve solo el lunes.

#### El arqueo cuelga de `dia_cancha`

```sql
create table arqueo (
  id             uuid primary key default gen_random_uuid(),
  dia_cancha_id  uuid not null unique references dia_cancha(id),
  saldo_sistema  numeric(16,2) not null,       -- congelado al arquear
  saldo_contado  numeric(16,2) not null,
  diferencia     numeric(16,2) generated always as (saldo_contado - saldo_sistema) stored,
  estado         text not null default 'pendiente_entrega'
                 check (estado in ('pendiente_entrega','entregado')),
  asiento_id     uuid references asiento(id),   -- ajuste de la diferencia, si se resuelve
  responsable_id uuid not null references auth.users(id),
  created_at     timestamptz not null default now()
);
```

*La tabla real todavía tiene `jornada_id` + `predio_id`, ambos `NOT NULL`. La decisión 46 estaba escrita en presente sin estar construida; esta pieza la hace realidad.*

**`jornada_id` + `predio_id` → `dia_cancha_id`.** Dos columnas se vuelven una FK. El arqueo controla la caja física de un predio en un día; con jornadas por serie, atarlo a "la jornada de una serie" pierde sentido — ese día jugaron varias series y la plata no distingue de cuál vino.

**`unique (dia_cancha_id)`** corrige de paso un agujero: hoy nada impide dos arqueos del mismo predio y fecha.

**La decisión 56 es precondición de ésta.** Como un día de cancha puede existir **sin jornada**, el arqueo de un sábado de solo bar tiene dónde colgar. Si hubiéramos exigido jornada al crear el día, acá estaríamos desarmándolo.

Migrar es gratis: la tabla tiene **0 filas**, ninguna FK entrante, ninguna vista que la lea y ningún código de app que la toque. No hay backfill.

#### El saldo esperado, y por qué se congela

**Hoy no existe.** `v_saldo_caja` da el acumulado *a hoy*, sin corte por fecha, y no puede responder *"¿cuánto efectivo debería haber en TIR al cierre del 8/8?"*. Hace falta el cálculo con corte temporal, derivado del libro diario: lo cobrado en efectivo en ese predio hasta esa fecha, menos lo pagado en efectivo, menos lo ya entregado a central.

Es el trabajo con sustancia de la pieza. El recolgado es un `alter table`; esto es una vista nueva.

**`saldo_sistema` se congela.** Se calcula al arquear y se guarda. **El arqueo es un acta histórica**: si mañana se corrige un asiento viejo, el `saldo_sistema` de ese arqueo no cambia — decía lo que el sistema decía ese día, y ese es el punto de un acta. Mismo mecanismo que `total_facturado` o `pagado_at`, pero acá el congelamiento es **el propósito**, no una caché.

Esto no contradice §1.c: el saldo esperado **se deriva del diario** al momento de calcularlo. Lo que se guarda es la foto, no una segunda fuente.

#### El movimiento contable: uno solo, al entregar

**Escenario A, decidido.** El efectivo del predio baja **al entregar**, no al arquear.

| Momento | Qué pasa contablemente |
|---|---|
| **Arqueo** (finde) | **nada**. Control puro: registra contado vs sistema y la diferencia |
| **Entrega** (lunes) | **un único asiento** predio → central. El arqueo pasa a `entregado` |

Entre los dos momentos la plata figura en la caja del predio, y *quién la tiene* lo dice el `responsable_id` del arqueo pendiente. Un solo asiento, sin cuenta intermedia "a rendir": el estado lo lleva el arqueo, no el plan de cuentas.

> **⚠ Este asiento no se puede expresar con el modelo actual.** Dos hallazgos del relevamiento, que la construcción tiene que resolver **antes** de escribir `registrar_entrega_central`:
>
> **1 · `asiento_linea` no tiene `predio_id`.** El predio vive en la **cabecera** del asiento. Un traslado TIR → central necesitaría dos ámbitos de predio en un mismo asiento, y no hay dónde ponerlos. Con una sola cuenta `CAJA_EFECTIVO`, las dos líneas caen en el mismo balde `(cuenta, predio)` y **se netean a cero**: el traslado sería invisible y el saldo de TIR no bajaría.
>
> **2 · No hay caja central posible hoy.** `check_caja_predio` **rechaza** una caja de efectivo sin predio, que es justo lo que sería la central.
>
> **Salida propuesta:** una cuenta propia **`CAJA_CENTRAL`**. El asiento queda `CAJA_CENTRAL` al debe / `CAJA_EFECTIVO` al haber, con `predio_id` = el predio de origen en la cabecera — las dos líneas difieren por **cuenta**, no por predio, y el saldo del predio baja correctamente. Arrastra dos cambios: `caja` gana `cuenta_id → cuenta(id)` (hoy `v_saldo_caja` mapea `tipo → código` con un `case` escrito a mano, que no puede distinguir dos cajas de efectivo), y `check_caja_predio` se ajusta para admitir la central. Se cierra al construir.

#### La diferencia: se registra, no se resuelve

`diferencia = saldo_contado - saldo_sistema`, columna generada.

Se registra **sin forzar resolución**. Faltante o sobrante quedan asentados como diferencia, y ahí se detienen. **Quién se hace cargo** —¿lo cubre el responsable? ¿es quebranto?— es un paso posterior, y puede no ocurrir nunca. `asiento_id` es nullable justamente para eso: es el ajuste **cuando se resuelva**.

> Reemplaza al criterio del Draft 16, que decía que la diferencia *"genera un asiento de ajuste y afecta el saldo real de la caja"* como parte del arqueo. Sigue siendo cierto que la resolución genera asiento y mueve caja; lo que cambia es **cuándo**: no al arquear. Forzar la imputación en el momento del conteo obliga a decidir sobre la marcha algo que necesita conversación.

#### Las puertas

Agnósticas del torneo (regla 12), una lógica para el seed y para la app que venga.

| Función | Qué hace |
|---|---|
| `crear_arqueo(dia_cancha_id, saldo_contado, responsable_id)` | Calcula y **congela** `saldo_sistema`, guarda lo contado, la diferencia sale sola, estado `pendiente_entrega`. Valida el `unique` |
| `registrar_entrega_central(arqueo_id, …)` | Genera el asiento predio → central y marca `entregado` |

#### Qué habilita

- **Saldo sin rendir por responsable** = Σ de sus arqueos `pendiente_entrega`. Sale de los arqueos, sin cuenta contable propia.
- **Diferencias registradas y sin resolver** — la cola de trabajo del control de caja.
- **Historial de arqueos** por predio y fecha.

### 3.7 Moneda extranjera · caja USD de cobertura

Campa guarda excedentes en dólares como **cobertura cambiaria**. Es plata de la **empresa**, no de los socios: nada que ver con el fondo de inversión (§3.15), que tiene su propia tabla y su propia cuenta.

```sql
create table usd_operacion (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  tipo        text not null,               -- compra | venta
  cantidad    numeric(14,2) not null,      -- negativo en venta
  tc          numeric(10,2) not null,
  monto_pesos numeric(16,2) not null,
  motivo      text,
  asiento_id  uuid references asiento(id)
);
```

#### El diario es monomoneda, y eso se sostiene

**`asiento_linea` no tiene moneda ni cantidad** — es `(cuenta, debe, haber, tercero)`, todo en pesos. Tampoco hay ninguna columna de divisa en el resto del schema.

La complejidad del dólar queda **aislada en `usd_operacion`**, y la división es limpia:

| Número | De dónde sale |
|---|---|
| **Tenencia** — cuántos USD hay | `Σ cantidad` de `usd_operacion` |
| **Costo en libros** — cuánto valen en pesos | saldo de `CAJA_USD` en el diario |

Los dos hacen falta y **el PPP es el puente**. No se toca el diario para meterle multimoneda: esa decisión ya estaba tomada en el schema original y es la correcta.

#### Valuación por promedio ponderado (PPP)

Los dólares en caja valen el **promedio ponderado de las compras**, y salen a ese promedio al venderse.

```
tenencia_usd    = Σ cantidad de usd_operacion
costo_libros    = saldo de CAJA_USD (pesos)
costo_promedio  = costo_libros / tenencia_usd
```

**El promedio no se guarda en ninguna parte: se deriva.** Y se mantiene solo — al vender, `CAJA_USD` baja exactamente por el costo de salida, así que lo que queda conserva el mismo promedio.

```
compra 500 @ 1.000  +  compra 500 @ 1.100
  → 1.000 USD · $1.050.000 · promedio 1.050

vende 700 @ 1.200
  costo de salida  700 × 1.050 = 735.000
  recibido         700 × 1.200 = 840.000
  ganancia                        105.000
  → quedan 300 USD · $315.000 · sigue en 1.050
```

#### La diferencia de cambio es solo realizada

**Los dólares quedan a su costo hasta que se venden.** La ganancia o pérdida se reconoce **al concretar la venta**, nunca por revalúo periódico: sin ganancias en papel.

> **`revaluacion` sale del dominio.** `usd_operacion.tipo` admitía `('compra','venta','revaluacion')`. Con el modelo realizado la revaluación no existe, y **un valor del dominio que el modelo no usa es una trampa**: alguien lo va a elegir y va a asentar una ganancia que no ocurrió. Misma limpieza que `por_jornada` en la pieza 5. Si algún día se quiere revalúo, se agrega — con su lógica.
>
> Esto **reemplaza** la fila "Revaluación → `Caja USD` / `Diferencia de cambio` → No realizado" que esta sección traía desde el schema original.

#### Los dos asientos

```
COMPRA — USD 1.000 a $1.000
  CAJA_USD          debe   1.000.000
    <caja pesos>          haber  1.000.000
  Ningún resultado: es una permuta.
  + usd_operacion (compra, cantidad +1.000, tc 1.000, monto_pesos 1.000.000)

VENTA — USD 1.000 a $1.200, con promedio en libros de $1.000
  <caja pesos>      debe   1.200.000     lo recibido
    CAJA_USD              haber  1.000.000     salen al PPP
    FIN_DIF_CAMBIO        haber    200.000     ganancia realizada
  Si el dólar hubiera bajado, FIN_DIF_CAMBIO va al DEBE (pérdida).
  + usd_operacion (venta, cantidad −1.000, tc 1.200, monto_pesos 1.200.000)
```

`crear_asiento` expresa las tres líneas sin cambios: acepta N líneas con la única condición de que balanceen, `origen = 'usd'` ya está en su CHECK, y ni `CAJA_USD` ni las cajas de pesos globales exigen predio.

**Nivel empresa**, `torneo_id = NULL`: la cobertura no es de ningún torneo (decisión 5).

#### La cuenta ya existe, pero no se ve en ninguna pantalla

`CAJA_USD` (activo) y **`FIN_DIF_CAMBIO`** (`financiero`) están en el plan desde el schema inicial, sin uso. **No se crea ninguna cuenta.** Ojo con el nombre: es `FIN_DIF_CAMBIO`, no `DIFERENCIA_CAMBIO`.

`FIN_DIF_CAMBIO` es de tipo `financiero` y no `ingreso`/`egreso` operativo, así que **`v_resultado_producto` no la toma** — filtra `c.tipo in ('ingreso','egreso')`. Es exactamente lo que pide la decisión 12: una suba del dólar no debe leerse como que el torneo funcionó mejor.

> **Pero esa "línea aparte" no existe.** Ninguna vista lee `FIN_DIF_CAMBIO`: hoy la diferencia de cambio se registraría y **no se vería en ninguna pantalla**. El módulo trae su propia vista, o el resultado financiero queda invisible.

#### Lo que se lee

| Vista | Para qué |
|---|---|
| `v_tenencia_usd` | cuántos USD hay, costo en libros y promedio ponderado actual |
| `v_resultado_cambio` | la diferencia de cambio realizada, que hoy no se ve |

#### La red de seguridad · `v_usd_sincronia`

El promedio cruza **dos fuentes**: la cantidad sale de `usd_operacion` y los pesos del diario. Si alguien asienta contra `CAJA_USD` **sin** registrar la operación —un `crear_asiento` directo, un ajuste— el promedio queda mal **en silencio** y todas las ventas posteriores salen a un costo equivocado.

`v_usd_sincronia` compara el costo en libros contra el que se reconstruye desde `usd_operacion`, y dice `OK` o qué no cierra.

**El costo esperado no es `Σ monto_pesos`.** En una venta, `monto_pesos` es lo **recibido**, pero de `CAJA_USD` sale el **costo al PPP** — dos números distintos. Y el PPP de cada venta dependió del estado en ese momento. Por eso hay que **reconstruirlo**, rehaciendo el promedio operación por operación.

> **El orden del replay tiene que ser el de ejecución, y eso obligó a una columna nueva.**
>
> `fecha` **no sirve**: `vender_usd` calcula el PPP sobre el estado real del diario al ejecutar, así que una compra registrada con fecha vieja después de una venta daría un replay distinto del que ocurrió.
>
> `asiento.created_at` **tampoco**: `now()` devuelve la hora de la **transacción**, no de la sentencia. Varias operaciones en una misma transacción quedan con timestamp idéntico y el desempate cae en un uuid aleatorio. **Lo detectó el test**: las ventas se replicaban antes que las compras y el costo esperado salía igual a la suma de las compras, sin restar nada.
>
> `usd_operacion.orden` —una secuencia, que sí avanza dentro de la transacción— es la clave correcta.

#### Funciones

| Función | Qué hace |
|---|---|
| `comprar_usd(fecha, cantidad, tc, motivo)` | asiento de compra + registra la operación |
| `vender_usd(fecha, cantidad, tc, motivo)` | calcula el PPP, arma el asiento de tres líneas y registra la operación. Valida que haya dólares suficientes |

**No hay proceso mensual.** A diferencia de socios y sponsors, las operaciones son puntuales: no hay nada que devengar, y `periodo_de_fecha` resuelve el período al asentar.

**Alcance:** el más liviano de los módulos. No se crea estructura — tabla, caja y cuentas ya existen. Solo falta la lógica.

### 3.8 Presupuesto

```sql
create table presupuesto (
  id           uuid primary key default gen_random_uuid(),
  torneo_id    uuid references torneo(id),   -- NULL = presupuesto de estructura anual
  ejercicio_id uuid not null references ejercicio(id),
  estado       text not null default 'borrador'
);

create table presupuesto_linea (
  id              uuid primary key default gen_random_uuid(),
  presupuesto_id  uuid not null references presupuesto(id) on delete cascade,
  cat_gasto_id    uuid not null references cat_gasto(id),
  concepto_id     uuid references concepto_gasto(id),
  base            numeric(16,2) not null,
  cantidad        numeric(16,2) not null default 1,
  unidad          text                       -- NULL = heredar del catálogo (§3.3)
    check (unidad is null or unidad in
          ('por_partido','por_dia_cancha','por_mes','anual','unico'))
);
```

*Hasta el Draft 15 esta sección documentaba columnas `arancel`, `cantidad_x_fecha` y `monto_mensual` que **nunca existieron en la base**: la tabla se construyó con `base`, `cantidad` y `unidad`. Corregido contra el schema real.*

**`unidad` pasa a ser anulable y cambia de dominio.** Era `not null` con `check ('por_jornada','por_mes','anual','unico')`. Ahora admite `null` —que significa *heredar el default del catálogo*, no *sin definir*— y `por_jornada` desaparece, reemplazada por `por_partido` y `por_dia_cancha`. **La tabla tiene 0 filas**, así que el cambio de `check` no migra ningún dato.

Presupuesto = `base × cantidad ×` el multiplicador de su unidad efectiva (§3.3):

| Unidad efectiva | Multiplicador |
|---|---|
| `por_partido` | Σ `equipos(serie) / 2` sobre las jornadas no suspendidas del torneo |
| `por_dia_cancha` | `count(*)` de `dia_cancha` del torneo |
| `por_mes` | meses del ejercicio |
| `anual`, `unico` | 1 |

> **La cuenta plana `× jornadas_no_suspendidas` era una bomba.** `v_presupuesto_total` multiplicaba por `count(*) from jornada where torneo_id = … and estado <> 'suspendida'`: **28** con jornadas por género, **284** con jornadas por serie. Un presupuesto se habría mostrado **diez veces más grande, sin error ni advertencia** — el peor modo de falla, porque un número plausible no se cuestiona. Se arregla con las tablas todavía vacías: nunca llegó a existir un número mal.

> **Segundo bug en la misma vista.** La rama final era `else pl.base`, sin `cantidad`: una línea `unico` de `500.000 × 3` mostraba **500.000**. Ahora todas las ramas multiplican por `cantidad` y solo cambia el factor. También se saca el `* 12` escrito a mano de `por_mes`: los meses se derivan del ejercicio.

La vista expone además `unidad` y `factor`, para que la pantalla pueda mostrar **de dónde salió el número** en lugar de solo el número.

Nota: hoy `por_partido` da **0**, porque no hay fichas cargadas y los partidos se derivan de los equipos de cada serie. Es correcto, no un bug — el presupuesto por partido existe recién cuando se sabe cuántos equipos hay.

El desvío se calcula por `cat_gasto_id`, que es la misma dimensión con la que se carga el gasto real. No hay tabla de mapeo entre presupuesto y real, y esa ausencia es el punto.

### 3.9 Comunicaciones

```sql
create table plantilla_mail (
  id      uuid primary key default gen_random_uuid(),
  clave   text not null unique,    -- aviso_7dias | reclamo_vencida | reclamo_2 | recibo_pago
  asunto  text not null,
  cuerpo  text not null            -- con placeholders {{equipo}}, {{monto}}, {{vence}}
);

create table envio (
  id           uuid primary key default gen_random_uuid(),
  tercero_id   uuid not null references tercero(id),
  plantilla    text not null,
  destinatario text not null,
  payload      jsonb,
  enviado_at   timestamptz not null default now(),
  enviado_por  uuid references auth.users(id)   -- NULL si fue automático
);
```

**Reglas de negocio del reclamo:**

- El aviso previo (7 días) aplica **solo a modalidad `cuotas`**. Los equipos `unitario` no tienen vencimiento conocido — se les cobra en la cancha.
- El nivel de automatización es configurable: `manual` (botón por equipo) / `mixto` (aviso automático, reclamo manual) / `automatico` (ambos, con log).
- Todo envío queda registrado en `envio` y visible desde la cuenta corriente del tercero.

### 3.10 Previsión de caja

La proyección no es una tabla: es una vista que une tres orígenes.

```sql
create view v_flujo_proyectado as
-- 1. COMPROMETIDO: cuota impaga con vencimiento (no genera asiento)
select c.vence_at as fecha, 'comprometido' as origen, 'ingreso' as signo, c.monto,
       t.nombre as detalle
from cuota c
join equipo_torneo et on et.id = c.equipo_torneo_id
join tercero t        on t.id = et.tercero_id
where c.pagado_at is null

union all
-- 2. RECURRENTE: gastos fijos mensuales proyectados
select make_date(extract(year from d)::int, extract(month from d)::int, 25),
       'recurrente', 'egreso', pl.monto_mensual, cg.nombre
from presupuesto_linea pl
join cat_gasto cg on cg.id = pl.cat_gasto_id
cross join generate_series(current_date, current_date + interval '6 months', '1 month') d
where cg.grupo = 'recurrente'

union all
-- 3. ESTIMADO: gastos de jornadas que faltan jugar
select j.fecha, 'estimado', 'egreso',
       pl.arancel * pl.cantidad_x_fecha, cg.nombre
from jornada j
join presupuesto p       on p.torneo_id = j.torneo_id
join presupuesto_linea pl on pl.presupuesto_id = p.id
join cat_gasto cg        on cg.id = pl.cat_gasto_id
where j.estado = 'programada' and cg.grupo = 'fecha';
```

La UI los distingue con badge (C / R / E). Es lo que permite responder "¿de dónde sale este número?" sin abrir el código.

---

### 3.11 Activos y amortización

Compras grandes se activan y amortizan mensualmente en lugar de impactar íntegras en el mes de pago.

**Umbral de materialidad.** `config_contable.umbral_activacion` (default $500.000). Por debajo, el gasto va directo al período. Por encima, la UI **ofrece** activar sin forzarlo.

El riesgo del módulo no es contable sino de adopción: si hay que dar de alta cada compra menor, en tres meses nadie lo mantiene. Con umbral razonable se esperan 5-10 altas por año.

**Circuito:**

| Momento | Debe | Haber |
|---|---|---|
| Compra | `Bienes de uso` | `Proveedores a pagar` |
| Pago | `Proveedores a pagar` | `Caja` |
| Cierre de cada mes | `Amortizaciones` (egreso) | `Amortización acumulada` |

La compra **no toca el resultado** —cambia un activo por otro—. Lo que impacta el P&L es la cuota mensual.

**Generación con revisión.** Al cerrar el período, `proponer_amortizaciones()` calcula las cuotas del mes y las deja en estado `propuesta`. Alguien revisa y confirma. Sin confirmar no se cierra el período.

**La amortización no va al flujo de caja.** Es gasto sin movimiento de dinero: la salida ocurrió al pagar el bien. Confundirlos duplicaría el impacto.

**Imputación:** siempre estructura permanente (`torneo_id = NULL`). El bien sirve a todos los torneos que dura.

### 3.12 Compromisos

Todo lo que tiene fecha cierta y monto conocido vive en `compromiso`: facturas, cuotas de plan, cheques emitidos, cheques a cobrar. El calendario de pagos es una consulta sobre esa tabla, no una pantalla que junta datos de cinco lugares.

**Criticidad diferenciada.** No todas las obligaciones pesan igual:

| Tipo | Criticidad | Consecuencia de no cumplir |
|---|---|---|
| `cheque_emitido` | Crítico | Rebota: consecuencias bancarias inmediatas |
| `cuota_plan` | Alto | Puede caer el plan entero |
| `factura` | Medio | Suele admitir unos días |

### 3.13 Cheques

Un cheque **no es un pago**: es una promesa de pago con fecha. Afecta la deuda en un momento y la caja en otro.

| Momento | Deuda | Caja |
|---|---|---|
| Recibo un cheque a 60 días | Cancela la deuda del sponsor | Sin movimiento |
| Se acredita | — | Entra la plata |
| Emito un cheque | Cancela mi deuda | Sin movimiento |
| Se debita | — | Sale la plata, si está |

**Cuentas puente:** `Valores a depositar` (recibidos) y `Cheques a pagar` (emitidos). Su saldo es exactamente la cartera pendiente.

**Endoso: no se modela.** Si endosan un cheque recibido para pagar a un tercero, se registra el recibido como cobrado y el pago como realizado. *Salvedad conocida:* si endosan un cheque a 60 días para pagar hoy, la proyección muestra la salida hoy. Imprecisión aceptada a cambio de no modelar cadenas de endoso.

**Alerta de cobertura.** Si un cheque emitido cae en una fecha donde el saldo proyectado no alcanza, se avisa con anticipación. Es la función más valiosa del módulo.

### 3.14 Planes de pago

Cuotas fijas, fechas conocidas: el compromiso más predecible que existe. Al dar de alta un plan, `generar_cuotas_plan()` crea todos sus compromisos.

Si el plan cae por falta de pago, sus compromisos pendientes se anulan y se alerta: la consecuencia de una moratoria caída es mayor que la cuota impaga.

### 3.15 Fondo de inversión

Los socios tienen dinero colocado en un fondo del banco. Cuando el cashflow lo necesita hacen un **rescate**; cuando se recompone, devuelven.

**No se modela como caja con saldo.** Campa no lleva cuánto hay invertido ni concilia contra el banco. Motivos: un saldo que hay que mantener a mano se desactualiza, y un saldo desactualizado es peor que no tenerlo.

| Operación | Debe | Haber |
|---|---|---|
| Rescate | `Banco` | `Fondo de inversión` |
| Colocación | `Fondo de inversión` | `Banco` |

Ninguna toca el resultado: son movimientos de fondos.

**El indicador que importa:** `v_dependencia_fondo` muestra rescatado, colocado y neto por mes. Si el neto acumulado es positivo y creciente, la operación está consumiendo respaldo en lugar de sostenerse. Es la diferencia entre "este mes hubo que rescatar" y "hace ocho meses que rescatamos más de lo que devolvemos".

### 3.16 Proyección de caja y escenarios

Prioridad número uno del dueño. La proyección debe llegar a 12 meses, no a 6 semanas.

**Cinco fuentes, con confianza distinta:**

| Fuente | Origen | Confianza |
|---|---|---|
| Comprometido — cobrar | Cuotas de equipos, sponsors | Alta |
| Comprometido — pagar | Cheques, cuotas de plan, facturas | **Muy alta** |
| Recurrente | Gastos fijos mensuales | Alta |
| Estimado | Jornadas pendientes, torneo siguiente | Media / Baja |
| Respaldo | Cheques a cobrar, rescate del fondo | No automática |

El **respaldo no se suma al saldo proyectado**: es capacidad de reacción, no dinero en la cuenta.

**Escenarios** (`escenario`): tres supuestos mueven toda la proyección —`tasa_cobranza`, `demora_cobro_dias`, `ajuste_gastos_pct`—. Limitar a tres escenarios por ejercicio: diez es una planilla otra vez.

**Alerta de quiebre.** Si el saldo proyectado perfora cero en alguna semana, se avisa en el dashboard con fecha y monto. Avisar en julio que en septiembre falta plata es la función más valiosa de todo el sistema.

**Falsa precisión.** Una proyección a 12 meses donde el mes 11 depende de un torneo que no arrancó es un supuesto, no un pronóstico. Mostrar el nivel de confianza junto al número.

### 3.17 Cobranza

Prioridad dos, e insumo principal de la proyección. Indicadores en `v_cobranza_kpi`:

| Indicador | Para qué |
|---|---|
| Tasa de cobranza | Calibra el escenario base |
| Días promedio de cobro | Alimenta `demora_cobro_dias` |
| Cartera por vencer | Es el ingreso comprometido |
| Cartera vencida | Riesgo real de incobrable |

Si históricamente cobran el 92% de lo comprometido —el total del plan de cuotas, no un devengo: bajo percibido puro no existe—, el escenario base debe usar 92, no 100. Eso es lo que separa un pronóstico de una expectativa.

### 3.18 Tarifario · `plan_tarifa` (capa de catálogos)

Modela las modalidades de pago del torneo. **Versionado por torneo:** cada torneo clona su tarifario y edita valores/reglas sin tocar código. Reemplaza el hardcodeo de precios.

Es una **capa de catálogos / plantilla**, no data entry contable. El devengo no vive acá: cuando se arma la ficha del equipo (`equipo_torneo`), el tarifario es la fuente de la que salen las `cuota` con sus importes y vencimientos —y, derivado de ellas, `total_facturado`—. Armar la ficha no devenga nada: cada cuota se devenga al vencer (ver §3.4 y principio b). `plan_tarifa` no toca asientos.

**Tablas:** `plan_tarifa` (torneo + género + concepto + opción) → `plan_tarifa_linea` (los renglones). Se llama `plan_tarifa` y no `plan_pago` porque este último ya lo ocupa la moratoria de deuda (§3.14).

Dos conceptos independientes por género, cada uno con opciones alternativas; el equipo elige **una opción por concepto** en su ficha:

| Concepto | Opción 1 | Opción 2 |
|---|---|---|
| Inscripción | Pago único (seña + restante) | Cuotas |
| Partidos | Pago por fecha | Cuotas |

**Precio diferenciado Efectivo / Transferencia** en cada línea (nunca declarable/no declarable — principio e).

**Tres reglas de vencimiento** (`regla` en la línea, no en la opción — dentro de "Pago por fecha" conviven las tres):

| Regla | Qué modela |
|---|---|
| `fecha_fija` | Importe fijo que vence en una fecha resuelta contra el calendario del torneo. La línea apunta con `hito_jornada_id` (FK → `jornada`) a la fecha que define su vencimiento, más `fecha_referencia` (snapshot informativo); no una fecha plana. Reprogramar la jornada recalcula el vencimiento (ver §3.5). |
| `por_partido` | Arancel unitario por partido jugado (fechas 1–10, playoffs). Total = arancel × cantidad (decisión 8). Define el importe de la cuota, no un devengo: el ingreso se reconoce al cobrar. |
| `bloque_adelantado` | Rango de fechas cobrado de una vez por adelantado (Masc fechas 11–15, Fem 11–13). El importe cargado **es** el total del bloque. |

**Flag `es_playoff`** en la línea: eliminación directa, sin rango de fechas de liga, máx 3 partidos (cuartos/semi/final).

**Asimetría de bloque entre géneros** (confirmada): en ambos el importe es el total del bloque, pero Masculino nace de 460k/520k × 5 fechas = 2.300k/2.600k, mientras Femenino es 435k/510k como total directo de las 3 fechas.

**Válido para todas las categorías del género** — ninguna categoría tiene tarifa propia, por eso el plan lleva `genero` y no `categoria_id` (principio d, decisión 3). Con la estructura de §3.4 esto se resuelve solo: el género es atributo de la `categoria`, así que la ficha llega a su tarifario subiendo serie → categoría → género.

### 3.19 Socios · sueldo devengado y retiros

*Diseño asentado, pendiente de construir.*

Guille y Agus —los dueños— tienen un **sueldo mensual acordado**. Retiran plata cuando quieren, y el sistema lleva la cuenta: cuánto se devengó, cuánto se retiró, y el saldo acumulado.

- El sueldo es **fijo mensual**, no reparto de ganancias. Puede cambiar en el tiempo.
- **Se acumula**: lo no retirado queda a favor y se cobra cuando el socio quiera.
- Retirar de más deja el saldo **en contra**.
- Saldo **corriente acumulado**, sin reseteo mensual.

Se cargan como `tercero` de tipo **`socio`** — el tipo ya existe en el CHECK y §3.4 ya dice que equipos, sponsors y socios comparten mecánica. No hace falta tabla propia.

#### Forma B · devengo, no percibido puro

**Ésta es la excepción deliberada al principio §1.b.** Los ingresos de equipos van por percibido puro; el sueldo del socio **se devenga**.

| | Reconocimiento | Por qué |
|---|---|---|
| Ingreso de equipo | **percibido** | puede no pagar; hasta que no cobra no hay nada |
| Sueldo de socio | **devengo** | es un compromiso cierto: se acordó pagarlo y existe cada mes, se retire o no |

No registrarlo distorsiona en una dirección concreta: **la caja parece toda del negocio cuando parte ya está comprometida** con los socios. Son situaciones distintas y merecen tratamiento distinto — no es una inconsistencia sino la misma lógica de §1.b aplicada a un hecho de naturaleza opuesta.

#### Los dos asientos

```
Devengo (mensual, automático):
  GAS_SOCIOS        debe   X      egreso — baja el resultado de la EMPRESA
    SOCIOS_A_PAGAR        haber  X      pasivo — lo que se le debe al socio

Retiro (cuando el socio saca plata):
  SOCIOS_A_PAGAR    debe   X      cancela el pasivo
    <caja>                haber  X      sale la plata
```

**El saldo del socio es el saldo de `SOCIOS_A_PAGAR` imputado a ese socio** — devengado menos retirado. Positivo = a favor; negativo = retiró de más. Sale del libro diario, no de un cálculo aparte (§1.c).

`crear_asiento` expresa los dos **sin cambios**: `origen = 'socio'` ya está en su CHECK, y `asiento_linea.tercero_id` permite imputar por socio.

#### Las dos cuentas nuevas

| Cuenta | Tipo | Rol |
|---|---|---|
| **`GAS_SOCIOS`** | `egreso` | el sueldo del socio |
| **`SOCIOS_A_PAGAR`** | `pasivo` | lo devengado y no retirado |

**`egreso`, no `patrimonio`.** El sueldo de socios se trata como **costo del negocio**, no como distribución de utilidad.

**Pero es costo de la empresa, no del torneo.** El asiento va con **`torneo_id = NULL`**, o sea a nivel **estructura permanente** (§3.2). El sueldo del socio existe todos los meses, haya torneo o no; imputarlo a un torneo exigiría prorratearlo entre los que corren ese mes, que es exactamente el criterio arbitrario que la **decisión 5** prohíbe.

En `v_resultado_producto` aparece bajo **"Estructura permanente"**: la contribución de cada torneo queda intacta y lo que baja es el **resultado de la empresa**.

**El tipo de cuenta decide el P&L solo.** La vista filtra `where c.tipo in ('ingreso','egreso')`: `GAS_SOCIOS` entra; `SOCIOS_A_PAGAR`, por ser pasivo, no aparece. **No hay que tocar ninguna vista.**

**Cuenta propia, separada de `GAS_SUELDOS`** (empleados). Da lo mismo en el total del P&L, pero permite leer por separado el sueldo operativo del de los dueños — que es justo la distinción que se querría mirar.

#### No mezclar con el fondo de inversión (§3.15)

El fondo **ya modela plata de socios**, y en el sentido contrario: colocación y rescate contra `FONDO_INVERSION`, sin tocar resultado porque son movimientos de fondos.

**Un retiro de sueldo no es un rescate del fondo.** Uno cancela un pasivo devengado; el otro mueve respaldo. Cuentas y conceptos **separados**: si terminaran en la misma cuenta o en el mismo indicador, `v_dependencia_fondo` dejaría de significar lo que dice — "hace ocho meses que rescatamos más de lo que devolvemos" se contaminaría con retiros de sueldo, que son otra cosa.

#### Patrón nuevo · el sueldo acordado se versiona

```sql
create table sueldo_socio (
  id            uuid primary key default gen_random_uuid(),
  socio_id      uuid not null references tercero(id),
  monto         numeric(16,2) not null,
  vigente_desde date not null,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
```

**Es el primer parámetro versionado de verdad del sistema.** `config_contable` tiene `vigente_desde`, pero es **una sola fila sin historial** —guarda "el umbral actual y desde cuándo", no una línea de tiempo— y además no la lee nadie: no sirve de molde.

El sueldo vigente en un mes es **el de mayor `vigente_desde <= fin de ese mes`**. Cambiar el sueldo es **insertar una fila**, no editar la que hay. El historial es lo que permite recalcular un mes viejo con el sueldo que regía entonces — sin él, corregir un devengo de marzo usaría el sueldo de hoy.

#### Patrón nuevo · el devengo escribe solo

```sql
devengar_sueldos_socios(periodo_id) → int   -- cuántos devengó
```

**Rompe con el único precedente, y es deliberado.** `proponer_amortizaciones` **propone** y el operador confirma (decisión 23), porque una amortización es una **estimación**. El sueldo del socio es un **monto acordado y conocido**: no hay nada que revisar, y devengarlo directo es defendible.

- Por cada socio con sueldo vigente en el período, genera el asiento `GAS_SOCIOS` / `SOCIOS_A_PAGAR` por el monto vigente.
- **Idempotente**: `unique (socio_id, periodo_id)`, mismo patrón que `amortizacion`. Correrlo dos veces no duplica.
- **Se dispara por período, explícitamente.** No es un cron invisible: alguien lo corre al procesar el mes.
- **Aborta si el período está cerrado** — `periodo_de_fecha` ya lo garantiza.

#### El retiro

Asiento `SOCIOS_A_PAGAR` / caja. De qué caja sale importa:

| Caja | Requiere predio | |
|---|---|---|
| `CAJA_TRANSFERENCIA` · `CAJA_CENTRAL` | no | el camino natural |
| `CAJA_EFECTIVO` | **sí** | el asiento declara de qué predio salió |

No es una restricción del módulo sino de `crear_asiento`, que exige `predio_id` ante cualquier línea de `CAJA_EFECTIVO` — y con razón: si un socio se lleva efectivo de un predio y el asiento no lo dice, **el arqueo de ese día no cuadra** (§3.6).

#### Lo que se lee

| Vista | Para qué |
|---|---|
| `v_saldo_socio` | saldo actual por socio: a favor o en contra |
| `v_socio_detalle_mensual` | por socio y período: devengado, retirado, saldo acumulado |

Las dos cosas que hay que poder mirar: el número de hoy y cómo se llegó.

**Alcance:** backend. La pantalla —cargar sueldo, registrar retiro, ver saldos— es front y va después.

### 3.20 Sponsors · devengo lineal y dos calendarios

*Diseño asentado, pendiente de construir.*

Los sponsors aportan plata a cambio de visibilidad. Firman un **contrato anual** —cubre los dos torneos— por un monto total, con fechas de pago concretas. El aporte **se gana a lo largo del año**, porque dan visibilidad todo el tiempo, pero **se cobra en cuotas puntuales**.

#### El tercer patrón de reconocimiento

| Quién | Patrón | Por qué |
|---|---|---|
| **Equipos** | percibido puro (§1.b) | puede no pagar; hasta que no cobra no hay nada |
| **Socios** (§3.19) | devengo mensual de un fijo | compromiso cierto, mismo monto cada mes |
| **Sponsors** | **devengo lineal prorrateado** | el contrato se reconoce repartido en los meses que cubre |

Tres patrones distintos para tres naturalezas distintas. **La asimetría es deliberada** y ya está argumentada caso por caso — no es que el sistema no se haya decidido.

#### Los dos calendarios · el corazón del módulo

Un contrato tiene **dos líneas de tiempo que no coinciden**, y el modelo las lleva separadas:

| | Responde | Cadencia |
|---|---|---|
| **Reconocimiento** | *¿cuánto ganó el negocio este mes?* | **parejo**, mensual |
| **Cobro** | *¿cuándo entra la plata?* | las **cuotas**, en sus fechas |

Un contrato de 1.200.000 de ago-2026 a jul-2027 reconoce **100.000 por mes durante 12 meses**, pero puede cobrarse 400.000 en agosto, diciembre y abril:

```
Mes   Reconocido (P&L)   Entra (cashflow)
Ago      100.000            400.000
Sep      100.000                  0
…        100.000                  …
Dic      100.000            400.000
Abr      100.000            400.000
```

Colapsarlos en uno solo obligaría a mentir en una de las dos preguntas.

#### Tres momentos, tres asientos

```
Al FIRMAR — se registra la deuda y el ingreso todavía no ganado
  DEUDORES_SPONSORS   debe   total
    INGRESO_DIFERIDO        haber  total
  Sin ingreso en el P&L: se firmó, no se ganó nada aún.

Cada MES — devengo lineal, proceso automático
  INGRESO_DIFERIDO    debe   total / meses      libera el pasivo
    ING_SPONSORS            haber  total / meses      ingreso ganado → P&L

Cada COBRO — la cuota que paga el sponsor
  <caja>              debe   monto de la cuota
    DEUDORES_SPONSORS       haber  monto de la cuota  cancela lo que nos debían
```

Cada pregunta se responde con **su** cuenta, sin cálculos aparte (§1.c):

| Pregunta | Cuenta |
|---|---|
| ¿cuánto ganamos? | `ING_SPONSORS` |
| ¿cuándo entra la plata? | las cuotas de cobro |
| ¿cuánto falta ganar? | `INGRESO_DIFERIDO` |
| ¿cuánto falta cobrar? | `DEUDORES_SPONSORS` |

#### Las cuentas

| Cuenta | Tipo | Estado |
|---|---|---|
| `ING_SPONSORS` | `ingreso` | **ya existe** en el plan, sin uso |
| `DEUDORES_SPONSORS` | `activo` | nueva |
| `INGRESO_DIFERIDO` | `pasivo` | nueva |

**`DEUDORES_SPONSORS` propia y no la `DEUDORES` genérica.** `DEUDORES` "Deudores por servicios" se diseñó para equipos y la **decisión 1** la sacó de juego: bajo percibido puro, lo que un equipo debe **no está en el diario**. Reusarla resucitaría un concepto retirado a propósito y dejaría ambiguo "¿cuánto nos deben?", mezclando deuda de equipos —que no es saldo contable— con deuda de sponsors, que sí lo es.

`INGRESO_DIFERIDO` tampoco reusa `ANTICIPOS`: un anticipo es plata **ya recibida** por adelantado; el ingreso diferido es un contrato **firmado y no ganado**, que puede además estar sin cobrar. Son dos pasivos distintos.

#### Nivel empresa

**Todos los asientos van con `torneo_id = NULL`**, igual que los sueldos de socios. El contrato es anual y cubre los dos torneos; imputarlo a uno exigiría el prorrateo que la **decisión 5** prohíbe.

> **Consecuencia que conviene tener presente:** el ingreso de sponsors **no entra en la contribución de ningún torneo**. Aparece bajo "Estructura permanente" en `v_resultado_producto`, y `v_comparador_torneos` compara torneos **sin** ingresos de sponsor. Es correcto y deliberado, pero hay que saberlo al leer esas pantallas.

#### Estructura

```sql
create table contrato_sponsor (
  id             uuid primary key default gen_random_uuid(),
  sponsor_id     uuid not null references tercero(id),
  monto_total    numeric(16,2) not null,
  vigente_desde  date not null,
  vigente_hasta  date not null,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create table cuota_cobro_sponsor (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references contrato_sponsor(id) on delete cascade,
  monto        numeric(16,2) not null,
  fecha_cobro  date not null,
  cobrado_at   date,
  asiento_id   uuid references asiento(id)
);

create table devengo_sponsor (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references contrato_sponsor(id),
  periodo_id   uuid not null references periodo(id),
  monto        numeric(16,2) not null,
  asiento_id   uuid not null references asiento(id),
  unique (contrato_id, periodo_id)
);
```

`contrato_sponsor` **reusa el patrón de vigencia** estrenado en `sueldo_socio` (§3.19), y `devengo_sponsor` **reusa el anti-duplicado** de `devengo_socio`. El rango define en cuántos meses se prorratea.

**La suma de las cuotas de cobro tiene que igualar `monto_total`.** Si no, el cashflow proyecta una plata que nunca va a entrar, o de menos — y `DEUDORES_SPONSORS` nunca llegaría a cero. Se valida.

#### El último mes absorbe el redondeo

> **Detalle que parece menor y no lo es.** `total / meses` no siempre da exacto: 1.000.000 en 12 meses da 83.333,33, y doce veces eso son 999.999,96. Los 0,04 quedarían **para siempre** en `INGRESO_DIFERIDO`, que nunca cerraría en cero, y "pendiente de devengar" mostraría cuatro centavos eternos.
>
> **El último período devenga el remanente** —`monto_total` menos lo ya devengado— en vez de la cuota teórica. Así el pasivo cierra exacto por construcción, sin arrastre.

#### Procesos

| Función | Qué hace |
|---|---|
| `crear_contrato_sponsor(…)` | registra el contrato, asienta la firma y, opcionalmente, carga el cronograma de cobros |
| `devengar_sponsors(periodo_id)` | proceso mensual **idempotente que escribe solo**, igual que `devengar_sueldos_socios` |
| `registrar_cobro_sponsor(cuota_id, medio, …)` | asiento caja / `DEUDORES_SPONSORS`, y marca la cuota cobrada |

**El cobro de sponsor no reusa `registrar_cobro`.** Ésa imputa contra `cuota` de equipos y llama a `imputar_pago`; el sponsor cobra contra `DEUDORES_SPONSORS` y no tiene cuotas de equipo. Son circuitos distintos con el mismo nombre coloquial.

De qué caja sale rige lo mismo que en §3.19: transferencia y central sin predio, efectivo **con** predio, o el arqueo de ese día no cierra.

#### Lo que se lee

| Vista | Para qué |
|---|---|
| `v_estado_sponsor` | por sponsor: total, devengado, cobrado, pendiente de devengar, pendiente de cobrar |
| `v_cuotas_sponsor_futuras` | las cuotas con fecha futura — **la que el módulo de cashflow va a consumir** |

**Alcance:** backend. La pantalla es front y va después.

## 4. Navegación

Seis secciones; los módulos son pestañas internas. En el header: selector de **ámbito** (Empresa / Torneo) y de torneo.

| Sección | Pestañas |
|---|---|
| **Inicio** | Dashboard · Flujo de caja · **Proyección** |
| **Torneo** | Equipos y pagos · Padrón / Alta masiva · Inscripciones · Deudores · Reclamos · Calendario · Tarifario |
| **Operación** | Gastos por fecha · Gastos de estructura · Bar · **Calendario de pagos** |
| **Finanzas** | **Resultados** · Cuentas corrientes · Caja y banco · **Cheques** · Impuestos · Socios · Sponsors · Moneda extranjera |
| **Planificación** | Presupuesto · Presupuesto por fecha · **Escenarios** · **Punto de equilibrio** |
| **Configuración** | Torneo · Categorías de gastos · **Activos** · Predios · Cierre de período · **Registro de movimientos** · Auditoría · Usuarios |

**Cambios respecto del Draft 6:**

- El **libro diario** baja de Finanzas a Configuración, renombrado `Registro de movimientos`. Sigue siendo la fuente de todo; deja de ocupar lugar de privilegio.
- **P&L → Resultados**, reordenado por pregunta de negocio: ingresos por fuente → costos directos → **contribución del torneo** → estructura → resultado operativo → financieros.
- **Impuestos** pierde el toggle simple/detallado. Queda solo la vista simple.
- Pantallas nuevas: Proyección, Escenarios, Punto de equilibrio, Calendario de pagos, Cheques, Activos.

El preview del asiento en los modales de carga **se conserva colapsado** tras un "ver detalle contable". Sirve como prueba de rigor cuando alguien pregunta cómo se garantiza que los números cierren.

## 5. Alta de equipos y transición entre torneos

El problema: 168 equipos, dos torneos por año. Cargarlos de a uno es motivo suficiente para que el sistema no se adopte.

**Primera carga — importación.** Se sube `APERTURA 2026 · CAMPA.xlsx`, que ya tiene los equipos por categoría en hojas separadas. El sistema detecta las hojas, propone el mapeo y muestra la lista completa para revisar antes de confirmar. Nada se escribe hasta la aprobación.

**Torneos siguientes — diferencial.** Al crear un torneo nuevo se elige un torneo base y se copia:

| Se copia | No se copia |
|---|---|
| Padrón de equipos | **Deuda pendiente** |
| Estructura: categorías y series (§3.4) | |
| Tarifario | Pagos |
| Catálogo de categorías y conceptos | Asientos |

Se presenta solo la excepción: ascensos, descensos, bajas y altas nuevas. Los equipos que siguen igual no se muestran.

**La deuda no se arrastra.** Si un equipo quedó en mora en Apertura, esa mora sigue viva en su cuenta corriente pero imputada al torneo donde nació. Arrastrarla contaminaría el resultado del torneo nuevo. Bajo percibido puro, lo que se arrastra es cronograma impago, no un saldo contable: el cobro que llegue tarde se reconoce como ingreso del torneo al que pertenece la cuota, en la fecha en que entra la plata. **Consecuencia: el resultado de un torneo no se congela al cerrar.** Los cobros atrasados entran en su fecha real, así que un torneo terminado puede seguir sumando ingresos meses después. Es deliberado —es lo que significa reconocer por percibido— y las pantallas de resultado tienen que poder mostrarlo sin que parezca un error.

## 6. Orden de implementación

| # | Bloque | Contenido |
|---|---|---|
| 1 | **Núcleo contable** | `ejercicio`, `periodo`, `cuenta`, `asiento`, `asiento_linea` + triggers. Sin UI. |
| 2 | **Catálogos y padrón** | `predio`, `cat_gasto`, `concepto_gasto`, `tercero`, importador de Excel |
| 3 | **Cobranza** ★ | `equipo_torneo`, `cuota`, `pago`, reclamos, KPIs |
| 4 | **Transaccional** | Gastos por fecha, estructura, bar, caja |
| 5 | **Proyección** ★ | Flujo a 12 meses, escenarios, alertas de quiebre |
| 6 | **Resultados** | P&L por torneo y empresa, comparador |
| 7 | **Controles** | Arqueo, conciliación, cierre de período |
| 8 | **Compromisos** | Cheques, planes de pago, calendario de pagos, fondo |
| 9 | **Societario** | Socios, sponsors, USD, activos y amortización |
| 10 | **Roles y RLS** | Al final, con entidades estables |

★ = prioridad del dueño. Todo lo demás sostiene esos dos bloques.

**Fuera de alcance:** IVA discriminado, plan de cuentas como pantalla, balance patrimonial, amortización según tablas fiscales.

## 7. Notas de implementación

**RLS.** Todas las tablas con RLS activo. El rol `administracion` tiene `select` sobre todo y `update` solo sobre `periodo.estado`. `encargado_bar` filtra por `predio_id`. `operador` no accede a `socio`, `usd_operacion` ni `cfg_*`.

**Cálculos en base, no en el cliente.** Los totales del P&L, saldos de cuenta corriente y flujo proyectado son vistas SQL. El cliente no suma: consulta. Es la traducción técnica del principio (c) — si el front calcula, en algún momento dos pantallas van a discrepar.

**Numérico, no float.** `numeric(16,2)` en todo lo monetario. Nunca `float8`.

**Idempotencia del importador.** La importación debe poder correrse dos veces sin duplicar: clave natural `(torneo_id, nombre_equipo)`.

**Auditoría.** `asiento` ya es inmutable. Para el resto de las tablas, tabla `audit_log` genérica con trigger sobre `update`/`delete` en las sensibles (`equipo_torneo`, `cuota`, `gasto`, `arqueo`).

## 8. Decisiones cerradas

No reabrir sin motivo nuevo:

1. **Ingresos por percibido puro**: el asiento nace del cobro, la cuota no devenga. **Gastos siguen por devengo** (dos asientos). Desde el Draft 12 — ver "Decisiones reemplazadas" al pie de esta sección.
2. Fuente única: todo deriva del libro diario.
3. Sin rentabilidad por predio ni por categoría.
4. Efectivo / Transferencia como única terminología.
5. Efectivo y Transferencia son cajas independientes; USD es módulo aparte.
6. IVA en vista simple. Sin discriminación de débito/crédito.
7. Gasto con dos ejes: naturaleza + área.
8. Carga como arancel × cantidad.
9. Estado de cuota en lugar de aging 30/60/90.
10. Arqueo por **fecha + predio** — concretado como `dia_cancha_id` (25). *La segunda mitad de esta decisión, "con ajuste que afecta caja", fue refinada por la 29: el ajuste existe, pero no al arquear.*
11. Estructura permanente sin prorrateo entre torneos.
12. Diferencia de cambio separada del resultado operativo.
13. Categoría de gasto obligatoria; concepto opcional.
14. La deuda no se arrastra entre torneos.
15. Activos con umbral de materialidad; amortización mensual con revisión previa.
16. Amortización siempre a estructura permanente, nunca a un torneo.
17. Endoso de cheques: no se modela.
18. Fondo de inversión sin saldo en Campa: solo rescates y colocaciones.
19. Bar es área del torneo, no unidad de negocio separada.
20. Campa es gestión financiera; la contabilidad formal es del estudio externo.
21. El costo variable tiene **tres unidades**: `por_partido`, `por_dia_cancha`, `por_mes`. `por_jornada` sale del dominio.
22. La unidad es **default en el catálogo, override en la línea** de presupuesto.
23. `dia_cancha (fecha, predio)` es **tabla propia**, compartida entre presupuesto y arqueo. El torneo se deriva.
24. El bar no escala con partidos ni con días de cancha: escala con consumo. Tratamiento propio, pendiente.
25. El arqueo cuelga de **`dia_cancha_id`**, con `unique`. Concreta la 10.
26. **Sin estado contable "en tránsito"**: el arqueo pendiente de entrega *es* el estado, y la plata la tiene su responsable.
27. **`saldo_sistema` se congela** al arquear. El arqueo es acta histórica.
28. **Un solo movimiento contable, al entregar** (Escenario A). El arqueo no mueve plata.
29. **La diferencia se registra; la resolución es diferida** y puede no ocurrir.
30. Se crea la **caja central**, destino del efectivo de los predios.
31. El **formato de instancia** es tabla configurable, no un CHECK con literales.
32. **`crear_playoff`** es la puerta del playoff, con identidad `(serie_id, instancia)`.
33. La **cuota de playoff se genera por instancia jugada**, en un paso posterior a la ficha, desde `equipo_playoff`.
34. Los **partidos de un playoff son dato**, no derivados. La decisión 45 queda acotada a la liga.
35. El **sueldo del socio se devenga** (Forma B) — excepción deliberada al percibido puro.
36. **`GAS_SOCIOS` es egreso propio**: costo del negocio, separado de los sueldos de empleados. Imputado a **estructura permanente** (`torneo_id` NULL), no a un torneo — decisión 5.
37. El **sueldo acordado se versiona con historial**; cambiarlo es insertar, no editar.
38. El **devengo mensual escribe solo**, idempotente por `(socio, período)`.
39. **Retiro de sueldo ≠ rescate del fondo de inversión.** Cuentas y conceptos separados.
40. **Sponsors por devengo lineal** — tercer patrón, distinto de equipos y socios.
41. **Dos calendarios separados**: reconocimiento (P&L, parejo) y cobro (cashflow, cuotas).
42. **`INGRESO_DIFERIDO` es un pasivo que se libera** mes a mes; el último período absorbe el redondeo.
43. **Sponsor a nivel empresa** (`torneo_id` NULL); `DEUDORES_SPONSORS` propia, no la `DEUDORES` genérica.
44. Las **cuotas de cobro de sponsor alimentan el cashflow** vía `v_cuotas_sponsor_futuras`.
45. **USD por promedio ponderado**, derivado y no guardado.
46. **Diferencia de cambio solo realizada**, al vender. `revaluacion` sale del dominio.
47. **El diario es monomoneda**: la cantidad de dólares vive en `usd_operacion`, no en `asiento_linea`.

### Decisiones reemplazadas

Se registran acá con su razonamiento. Una decisión derogada sin explicación es una trampa: el que venga después vuelve a proponerla, o peor, la reimplementa sin saber que ya se descartó.

**Sobre el patrón.** El reconocimiento de ingresos se reformuló dos veces en dos drafts: Opción A → devengo progresivo (Draft 11) → percibido puro (Draft 12). Vale registrar por qué, porque el recorrido explica el destino: las dos primeras versiones discutían **cuándo** devengar, y el problema real era **si** devengar. Ninguna cantidad de precisión en la fecha arreglaba que la fecha misma no significara nada. La tercera es la más simple de las tres y la única que no deja preguntas abiertas.

---

**Devengo progresivo por vencimiento (Camino 2)** · vigente solo en el Draft 11 · reemplazado en el Draft 12.

*Qué decía.* Las cuotas se creaban todas al armar la ficha pero no facturaban nada; cada una se devengaba al vencer (`Deudores` al debe, `Ingresos` al haber, por el monto de esa cuota). La deuda del equipo era su mora. Quedaba abierto qué proceso disparaba cada asiento.

*Por qué se reemplazó.* Porque el devengo no aportaba verdad y sí complejidad:

1. **La fecha de vencimiento es arbitraria.** Se fija por comodidad del cliente al armar el plan de pago, no por un hecho económico: la misma prestación puede vencer en marzo o en mayo según lo que se le acomode al equipo. Devengar contra una fecha elegida por conveniencia comercial no informa mejor el resultado — le da apariencia de precisión a una convención.
2. **El torneo se evalúa por semestre, no por mes.** El corte relevante es el torneo completo. Repartir el ingreso mes a mes dentro del semestre resuelve un problema que nadie tiene, y para el corte que sí importa —el torneo cerrado— devengado y percibido convergen salvo por la mora, que ya se mide aparte.
3. **El costo era concreto.** Obligaba a definir qué disparaba cada asiento, y las tres opciones tenían defecto: la más barata de programar rompía el principio (c). Percibido puro elimina la pregunta en lugar de responderla — el disparador es el pago.

*Qué NO cambió.* Las cuotas se siguen creando todas al armar la ficha y siguen siendo la base del cashflow y de la mora. Lo único que se eliminó es el asiento que emitían al vencer.

*Qué se ganó.* Una vía contable en lugar de dos, y ninguna decisión pendiente. `DEUDORES` deja de intervenir en el circuito de equipos.

---

**Opción A — deuda total al armar la ficha** · vigente Drafts 1–10 · reemplazada en el Draft 11.

*Qué decía.* Armar la ficha de un equipo facturaba el torneo completo de una vez: `Deudores` al debe e `Ingresos` al haber por el total, contra `equipo_torneo.asiento_id`. Desde ese momento el equipo "debía" todo el torneo, y cada pago solo cancelaba `Deudores`.

*Por qué se reemplazó.* Tres razones, en orden de peso:

1. **En la cobranza solo interesa la mora.** Lo que se reclama es lo vencido e impago. Un equipo con diez cuotas y una sola vencida no debe diez cuotas: debe una. Mostrar el total facturado como deuda infla la cartera y vuelve inservible la pantalla de deudores, que es prioridad del dueño.
2. **El cashflow se deriva de la estructura del torneo, no de sumar fichas.** El calendario y el tarifario ya dicen cuánto entra y cuándo (§3.5, §3.18). Devengar todo al inicio no aportaba información de caja —la fecha de cobro sale del vencimiento igual— y a cambio distorsionaba el P&L, cargando el ingreso de un torneo entero al mes en que se armaron las fichas.
3. **Alinea la letra con lo que ya decía el tarifario.** La regla `por_partido` (§3.18) se define como "arancel unitario **devengado por partido jugado**", pero la Opción A lo cobraba todo por adelantado. La contradicción estaba escrita desde antes; el devengo progresivo la resuelve en lugar de sostenerla.

*Qué NO cambió.* Las cuotas se siguen creando todas al armar la ficha (Camino 2): el plan de pago queda cerrado desde el inicio y con eso alcanza para proyectar caja. Lo que cambió es cuándo se reconoce el ingreso, no cuándo se conoce el compromiso.

*Qué quedó abierto.* Qué dispara el asiento de cada cuota al vencer — ver §3.4.

## 9. Abierto

- Nivel de automatización de reclamos: `manual` / `mixto` / `automatico` — a definir con la dirección.
- Proveedor de mail (Resend / Postmark) y dominio de envío.
- Formato fiscal del recibo: si necesita numeración formal o alcanza comprobante interno.
- Comparaciones C3 (torneo vs torneo), C4 (diferencias de caja por responsable) y C5 (inscripción como cobertura de costo fijo): siguen de interés, no priorizadas.
