# Decisiones cerradas

Cada una se discutió y se cerró. **No reabrir sin motivo nuevo** — si aparece uno,
agregar acá la fecha y la razón del cambio.

---

## Contables

**1 · Ingresos por percibido puro** *(actualizada en el Draft 12)*
El ingreso se reconoce al cobrar: Caja al debe, la cuenta de Ingresos que
corresponda al haber. Las cuotas **no generan ningún asiento** — son términos de
pago: cronograma, mora y base del cashflow. La cuota hereda el concepto
(inscripción / partidos) de la línea del plan, y de ahí sale a qué cuenta de
ingreso se imputa el cobro.
**La deuda de un equipo es su mora:** cuotas vencidas e impagas. Es cifra
operativa para reclamar, no un saldo contable. `DEUDORES` no interviene.
**Asimetría — leer con cuidado:** esto vale para ingresos. **Los gastos siguen
por devengo**, con dos asientos (ver decisión 12). No unificar los dos lados.
*Por qué:* la fecha de vencimiento de las cuotas es arbitraria —se fija por
comodidad del cliente, no por un hecho económico— y el torneo se evalúa por
semestre, no por mes. Devengar no aportaba verdad y sí complejidad.
*Reemplaza:* el devengo progresivo del Draft 11, que a su vez había reemplazado
a la Opción A (deuda total al armar la ficha). Las dos vueltas, con su
razonamiento, en `arquitectura.md` §8 → Decisiones reemplazadas.

**2 · Fuente única: el libro diario**
Todo número deriva de `asiento_linea`. Ninguna pantalla calcula el suyo.
*Por qué:* es lo único que impide reproducir el problema del Excel, donde cada
planilla llegaba a un total distinto.

**3 · IVA en vista simple**
Se registra como egreso cuando se paga. Sin discriminación débito/crédito.
*Por qué:* la liquidación la hace el estudio contable.

**4 · Campa es gestión financiera, no contabilidad**
El balance, la liquidación de impuestos y las amortizaciones fiscales son del
estudio externo. La partida doble está para garantizar consistencia.

---

## Estructura del negocio

**5 · Estructura permanente sin prorrateo**
`asiento.torneo_id = NULL` es estructura. No se reparte entre torneos.
*Por qué:* cualquier criterio de reparto sería arbitrario y produciría un número
que nadie puede defender.

**6 · Sin rentabilidad por predio ni categoría**
Los predios son logística, no centros de resultado.
*Por qué:* mismo razonamiento que el punto anterior.

**7 · Bar es área del torneo, no unidad de negocio**
Se mide su margen por fecha y predio, pero no se le imputa estructura.
*Por qué:* con dos predios y un encargado, el bar es un servicio dentro del
torneo. Medirlo aparte exigiría criterios de prorrateo e inventario.

**8 · Diferencia de cambio separada del resultado operativo**
Va en una línea propia, debajo.
*Por qué:* una suba del dólar no debe leerse como que el torneo funcionó mejor.

---

## Gastos

**9 · Dos ejes: naturaleza + área**
`naturaleza` define cómo se carga y presupuesta; `area` define a quién se imputa.
*Por qué:* el modelo anterior mezclaba temporalidad con área, y no podía
representar el gasto eventual (mantenimiento, compras de predio).

**10 · Categoría obligatoria, concepto opcional**
El concepto puede salir del catálogo o escribirse libre.
*Por qué:* la categoría es lo que permite comparar presupuesto contra real sin
mapeo manual. El concepto es descriptivo.

**11 · Carga como arancel × cantidad**
*Por qué:* es como ya lo hacen en el Excel.

**12 · Un gasto son dos asientos**
Devengo al cargar, pago al pagar.
*Por qué:* permite que el P&L y la caja cuenten cosas distintas sin contradecirse.

---

## Cobranza

**13 · Estado de cuota, no aging 30/60/90**
`pagada` · `parcial` · `parcial_vencida` · `vencida` · `por_vencer` · `al_dia`
*Por qué:* el vencimiento lo define la modalidad de pago del equipo, así que la
antigüedad genérica no significa nada acá.

**14 · La deuda es del equipo, no del torneo**
Un equipo puede arrastrar deuda de torneos anteriores. Se ve consolidada.
*Por qué:* es como lo mira el cliente.

**15 · La imputación la elige el operador**
El sistema propone (`sugerir_imputacion`) pero nunca decide solo cuando hay
deuda en más de un torneo.
*Por qué:* imputar automáticamente a lo más antiguo puede dejar a un equipo
impago en el torneo en curso — pagó y no puede jugar.

**16 · La deuda no se arrastra entre torneos**
Queda viva en la cuenta corriente pero imputada al torneo donde nació.
*Por qué:* arrastrarla contaminaría el resultado del torneo nuevo.

**17 · El sobrante queda como anticipo**
No expira ni se pierde al cambiar de torneo.
*Por qué:* sin esto, la caja tendría plata que el libro no explica.

---

## Operación

**18 · Efectivo y Transferencia**
Única terminología, en UI y en código. Nunca "declarable/no declarable".

**19 · Efectivo por predio; transferencia y USD globales**
*Por qué:* el arqueo es por fecha + predio (decisión 46), y hay dos predios.

**20 · Arqueo con ajuste que afecta la caja** *(⚠ refinada por la decisión 61)*
La diferencia genera asiento, no una nota al margen.
*Refinamiento:* sigue siendo cierto que la resolución genera asiento y mueve
caja. Lo que cambió es **cuándo**: no al arquear. La diferencia se registra en el
momento del conteo y la resolución es un paso posterior, que puede no ocurrir.

**21 · Endoso de cheques: no se modela**
Se registra el cheque recibido como cobrado y el pago como realizado.
*Por qué:* modelar cadenas de endoso agrega estados y trazabilidad para un caso
poco frecuente. *Costo conocido:* imprecisión temporal en la proyección.

**22 · Fondo de inversión sin saldo en Campa**
Solo se registran rescates y colocaciones.
*Por qué:* un saldo que hay que mantener a mano se desactualiza, y un saldo
desactualizado es peor que no tenerlo.

**23 · Activos con umbral de materialidad**
Por debajo del umbral, gasto directo. Amortización mensual con revisión previa.
*Por qué:* si hay que dar de alta cada compra menor, en tres meses nadie lo
mantiene y el módulo queda muerto.

**24 · Amortización siempre a estructura permanente**
Nunca a un torneo.
*Por qué:* el bien sirve a todos los torneos que dura.

---

## De las migraciones

**25 · Un período cerrado no se reabre**
Las correcciones van como ajuste en el período abierto.
*Por qué:* si se puede reabrir, el cierre no sirve de nada.

**26 · `pagado_at` es derivado, no se escribe a mano**
Un trigger lo completa cuando el saldo de la cuota llega a cero.
*Por qué:* es el mismo principio de fuente única, aplicado dentro de la base.

**27 · `total_plan` sincronizado por trigger** *(se llamaba `total_facturado`)*
Se mantiene la columna pero un trigger la recalcula ante cualquier cambio en cuota.
*Por qué:* era un número duplicado sin nada que lo mantuviera al día.

**28 · `pago.cuota_id` deprecada**
No se escribe. Se elimina cuando el bloque 3 (Cobranza) esté terminado.
*Por qué:* con `pago_imputacion` hay dos caminos para lo mismo.

---

## Diseño del cobro

**Todas construidas.** `crear_equipo_torneo` (`20260731070827`) y
`registrar_cobro` (`20260731100343`, sin fallback de usuario desde
`20260802170000`). Detalle y razonamiento en `arquitectura.md` §3.4 → El
circuito de cobro.

**29 · `cuota.plan_tarifa_linea_id`, FK NOT NULL**
Toda cuota de equipo hereda de su línea del tarifario el concepto
(inscripción / partidos), el precio y la regla de vencimiento. El concepto es
lo que resuelve a qué cuenta de ingreso va el cobro.
*Por qué NOT NULL:* no existen cuotas de equipo sin tarifario. Las de
moratoria viven en `compromiso`, nunca en `cuota` (ver decisión 33).
*Por qué FK y no copiar el enum:* fuente única, y da acceso al precio y a la
regla además del concepto.

**30 · `registrar_cobro()` atómica**
Una función registra el pago, imputa y asienta en una transacción. Reutiliza
`imputar_pago()` sin modificarla.
*Por qué:* cablear el asiento dentro de `imputar_pago()` —que recibe un pago
ya insertado— dejaría registro y asiento en dos pasos separables. Si el
segundo falla, queda plata registrada sin movimiento en el diario.

**31 · El asiento se deriva de la imputación**
Cada imputación aporta una línea al haber, ruteada por el concepto de su
cuota (`inscripcion` → `ING_INSCRIPCIONES`, `partidos` → `ING_PARTIDOS`). El
debe es una línea única por el total, según el medio: efectivo →
`CAJA_EFECTIVO`, transferencia → `CAJA_TRANSFERENCIA`, cheque →
`VALORES_A_DEPOSITAR`.
*Por qué:* el pago en bruto no sabe de qué concepto es; la imputación sí. Un
pago repartido entre conceptos distintos da un asiento con varias líneas al
haber, no varios asientos.

**32 · El excedente se imputa a la cuota siguiente**
Si un equipo paga de más, el excedente reduce la próxima cuota: paga 520 sobre
una cuota de 500 y la siguiente baja 20. No es un anticipo — es imputación
normal, que `imputar_pago()` ya resuelve.
*Por qué:* la plata siempre tiene concepto, el de la cuota a la que se aplica,
y de ahí sale su cuenta de ingreso (decisión 31). Así el anticipo casi no
ocurre: el excedente se absorbe en el cronograma.
*Borde:* un sobrante sin concepto solo aparece si un pago excede el total de
**todas** las cuotas del equipo. Ahí va a `ING_INSCRIPCIONES` por convención
explícita, no como mecanismo principal; si empieza a aparecer seguido, la
regla está mal. En ese caso el ingreso se reconoce al entrar y aplicar el
anticipo después no genera asiento.
*Dependencia:* exige que `imputar_pago()` pueda imputar a cuotas no vencidas
—la cuota siguiente normalmente no venció—. Hoy no filtra por vencimiento; a
confirmar y ajustar al construir `registrar_cobro()`.

**33 · Orden de construcción: estructura → ficha → cobro**
Primero los catálogos `categoria`/`serie`, después B0 (`crear_equipo_torneo`),
después `registrar_cobro()`.
*Por qué:* cada bloque necesita al anterior. Sin serie la ficha no tiene a qué
apuntar ni de dónde derivar el género, y sin género no se encuentra el
tarifario. Y la FK de la decisión 29 tiene que existir antes de la primera
cuota: agregarla después obligaría a reconstruir a mano el origen de cada una.

**34 · Estructura del torneo: categoría → serie, por torneo**
Catálogos versionados por torneo, clonados del anterior al crear uno nuevo.
Jerarquía: `torneo → categoria → serie → equipo_torneo`. La serie cuelga de la
categoría, no del torneo: la "Serie A de Libre" y la "Serie A de +30" son
filas distintas.
*Por qué:* las series crecen con el tiempo, así que son datos y no un enum. Y
colgarlas del torneo perdería a qué categoría pertenecen.

**35 · El género es atributo de la categoría**
No del equipo ni del tercero. Libre / +30 / +40 son masculinas; Femenino y
Flex, femeninas. La ficha lo deriva subiendo: serie → categoría → género.
*Por qué:* el mismo club presenta equipos en Libre y en Femenino. En `tercero`
sería directamente incorrecto. Además es lo que permite encontrar el tarifario,
que se busca por `(torneo, genero, concepto, opcion)`.

**36 · La ficha apunta a la serie; `categoria` texto libre se elimina**
`equipo_torneo.serie_id` reemplaza al `categoria text` con valores tipo
`'+40 A'`. Categoría y género no se duplican en la ficha.
*Por qué:* duplicarlos permitiría que contradigan a la serie. Sale también
`modalidad`, cuyo CHECK quedó de un modelo anterior al tarifario y no alcanza
para expresar las dos elecciones (una opción de inscripción y otra de
partidos) que el plan exige.

**37 · Ascensos y descensos no se modelan como evento**
Un equipo que sube de B a A tiene otra ficha, en otro torneo, apuntando a otra
serie.
*Por qué:* el historial queda por acumulación de fichas y se reconstruye
leyéndolas por torneo. Una tabla de movimientos sería un segundo origen para
un dato que ya está.

**38 · La generación de cuotas se rige por la regla de la línea, no por el concepto**
`fecha_fija` → 1 cuota con fecha propia. `por_partido` de liga → una cuota por
fecha, atada a la jornada. `bloque_adelantado` → 1 cuota con el total del
bloque. `por_partido` + `es_playoff` → ninguna al armar la ficha.
*Por qué:* una línea `fecha_fija` de partidos (Opción 2, cuotas) se comporta
igual que una de inscripción: fecha propia, no atada a jornada. Regir la
generación por el concepto ataría al calendario cuotas que tienen fecha fija.
El concepto se usa después y para otra cosa: rutear el asiento del cobro
(decisión 31). Son dos responsabilidades separadas.

**39 · El vencimiento de las cuotas de liga sigue a la jornada**
Las cuotas `por_partido` vencen con su fecha del calendario y se mueven si la
jornada se reprograma. `cuota` gana una FK nullable a `jornada`.
*Por qué:* es el principio (i) alcanzando a la cobranza. Mover una jornada
recalcula el cashflow proyectado y los vencimientos de equipo desde la misma
fuente, sin que puedan discrepar.

**40 · El precio se congela al armar la ficha**
`equipo_torneo.medio_previsto` define si la cuota toma `precio_efectivo` o
`precio_transferencia`. Pagar después por otro medio no reabre el importe.
*Por qué:* la cuota tiene un solo `monto` y la línea tiene dos precios. Alguien
tiene que elegir, y el momento natural es el alta de la ficha.

**41 · El monto se copia del tarifario; la cuota es autónoma**
Al generar la cuota se copia el precio según el `medio_previsto` de la ficha.
Desde ahí `cuota.monto` es valor propio, no una lectura del tarifario. **El
tarifario es el molde; la cuota, la pieza ya fundida.**
*Consecuencias:* editar el tarifario **no** recalcula cuotas ya generadas, solo
afecta a las fichas que se armen después; y una cuota puntual se puede ajustar
a mano —caso raro— editando su `monto`, sin marca especial ni tabla de
excepciones.
*Por qué:* un equipo no puede enterarse a mitad de torneo de que le cambiaron
el precio. Y como `total_plan` se recalcula por trigger desde las cuotas
(decisión 27), sigue siendo correcto después de un ajuste manual sin tener que
consultar el tarifario.
**⚠ Refinada por la decisión 50:** la autonomía es *parcial*. El monto se copia
siempre, pero el vencimiento solo en las cuotas fijas — la de liga lo deriva de
`jornada.fecha`. No leer esta decisión sin la 50.

---

## Calendario por serie

**Todas construidas**, en las seis piezas del rediseño (`20260801121708` a
`20260802103856`). La base tiene las 284 jornadas del Clausura colgando de
serie, y 58 días de cancha. Detalle y razonamiento en `arquitectura.md` §3.5 y
§3.3.

**42 · La jornada cuelga de la serie, no del género**
Identidad natural `(serie_id, numero)`. El género y el torneo se derivan
subiendo `serie → categoria`, igual que en la ficha (decisión 36). Sale la
columna `genero`, entra `serie_id NOT NULL`.
*Por qué:* el calendario real es por serie. Distintas series del mismo género
juegan la misma fecha en días distintos —Libre A su fecha 3 el 15/8, +35 B el
29/8—: van casi siempre sincronizadas y se desfasan en fechas puntuales. La
identidad `(torneo, genero, numero)` colapsaba fechas que en la realidad
difieren, y ataba la cuota de liga (decisión 39) a una fecha aproximada en vez
de a la que ese equipo juega.
*Alcance:* Clausura 2026 pasa de 28 jornadas a 284 (12 series masculinas × 15 +
8 femeninas × 13). La PK sigue siendo `id`, así que las siete FKs que apuntan a
`jornada.id` no se tocan: cambia la identidad natural, no la primaria.

**43 · Fecha de calendario y jornada son cosas distintas**
Una **fecha** es un día concreto en el que juegan muchas series; una **jornada**
es la fecha N de una sola serie. Una fecha agrupa muchas jornadas: 29 fechas y
284 jornadas en el Clausura.
*Por qué:* de la distinción emerge `(fecha, predio)` —el día de operación de un
predio— como entidad natural, y de ella cuelgan el arqueo (decisión 45) y los
costos por día de cancha (decisión 44).

**44 · Tres unidades de costo variable**
Los gastos `por_fecha` dejan de escalar todos igual:
**por partido** (árbitros, veedores, ballboys) × cantidad de partidos;
**por día de cancha** (fotografía) = 1 por `(fecha, predio)`;
**fijo mensual**, que no escala con partidos ni fechas.
*Por qué:* un sábado con 6 series jugando en un predio son 48 partidos —48
arbitrajes— pero un solo servicio de fotografía. Con jornada por género la
cuenta plana "× jornadas" alcanzaba; con jornada por serie deja de alcanzar.
*Pendiente asociado:* `v_presupuesto_total` cuenta `count(*) from jornada` sin
distinguir unidad. Hoy da 28 y con el rediseño daría 284: multiplicaría por diez
un presupuesto `por_jornada` sin fallar ni avisar. Las tablas de presupuesto
están vacías, así que se arregla antes de que exista el primer número.

**45 · La cantidad de partidos se deriva, no se carga** *(⚠ acotada a la liga por la decisión 67)*
`partidos por jornada = equipos de la serie ÷ 2`. 16 equipos dan 8 partidos, 14
dan 7. Sin excepciones conocidas.
*Alcance:* vale mientras juegan todos contra todos. **En playoff no**: la
cantidad depende del formato del cuadro, no del tamaño de la serie, y es dato.
*Por qué:* es dato derivable de la estructura, y cargarlo a mano sería un
segundo origen para algo que ya está. Es la base de los costos por partido
(decisión 44).

**46 · El arqueo cuelga de `(fecha, predio)`**
Deja de colgar de `jornada_id`. `arqueo` pasa a tener `fecha date not null` +
`predio_id`.
*Por qué:* el arqueo controla la caja física de un predio en un día. Con
jornadas por serie, atarlo a "la jornada de una serie" pierde sentido: ese día
en ese predio jugaron varias series y la plata de la caja no distingue de cuál
vino.

**47 · Los playoffs también son por serie**
La final de Libre A y la de Libre B son jornadas distintas. Misma tabla, flag
`es_playoff` e `instancia` en lugar de `numero`.
*Por qué:* coherencia con la liga. Modelarlos por género mientras la liga va por
serie dejaría dos criterios conviviendo en la misma tabla.
*Nota:* no están en el calendario validado —no tienen fecha aún— y se cargan
cuando se definan.


**48 · El schema es agnóstico del torneo**
Ni el schema, ni las funciones, ni las vistas contienen valores específicos de
un torneo: fechas, cantidad de fechas, nombres de series o categorías, cantidad
de equipos o de partidos. Todo lo específico entra como **datos** vía
`supabase/seeds/` y las funciones lo **leen** de la base.
*El test:* un torneo nuevo se carga con sus seeds y funciona **sin tocar
código**.
*Por qué:* un valor del Clausura horneado en una función es un bug latente —no
falla hoy, falla con el torneo siguiente— y en el peor caso no falla nunca:
devuelve un número mal sin avisar.
*Estado:* verificado por auditoría sobre las 26 funciones, 14 vistas, los check
constraints y los defaults de columna. Único hallazgo real: los defaults
`15`/`13` de `generar_grilla_liga`, que la reescritura de la grilla elimina.
Hallazgo menor: `torneo.cant_fechas` con default `10`, columna muerta que nadie
lee, eliminada en la migración de jornada por serie.

**49 · Las jornadas se gestionan con funciones validadas**
`crear_jornada(serie_id, numero, fecha)`, `mover_jornada(jornada_id, fecha)` y
`suspender_jornada(jornada_id)`. **Una lógica, dos puertas:** las usa el seed
que carga el calendario y las usará el módulo de calendario de la app.
*Por qué:* si el seed inserta directo y la app valida aparte, terminan
divergiendo — el seed carga algo que la pantalla habría rechazado, o al revés.
Con una sola implementación validada eso no puede pasar.
*Agnósticas del torneo* (regla 12): reciben serie, número y fecha. No saben qué
es "Clausura" ni cuántas fechas tiene una serie.
*Reprogramar* es mover una suspendida: vuelve a `programada` con la fecha nueva.

**50 · La autonomía de la cuota es parcial** *(refina la 41, no la contradice)*
El **monto** se copia siempre del tarifario. El **vencimiento** se copia solo en
las cuotas **fijas** (inscripción, bloque adelantado); la cuota **de liga** lo
**deriva de `jornada.fecha`** en vivo, guardando `jornada_id`.
*Por qué:* las dos tienen naturaleza distinta. La inscripción vence un día
administrativo acordado, que no depende de que se juegue nada. La de liga vence
"cuando se juega esa fecha", y esa fecha puede moverse o suspenderse. Copiarle
el vencimiento la dejaría desactualizada apenas se reprograme una jornada.
*Consecuencia:* mover la jornada mueve el vencimiento de sus cuotas sin tocar
ninguna cuota. Es la decisión 39 funcionando de verdad, no solo declarada.
*Resuelto al construir:* `cuota.vence_at` quedó **`NOT NULL`, como caché
sincronizada** por `trg_sync_cuota_vence_at`. Dejarlo nulo habría roto los ocho
consumidores que lo leen (cinco vistas más `generar_cuotas_plan`,
`sugerir_imputacion` y `crear_equipo_torneo`). El trigger va **sobre `jornada`**,
no dentro de `mover_jornada`, para que un `update` directo también propague.

**51 · La cuota de una jornada suspendida sale del circuito de cobro**
Mientras la jornada esté `suspendida`, su cuota de liga **no es deuda vencida**.
Vuelve al circuito al reprogramar, con el vencimiento nuevo.
*Por qué:* esa fecha no se jugó. Un equipo cuya jornada se suspendió no es
moroso de esa cuota, y mostrarlo como tal hace que la pantalla de deudores
pierda credibilidad — aparece debiendo algo que nadie le va a cobrar.
*Alcance:* toca todas las vistas que calculan deuda (`v_deuda_detalle`,
`v_estado_cuota`, `v_cuenta_corriente_equipo`, `v_deuda_equipo`,
`v_cobranza_kpi`). Es el punto de la pieza 2 que más cuidado necesita: si una
vista se olvida, el error es silencioso.
---

## Unidades de costo

**52 · El costo variable tiene tres unidades; `por_jornada` sale del dominio**
`por_partido` · `por_dia_cancha` · `por_mes`. `anual` y `unico` no cambian.
*Por qué:* "por jornada" era exacto mientras la jornada era la fecha N de un
**género**. Con jornadas por **serie** pasó a ser ambiguo —no dice si se refiere
al partido o al día de operación— y las dos lecturas dan números muy distintos:
un sábado con 6 series en un predio son 48 arbitrajes pero **un solo** servicio
de fotografía.
*No se conserva por compatibilidad.* Dejar `por_jornada` disponible garantiza
que alguien la elija y multiplique por 284. Sale del `check`.
*Costo de la decisión:* ninguno hoy — `presupuesto_linea` tiene 0 filas.

**53 · La unidad es default en el catálogo y override en la línea**
El default vive en `cat_gasto` / `concepto_gasto`. `presupuesto_linea.unidad`
pasa a ser anulable: `null` = **heredar**, con valor = **este caso es distinto**.
*Por qué:* un arbitraje es por partido siempre. No es una decisión que deba
tomarse de nuevo en cada línea de presupuesto. Sin default, cada línea vuelve a
resolver algo ya resuelto y basta **una mal cargada** para que el total se corra
sin que nada falle.
*Por qué igual hay override:* el caso raro existe —un servicio que este torneo
se contrata por día y el que viene por partido—. Forzarlo a crear un concepto
nuevo ensuciaría el catálogo con duplicados que solo difieren en la unidad.
*Por qué también en `concepto_gasto` y no solo en `cat_gasto`:* **Viáticos**
espeja a otras categorías (Ballboys, Veedores, Guardias, Estacionamiento,
Limpieza), así que su unidad no es uniforme a nivel categoría — el viático de un
ballboy escala como el ballboy.

**54 · `dia_cancha (fecha, predio)` es tabla propia, compartida**
Identidad natural `unique (fecha, predio_id)`. El **torneo se deriva** de las
jornadas de esa fecha, no se guarda — mismo criterio que `jornada` (decisión 36).
*Por qué tabla y no `select distinct`:* la entidad no existía en ninguna parte.
`jornada` **no tiene predio** —el modelo dice qué serie juega su fecha N, no
dónde— y las únicas tablas con `fecha` *y* `predio_id` son de movimiento
(`asiento`, `gasto`, `pago`). Derivarla de ahí sería **circular**: para
presupuestar los días de cancha habría que mirar los gastos ya cargados, que es
justo lo que todavía no pasó. El día de operación es un hecho del calendario,
anterior al primer gasto.
*Por qué compartida:* el presupuesto la **cuenta** (multiplicador de las líneas
`por_dia_cancha`) y el arqueo **cuelga** de ella (decisión 10, pieza 4). Dos
definiciones paralelas se desincronizarían — el presupuesto contando 58 días y
el arqueo esperando 54.
*Se gestiona con funciones*, igual que la jornada (decisión 49): una lógica, dos
puertas. Clausura 2026 da 29 fechas × 2 predios = **58** como caso base, cargado
como datos, no como constante del schema (regla 12).

**55 · Clasificación inicial de las 16 categorías `por_fecha`**
3 `por_partido` · 8 `por_dia_cancha` · 5 aparte (4 de bar + 1 de administración).

| Unidad | Categorías |
|---|---|
| `por_partido` | Árbitros Femenino · Árbitros Masculino · Operativos |
| `por_dia_cancha` | Coordinación · Media · Medicinal · Tribunal · Viáticos · Estacionamiento · Guardias · Limpieza *(predio)* |
| aparte | Extras · Limpieza *(bar)* · Productos · Proveedores · Administración |

*Es punto de partida cargado como datos*, no verdad de schema: se corrige con un
`update`, sin migración.
*Cuidado al cargarla:* hay **dos categorías llamadas "Limpieza"**, una de área
`predio` y otra de área `bar`, filas distintas bajo `unique (area, nombre)`, y se
clasifican distinto. Hay que discriminar por área o se pisa una con la otra.
*Por qué el bar queda aparte:* no escala con partidos ni con días de cancha —
escala con **consumo**. Un sábado de mucha venta cuesta más que uno de poca, y la
cantidad de partidos no lo predice. Meterlo en cualquiera de las dos unidades del
torneo daría un número con forma de presupuesto y sin relación con la realidad.
Administración queda aparte por otra razón: es estructura permanente, y la
estructura permanente no se prorratea entre torneos (decisión 11).
*Pendiente:* el tratamiento propio del bar.

**56 · Un día de cancha puede existir sin jornada; presupuesto y arqueo lo miran
con lentes distintas**
`crear_dia_cancha` **no exige** que haya jornada esa fecha. El predio opera con
el bar abierto o con un evento y no se juega, y esos días tienen caja.
*Por qué:* `dia_cancha` ancla el arqueo (pieza 4). Exigir jornada dejaría la caja
de esos días sin dónde colgar.
*Las dos lentes:* el **arqueo** lee la **tabla** —si hubo caja hay que contarla,
haya habido fútbol o no—; el **presupuesto** lee `v_dia_cancha_torneo`, que hace
*inner join* contra `jornada`. Un día de solo bar no lleva fotógrafo ni
árbitros: contarlo inflaría el presupuesto con un día que el torneo no jugó.
*El principio:* la distinción entre "día de operación" y "día de torneo" es una
**lente de lectura, no una restricción de escritura**. Ponerla en la escritura
obligaría a elegir una de las dos y romper al otro consumidor. Es §1.c: una sola
tabla, y cada dominio la lee como le corresponde.
*Consecuencia en el seed:* verifica su propia poscondición —un día por cada
(fecha de jornada × predio activo)— y no el total de la tabla, que puede tener
legítimamente más filas.

---

## Arqueo y consolidación de efectivo

**57 · El arqueo cuelga de `dia_cancha_id`**
`jornada_id` + `predio_id` → una sola FK, más `unique (dia_cancha_id)`.
Implementa la decisión 46, que estaba escrita en presente sin estar construida.
*Por qué el unique:* hoy nada impide dos arqueos del mismo predio y fecha.
*Por qué es barato:* `arqueo` tiene 0 filas, ninguna FK entrante, ninguna vista
que la lea y ningún código de app que la toque. Sin backfill.
*Depende de la 56:* como un día de cancha puede existir **sin jornada**, el
arqueo de un sábado de solo bar tiene dónde colgar. Si hubiéramos exigido
jornada al crear el día, acá habría que desarmarlo.

**58 · No hay estado contable "en tránsito"; el arqueo pendiente es el estado**
El efectivo se consolida en dos etapas: cobro y arqueo en el predio el fin de
semana, entrega a central el lunes. Entre las dos, **la plata la tiene el
responsable del arqueo**, y eso lo dice el arqueo mismo — no una cuenta.
*Por qué:* el saldo sin rendir de una persona se calcula sumando sus arqueos
`pendiente_entrega`. Darle cuenta contable propia sería modelar un pasivo que se
resuelve solo el lunes siguiente, y agregar un estado que hay que mantener
sincronizado con el arqueo.
*Consecuencia:* `arqueo` gana `estado` (`pendiente_entrega` | `entregado`) y el
`responsable_id` que ya tenía pasa a significar "quién tiene la plata".

**59 · `saldo_sistema` se congela al arquear**
Se calcula en el momento y se guarda. Si mañana se corrige un asiento viejo, el
`saldo_sistema` de ese arqueo **no cambia**.
*Por qué:* el arqueo es un **acta histórica**. Decía lo que el sistema decía ese
día, y ese es exactamente el punto de un acta: si se recalculara, un arqueo que
cerró perfecto podría aparecer descuadrado meses después por un ajuste que no
tuvo nada que ver.
*No contradice §1.c:* el saldo esperado **se deriva del diario** al calcularlo.
Lo que se guarda es la foto, no una segunda fuente. Mismo mecanismo que
`total_plan` o `pagado_at`, pero acá el congelamiento es el propósito y no
una caché.
*Pendiente de construir:* el cálculo no existe. `v_saldo_caja` da el acumulado a
hoy, sin corte por fecha, y no puede responder "cuánto debería haber en TIR al
cierre del 8/8". Es el trabajo con sustancia de la pieza 4.

**60 · Un solo movimiento contable, al entregar (Escenario A)**
El efectivo del predio baja **al entregar**, no al arquear. Un único asiento
predio → central en la entrega. **El arqueo del fin de semana no mueve plata**:
es control puro.
*Por qué:* es coherente con la 58. Si el arqueo bajara la caja del predio, la
plata tendría que ir a algún lado —una cuenta "a rendir"— y eso es justamente el
estado intermedio que se decidió no tener.
*⚠ Bloqueo estructural detectado al relevar, a resolver al construir:* este
asiento **no se puede expresar hoy**. `asiento_linea` no tiene `predio_id` —el
predio vive en la cabecera del asiento— así que con una sola cuenta
`CAJA_EFECTIVO` las dos líneas del traslado caen en el mismo balde
`(cuenta, predio)` y se netean a cero: el traslado sería invisible y el saldo del
predio no bajaría. *Salida propuesta:* una cuenta propia `CAJA_CENTRAL`, de modo
que las dos líneas difieran por **cuenta** y no por predio.

**61 · La diferencia se registra; la resolución es diferida** *(refina la 20)*
`diferencia = saldo_contado - saldo_sistema` se asienta al arquear, **sin forzar
resolución**. Faltante o sobrante quedan registrados y ahí se detienen.
*Por qué:* quién se hace cargo —¿lo cubre el responsable? ¿es quebranto?— necesita
conversación, y forzar la imputación en el momento del conteo obliga a decidirlo
sobre la marcha. Puede además no resolverse nunca.
*Cómo:* `asiento_id` ya es nullable, justamente para esto: es el ajuste **cuando
se resuelva**.

**62 · Se crea la caja central**
Destino del efectivo de los predios. Hoy hay 4 cajas —efectivo TIR, efectivo AEP,
transferencia global, USD global— y ningún mecanismo de tránsito entre ellas.
*⚠ Segundo bloqueo detectado al relevar:* `check_caja_predio` **rechaza** una caja
de efectivo sin predio, que es exactamente lo que sería la central. Hay que
ajustar el trigger. Y como `v_saldo_caja` mapea `tipo → código de cuenta` con un
`case` escrito a mano, no puede distinguir dos cajas de efectivo con cuentas
distintas: `caja` necesita `cuenta_id → cuenta(id)` y la vista deja de mapear a
mano. Se cierra al construir.

---

## Playoffs

**63 · Los playoffs ya cuelgan de serie; la pieza 6 no mueve nada**
La pieza 1 movió **toda** `jornada` a `serie_id`, no solo la liga. La final de
Libre A y la de Libre B ya son jornadas distintas.
*Por qué importa dejarlo escrito:* el plan del rediseño listaba "playoffs por
serie" como pieza pendiente, y el relevamiento mostró que ya estaba hecho. Lo
que faltaba eran **tres agujeros**, porque la rama `es_playoff` nunca se
ejercitó: no hay puerta de creación —`crear_jornada` hardcodea
`es_playoff = false` y exige `numero`—, el `unique (serie_id, numero)` no
protege playoffs porque `numero` es `NULL` y Postgres considera cada `NULL`
distinto, e `instancia` no tiene dominio.
*Las series no se mezclan:* `jornada.serie_id` es una sola, así que un cuadro
cruzado entre series no es representable ni por accidente.

**64 · El formato de instancia es una tabla configurable, no un hardcode**
`formato_instancia (nombre, cantidad_partidos, orden)`, sembrada con
cuartos = 4 · semifinal = 2 · final = 1. `jornada.instancia` se valida contra
esa tabla.
*Por qué:* cerrar el dominio con `check (instancia in (…))` sería violar la
regla 12. Cuartos-semi-final es el formato de **este** torneo; otro puede tener
octavos, repechaje, tercer puesto o final a ida y vuelta. Editable y extensible
sin migración.
*Los equipos no se guardan:* son `partidos × 2`. Guardar los dos permitiría que
se contradigan, y el que hace falta para presupuestar es el de partidos.

**65 · `crear_playoff` es la puerta, con identidad `(serie_id, instancia)`**
`crear_playoff(serie_id, instancia, fecha default null, cantidad_partidos
default del formato)`. Extiende la decisión 49 —una lógica, dos puertas— al
playoff, y cierra los tres agujeros de una vez: da la puerta, impone la
unicidad que faltaba y valida la instancia contra el formato.
*`fecha` nullable:* cantidad y fecha se desconocen hasta que termina la liga. Se
crea el cuadro y se programa después con `mover_jornada`, que ya sirve para
playoffs porque opera por `id`. `suspender_jornada` también.

**66 · La cuota de playoff se genera por instancia jugada, después de la ficha**
`generar_cuotas_instancia(jornada_playoff_id)` genera una cuota por equipo
registrado en `equipo_playoff`, con el arancel de la línea `es_playoff` del
tarifario de su género, atada a la jornada de playoff y con vencimiento derivado
de su fecha (patrón de la decisión 50).
*Por qué no en B0:* al armar la ficha no existen las jornadas de playoff, no hay
fechas, y sobre todo **no se sabe si el equipo va a clasificar**. Facturarle a
los 16 equipos de la serie una final que juegan 2 sería inventar deuda. B0 ya
las excluye por triple partida, y está bien.
*Por instancia, no un paquete al clasificar:* juega cuartos → cuota de cuartos;
pasa a semifinal → cuota de semifinal. Se factura lo que se juega a medida que
se juega, igual que la liga. Un equipo eliminado en cuartos no debe la semi.
*Hace falta `equipo_playoff`* porque en la liga juegan todos los de la serie
siempre, y en playoff la clasificación es un dato que no se deriva de nada.

**67 · Los partidos de un playoff son dato; la decisión 45 se acota a la liga**
`v_torneo_escala.partidos` pasa a distinguir: liga = `equipos ÷ 2`, playoff =
`jornada.cantidad_partidos`.
*Por qué:* hoy la vista no excluye playoffs, así que la final de Libre A contaría
**8 partidos en vez de 1**. Con 3 instancias × 20 series el presupuesto
`por_partido` se infla mucho y en silencio — misma clase que la bomba del 284.
No molesta todavía porque hay 0 playoffs; se arregla antes de que existan.
*El principio:* "los partidos se derivan del tamaño de la serie" vale mientras
juegan todos contra todos. En un cuadro la cantidad depende del **formato**, y
por eso `formato_instancia` trae el default y `jornada` guarda el valor efectivo:
una semifinal a partido único y otra a ida y vuelta tienen que poder diferir.

**Alcance de la pieza:** backend. La pantalla de bracket —elegir los 8 que pasan
a cuartos, los 4 a semifinal, los 2 a la final— es front y va después; llena
`equipo_playoff` invocando estas mismas funciones.

---

## Socios

**68 · El sueldo del socio se devenga (Forma B), no va por percibido**
Es la **excepción deliberada** a la decisión 1. Los ingresos de equipos se
reconocen al cobrar; el sueldo del socio se devenga cada mes, se retire o no.
*Por qué no es una inconsistencia:* son hechos de naturaleza opuesta. El ingreso
de un equipo **puede no ocurrir nunca** —si no paga, no hay nada que reconocer—;
el sueldo del socio es un **compromiso cierto**: se acordó pagarlo y existe cada
mes independientemente de si lo retira.
*Qué se rompe si no se registra:* la caja parece toda del negocio cuando parte ya
está comprometida con los socios. El número queda bien y la lectura mal.
*Alcance:* no toca el reconocimiento de ingresos. La decisión 1 sigue intacta.

**69 · `GAS_SOCIOS` es egreso propio, no patrimonio ni `GAS_SUELDOS`**
Dos cuentas nuevas: `GAS_SOCIOS` (egreso) y `SOCIOS_A_PAGAR` (pasivo).
*Egreso y no patrimonio:* el sueldo de socios se trata como **costo del negocio**,
no como distribución de utilidad.
*Costo de la EMPRESA, no del torneo:* el asiento va con **`torneo_id = NULL`**, a
nivel estructura permanente (§3.2). El sueldo existe todos los meses, haya torneo
o no; imputarlo a uno exigiría prorratearlo entre los que corren ese mes, que es
exactamente el criterio arbitrario que la **decisión 5** prohíbe. En
`v_resultado_producto` cae bajo "Estructura permanente": la contribución de cada
torneo queda intacta y lo que baja es el resultado de la empresa.
*Cómo se implementa el P&L:* solo con el tipo de cuenta.
`v_resultado_producto` filtra `c.tipo in ('ingreso','egreso')`, así que
`GAS_SOCIOS` entra y baja la contribución, y `SOCIOS_A_PAGAR` no aparece por ser
pasivo. **Ninguna vista se toca.** Si la cuenta fuera `patrimonio` —valor que el
CHECK admite y que hoy no usa nadie— simplemente no aparecería.
*Cuenta propia y no `GAS_SUELDOS`:* el total del P&L es el mismo, pero separarlas
permite leer el sueldo operativo aparte del de los dueños, que es justo la
distinción que se quiere mirar.
*El saldo del socio es el saldo de `SOCIOS_A_PAGAR` imputado a él* — devengado
menos retirado. Sale del diario, no de un cálculo aparte.

**70 · El sueldo acordado se versiona con historial**
`sueldo_socio (socio_id, monto, vigente_desde)`. El vigente en un mes es el de
mayor `vigente_desde <= fin de ese mes`. **Cambiar el sueldo es insertar una
fila, no editar la que hay.**
*Por qué:* sin historial, corregir el devengo de marzo usaría el sueldo de hoy.
El historial es lo que permite recalcular un mes viejo con el sueldo que regía
entonces.
*Primer parámetro versionado de verdad del sistema.* `config_contable` tiene
`vigente_desde`, pero es **una sola fila sin historial** —guarda "el umbral
actual y desde cuándo", no una línea de tiempo— y además no la lee ninguna
función ni vista. No servía de molde.

**71 · El devengo mensual escribe solo**
`devengar_sueldos_socios(periodo_id)` genera los asientos directamente.
Idempotente por `unique (socio_id, periodo_id)` —mismo patrón que
`amortizacion`—, disparado explícitamente al procesar el mes, y aborta si el
período está cerrado.
*Rompe con el único precedente, y es deliberado:* `proponer_amortizaciones`
**propone** y el operador confirma (decisión 23) porque una amortización es una
**estimación**. El sueldo del socio es un **monto acordado y conocido**: no hay
nada que revisar antes de asentarlo.
*No es un cron invisible:* alguien lo corre. Correrlo dos veces no duplica.

**72 · El retiro de sueldo no se mezcla con el fondo de inversión**
Cuentas y conceptos separados de `FONDO_INVERSION` (decisión 22, §3.15).
*Por qué:* el fondo ya modela plata de socios, pero **en el sentido contrario** —
colocación y rescate, movimientos de fondos que no tocan resultado. Un retiro de
sueldo **cancela un pasivo devengado**; un rescate **mueve respaldo**. Si
terminaran en la misma cuenta o en el mismo indicador, `v_dependencia_fondo`
dejaría de significar lo que dice: "hace ocho meses que rescatamos más de lo que
devolvemos" se contaminaría con retiros de sueldo, que son otra cosa.

**Alcance del módulo:** backend. La pantalla —cargar sueldo, registrar retiro,
ver saldos— es front y va después. Guille y Agus se cargan como `tercero` tipo
`socio`; el tipo **ya existe** en el CHECK y no hace falta tabla propia —
`arquitectura.md` §3.4 ya establece que equipos, sponsors y socios comparten la
misma mecánica y se modelan con un discriminante.

---

## Sponsors

**73 · Devengo lineal · el tercer patrón de reconocimiento**
El contrato de sponsor se reconoce **prorrateado en los meses que cubre**:
`monto_total / meses del rango`, parejo.
*Por qué otro patrón más:* son tres naturalezas distintas y cada una ya tiene su
argumento. El equipo **puede no pagar nunca**, así que hasta que no cobra no hay
nada (decisión 1). El socio tiene un **fijo mensual cierto**, así que se devenga
ese fijo cada mes (decisión 68). El sponsor firmó **un total por un período** y
da visibilidad todo el tiempo: lo que gana el negocio cada mes es una fracción
del contrato, no el contrato entero ni cero.
*La asimetría es deliberada,* no una indecisión acumulada.

**74 · Los dos calendarios se llevan separados**
**Reconocimiento** —parejo, mensual, para el P&L— y **cobro** —las cuotas en sus
fechas, para el cashflow— son dos líneas de tiempo que **no coinciden**.
*Ejemplo:* 1.200.000 de ago-2026 a jul-2027 reconoce 100.000 todos los meses,
pero puede cobrarse 400.000 en agosto, diciembre y abril.
*Por qué separados:* responden preguntas distintas —"¿cuánto ganó el negocio este
mes?" y "¿cuándo entra la plata?"— y colapsarlos en una sola línea obligaría a
mentir en una de las dos.
*Cómo:* `cuota_cobro_sponsor` lleva el cronograma de cobros; `devengo_sponsor`
lleva lo reconocido. Ninguno se deriva del otro.
*Validación:* la suma de las cuotas de cobro **tiene que igualar** `monto_total`.
Si no, el cashflow proyecta plata que no va a entrar y `DEUDORES_SPONSORS` nunca
llega a cero.

**75 · `INGRESO_DIFERIDO` es un pasivo que se libera mes a mes**
Al **firmar**: `DEUDORES_SPONSORS` / `INGRESO_DIFERIDO` por el total, **sin tocar
el P&L** — se firmó, no se ganó nada todavía. Cada **mes**:
`INGRESO_DIFERIDO` / `ING_SPONSORS` por la porción. Cada **cobro**: caja /
`DEUDORES_SPONSORS`.
*Cada pregunta tiene su cuenta:* cuánto ganamos (`ING_SPONSORS`), cuánto falta
ganar (`INGRESO_DIFERIDO`), cuánto falta cobrar (`DEUDORES_SPONSORS`). Nada sale
de cálculos aparte.
*⚠ El último período absorbe el redondeo:* `total / meses` no siempre da exacto —
1.000.000 en 12 meses deja 0,04 huérfanos, e `INGRESO_DIFERIDO` **nunca cerraría
en cero**, mostrando cuatro centavos eternos de "pendiente de devengar". El
último devengo toma el **remanente** (`monto_total` menos lo ya devengado) en vez
de la cuota teórica: el pasivo cierra exacto por construcción.

**76 · Sponsor a nivel empresa; `DEUDORES_SPONSORS` propia**
Todos los asientos con **`torneo_id = NULL`**, igual que los sueldos de socios.
*Por qué:* el contrato es **anual y cubre los dos torneos**; imputarlo a uno
exigiría el prorrateo que la decisión 5 prohíbe.
*Consecuencia a tener presente al leer las pantallas:* el ingreso de sponsors
**no entra en la contribución de ningún torneo** — aparece bajo "Estructura
permanente", y `v_comparador_torneos` compara torneos **sin** ingresos de
sponsor. Es correcto y deliberado, pero sorprende si no se sabe.
*Cuenta de deudores propia y no la `DEUDORES` genérica:* ésa se diseñó para
equipos y la **decisión 1 la sacó de juego** —bajo percibido puro, lo que un
equipo debe no está en el diario—. Reusarla resucitaría un concepto retirado a
propósito y dejaría ambiguo "¿cuánto nos deben?", mezclando deuda de equipos, que
no es saldo contable, con deuda de sponsors, que sí lo es.
*Tampoco reusa `ANTICIPOS`:* un anticipo es plata **ya recibida**; el ingreso
diferido es un contrato **firmado y no ganado**, que puede estar sin cobrar. Dos
pasivos distintos.
*De las tres cuentas, `ING_SPONSORS` ya existía* en el plan desde el schema
inicial, sin uso.

**77 · Las cuotas de cobro alimentan el cashflow**
`v_cuotas_sponsor_futuras` expone las cuotas con fecha futura, y **es la que el
módulo de cashflow va a consumir**.
*Por qué importa dejarlo escrito:* es el punto de contacto entre este módulo y la
previsión de caja (§3.10, §3.16). El cashflow no debe derivar la entrada de plata
del devengo —que es parejo y no dice cuándo entra— sino de este cronograma.
*El cobro de sponsor no reusa `registrar_cobro`:* ésa imputa contra `cuota` de
equipos y llama a `imputar_pago`. El sponsor cobra contra `DEUDORES_SPONSORS` y
no tiene cuotas de equipo. Mismo nombre coloquial, circuitos distintos.

**Alcance del módulo:** backend. La pantalla es front y va después.

---

## Moneda extranjera

**78 · El diario es monomoneda; la cantidad de dólares vive aparte**
`asiento_linea` es `(cuenta, debe, haber, tercero)` — **sin moneda ni cantidad**, y
no hay ninguna columna de divisa en el resto del schema. La cantidad de dólares
vive en `usd_operacion`.
*Ya estaba así en el schema original; se explicita como principio* porque es la
decisión difícil del módulo y conviene que no se reabra por comodidad.
*La división:* la **tenencia** (cuántos USD) sale de `usd_operacion`; el **costo
en libros** (cuántos pesos) sale del saldo de `CAJA_USD` en el diario. Los dos
hacen falta y el PPP es el puente.
*Por qué no meter multimoneda al diario:* contaminaría **todas** las líneas de
todas las cuentas para un caso que vive en una sola caja. La complejidad queda
aislada donde ocurre.

**79 · Valuación por promedio ponderado (PPP), derivado y no guardado**
`costo_promedio = costo_libros / tenencia_usd`. Los dólares salen a ese promedio
al venderse.
*No se guarda en ninguna parte:* se deriva de las dos fuentes. Guardarlo sería un
tercer número que hay que mantener sincronizado con los otros dos.
*Se mantiene solo:* al vender, `CAJA_USD` baja **exactamente por el costo de
salida**, así que lo que queda conserva el mismo promedio. No hay que recalcular
nada.
*Ejemplo:* 500 @ 1.000 + 500 @ 1.100 = 1.000 USD / $1.050.000, promedio 1.050.
Vender 700 @ 1.200 saca 735.000 de costo, recibe 840.000, gana 105.000, y quedan
300 USD / $315.000 — todavía a 1.050.
*⚠ Riesgo conocido:* el promedio cruza **dos fuentes**. Si alguien asienta contra
`CAJA_USD` sin registrar la operación —un `crear_asiento` directo, un ajuste— el
promedio queda mal **en silencio** y todas las ventas posteriores salen a un
costo equivocado. Las funciones son la única puerta correcta, y conviene una
verificación que compare ambas fuentes.

**80 · La diferencia de cambio es solo realizada; `revaluacion` sale del dominio**
Los dólares quedan **a su costo** hasta que se venden. La ganancia o pérdida se
reconoce **al concretar la venta**, nunca por revalúo periódico.
*Por qué:* sin ganancias en papel. Una tenencia que "vale más" no es plata hasta
que se vende.
*La poda:* `usd_operacion.tipo` admitía `('compra','venta','revaluacion')`. Con
este modelo la revaluación no existe, y **un valor del dominio que el modelo no
usa es una trampa**: alguien lo va a elegir y va a asentar una ganancia que no
ocurrió. Se saca del CHECK. Misma limpieza que `por_jornada` en la decisión 52.
Si algún día se quiere revalúo, se agrega con su lógica.
*Reemplaza* la fila "Revaluación → Caja USD / Diferencia de cambio → No
realizado" que `arquitectura.md` §3.7 traía desde el schema original.
*Tabla vacía:* 0 filas, no migra ningún dato.

**81 · USD a nivel empresa, y separado del fondo de inversión**
Todos los asientos con **`torneo_id = NULL`**: la cobertura cambiaria no es de
ningún torneo (decisión 5). Cuenta `FIN_DIF_CAMBIO`, de tipo `financiero`.
*Separado del fondo (decisión 22, §3.15):* el fondo es plata **de los socios**
colocada en el banco, con su propia tabla `movimiento_fondo`, su propia cuenta
`FONDO_INVERSION` y su propio indicador `v_dependencia_fondo`. La caja USD es
plata **de la empresa** guardada como cobertura. No se tocan.
*No se crea ninguna cuenta:* `CAJA_USD` y `FIN_DIF_CAMBIO` ya están en el plan
desde el schema inicial, sin uso. **El código es `FIN_DIF_CAMBIO`**, no
`DIFERENCIA_CAMBIO`.

**82 · Hace falta una vista de resultado de cambio, porque hoy no se ve**
`FIN_DIF_CAMBIO` es `financiero`, así que `v_resultado_producto` **no la toma** —
filtra `ingreso`/`egreso`. Eso es correcto y deliberado (decisión 12: una suba
del dólar no debe leerse como que el torneo funcionó mejor).
*El problema:* la "línea aparte" donde debería verse **no existe**. Ninguna vista
lee `FIN_DIF_CAMBIO`, así que hoy la diferencia de cambio se registraría y no
aparecería en ninguna pantalla.
*Se agregan dos vistas:* `v_tenencia_usd` —cuántos USD, costo en libros, promedio
actual— y `v_resultado_cambio`, para que el resultado financiero sea visible.

**Alcance del módulo:** el más liviano. No se crea estructura —tabla, caja y
cuentas ya existen—, solo la lógica: la poda del CHECK, `comprar_usd`,
`vender_usd` con el PPP, y las dos vistas. **Sin proceso mensual:** a diferencia
de socios y sponsors, las operaciones son puntuales y no hay nada que devengar.

---

## Cashflow

**83 · Tres niveles de certeza, determinados por el estado**
**REAL** (movimientos de caja del diario) · **COMPROMETIDO** (cuotas de equipos y
sponsors, con fecha pactada) · **ESTIMADO** (el presupuesto distribuido).
*Automáticos, sin clasificación a mano:* el nivel lo determina el **estado** del
flujo. Que alguien tenga que etiquetar cada número es la garantía de que en tres
meses las etiquetas mienten.
*La confianza es una COLUMNA del modelo,* no una convención de la pantalla. Cada
flujo sabe su nivel y la vista agrupa por él — así "¿de dónde sale este número?"
se responde sin abrir el código.
*El ESTIMADO es solo egresos:* los ingresos proyectados ya son COMPROMETIDO,
porque cuotas y sponsors tienen fecha pactada.

**84 · REAL es el movimiento de las cajas agregadas**
Sale de las líneas de las cuentas que apunta `caja.cuenta_id` —`CAJA_EFECTIVO`,
`CAJA_TRANSFERENCIA`, `CAJA_CENTRAL`, `CAJA_USD`— por `asiento.fecha`.
*Por caja y NO por tipo `ingreso`/`egreso`:* los gastos van por devengo
(decisión 12) y los sueldos de socios también (decisión 68), así que `GAS_*` y
`SOCIOS_A_PAGAR` **no son caja**. Solo los ingresos de equipos coinciden, por
percibido puro. Se cuenta lo que tocó caja.
*Agregadas, y eso resuelve un problema solo:* los traslados predio → central
(decisión 60) y las compras de USD mueven plata **entre dos cuentas de caja**, así
que en el agregado **suman cero** y no ensucian el flujo. El flujo real es el
movimiento de la **posición de caja**, no de cada caja por separado. El desglose
por caja, si se quiere, es otra vista.

**85 · ESTIMADO es el presupuesto distribuido por el calendario**
`v_presupuesto_total` da un **total sin dimensión temporal**. Se reparte con el
calendario que ya existe: `por_partido` en las fechas de las jornadas,
`por_dia_cancha` en los días de cancha, `por_mes` parejo.
*Por qué:* el costo tiene que caer **donde el calendario dice que ocurre la
actividad**, no en un bulto mensual. Es la escala de la decisión 52 usada para
ubicar en el tiempo lo que ya sabía cuantificar.

**86 · La anti-duplicación es por estado — y del lado de egresos no alcanza**
Un flujo está en **un solo** nivel: al concretarse **migra** de proyectado a real.
*En ingresos funciona sola:* la cuota cobrada tiene `saldo = 0` y desaparece de
COMPROMETIDO; la de sponsor cobrada tiene `cobrado_at` y sale de la vista de
futuras. Nunca está en los dos.
*⚠ En egresos NO:* ESTIMADO sale del **presupuesto**, no de los gastos. Una línea
"árbitros × N partidos" no sabe qué gastos concretos se pagaron, y **pagar un
gasto no achica el presupuesto**. Con 100.000 presupuestados para agosto y
100.000 pagados en agosto, el flujo mostraría **200.000**.
*La asimetría es de fondo:* una cuota es un **compromiso individual con estado
propio**; una línea de presupuesto es un **agregado sin estado**. No hay nada que
migre.
*Resuelta por la decisión 90:* se cortó la línea de tiempo por fecha, así la
exclusión es **estructural** —una fecha es pasada o futura, nunca las dos— y no
depende de emparejar líneas de presupuesto con gastos.
*El caso de las vencidas impagas también se cerró ahí:* tienen `vence_at` pasado
y se siguen esperando, así que se **arrastran a hoy** conservando
`fecha_original`. Mostrar plata futura con fecha pasada confundiría la
proyección.

**87 · La semana se deriva; no hay tabla de semanas**
`date_trunc('week', fecha)` sobre las fechas de los flujos.
*Por qué:* una semana **no es un período contable** y no debe serlo. `periodo` es
`(anio, mes)` y así queda — meterle semanas lo convertiría en dos cosas a la vez.
La agrupación semanal es de presentación, no de estructura.
*La alerta de quiebre* (§3.16) se calcula sobre esa agrupación: si el saldo
proyectado acumulado perfora cero, se avisa con fecha y monto.

**88 · `v_flujo_proyectado` (§3.10) se reemplaza por completo**
La vista que el Draft anterior documentaba con SQL completo **no existía en la
base**, y su SQL **no compilaría hoy**: referencia `cat_gasto.grupo` —hoy
`naturaleza` + `area`—, `presupuesto_linea.monto_mensual` y `cantidad_x_fecha`
—hoy `base`, `cantidad`, `unidad`— y **`jornada.torneo_id`**, que la pieza 1
eliminó. Además usaba `pagado_at is null`, que ignora las cuotas parciales y las
de jornada suspendida.
*No se copia nada de ese SQL.* Se reemplaza con el modelo de tres niveles.
*Es la cuarta aparición del drift doc↔schema* —antes `presupuesto_linea`, `caja`
y `arqueo`— y **la más grande**, porque no era un campo mal documentado sino una
vista entera que parecía construida. Refuerza el pendiente de hacer una pasada de
verificación doc↔schema.

**Alcance del módulo:** backend, 3-4 vistas, **sin estructura nueva**. Es
integración y presentación de fuentes existentes: el cashflow **lee** lo que cada
patrón de reconocimiento produjo y no cambia cómo se reconoce nada. La pantalla
—con drill-down y alerta de quiebre— es front y va después.

---

## Correcciones posteriores

**89 · `registrar_cobro` sin fallback a `auth.users`**
El responsable sale del parámetro o de la sesión —`coalesce(p_responsable_id,
auth.uid())`— y si no hay ninguno, **falla explícito**. Se sacó el tercer
término, `(select id from auth.users limit 1)`.
*Por qué:* hacía dos daños distintos. Desde el front sin sesión, `auth.uid()` es
null y la subconsulta se evalúa: el rol no puede leer `auth.users` y el error que
llegaba era "permission denied for table users", que no dice nada de lo que pasó.
Y peor: desde un rol que **sí** puede leerla —el servidor— un cobro sin
`p_responsable_id` quedaba atribuido **al primer usuario de la tabla**, en
silencio. Eso no falla: **miente sobre quién cobró**, y queda escrito en
`pago.registrado_por` y en `asiento.created_by`.
*Es un cambio de criterio de auditoría,* no una corrección técnica: un dato de
auditoría inventado es peor que la ausencia del dato.
*No se usó `SECURITY DEFINER`.* Esa vía —propuesta en la rama
`fix/registrar-cobro-definer`, descartada— resolvía el síntoma dejando vivo el
problema: con `DEFINER` el fallback funciona **siempre**, así que el responsable
falso pasaría de error ocasional a comportamiento normal.
*Camino feliz idéntico:* `coalesce` corta en el primer argumento no nulo, así que
con sesión válida la subconsulta nunca se evaluaba.
*⚠ Pendiente:* `crear_asiento` tiene **el mismo fallback**, y lo llaman nueve
funciones que le pasan `p_created_by => null`. Es el mismo problema en el lugar
más central —la única vía de escritura al diario—. Queda para el bloque 10.
*Commit `0cbad99`, migración `20260802170000`.*

**90 · El corte por fecha del cashflow** *(cierra la 86)*
`REAL <= hoy` · `COMPROMETIDO >= hoy` + las vencidas arrastradas · `ESTIMADO >
hoy`.
*Por qué el corte:* es lo que impide que el presupuesto y los gastos ya pagados
se cuenten dos veces, sin depender de emparejarlos uno a uno (decisión 86).
*Por qué `<=` y no `<`:* la regla acordada decía "anterior a hoy", pero con
`< hoy` **un cobro de esta mañana no aparecería en ningún lado** — ni en real,
que es hoy, ni en proyectado, que ya ocurrió. Y el corte solo hace falta entre
REAL y ESTIMADO: COMPROMETIDO se autoexcluye por `saldo`.
*Verificado con el caso crítico:* con la jornada 1 del 01/08 pasada y las 2, 3 y
4 futuras, a 100.000 de árbitros por jornada, el estimado de agosto dio −300.000
y el real −100.000: las cuatro jornadas contadas **una** vez. Sin el corte,
−500.000.
*Las unidades `anual` y `unico` no entran en el estimado:* no tienen fecha
natural, e inventarles una sería ubicar plata donde no se sabe que ocurre.
Necesitan fecha para poder proyectarse.

**91 · `v_cashflow`: el saldo separa stock de flujo**
El saldo proyectado es **stock** (la caja real al cierre de esa semana) **más el
acumulado de lo que todavía no ocurrió** (comprometido + estimado). `monto_real`
**nunca** se acumula.
*Qué estaba mal:* la ventana partía de `sum(saldo) from v_saldo_caja` —un stock,
que ya contiene todos los movimientos reales— y le sumaba `flujo_neto`, que
**incluye `monto_real`**: los mismos cobros, contados dos veces. `/proyeccion`
mostraba "Saldo actual $16.600.000" con $3.790.000 en caja, y el error se
arrastraba a todas las semanas siguientes.
*Por qué el stock se toma al fin de CADA semana* y no fijo al saldo de hoy: así
una sola expresión sirve para los tres casos —una semana pasada muestra su saldo
histórico, la actual la caja de hoy más lo comprometido, y las futuras acumulan—.
Con el saldo de hoy fijo, todas las pasadas mostrarían el mismo número y el tramo
"real" del gráfico sería una línea horizontal.
*Consistencia:* el stock replica la lógica exacta de `v_saldo_caja` —join contra
`caja`, filtro por predio— más el corte de fecha, así los dos números coinciden
por construcción y no por casualidad.
*Convención semana/mes, ahora explícita:* **una semana pertenece al mes en que
empieza**. `v_cashflow` agrupa solo por semana y deriva el mes del lunes; antes
agrupaba por `(semana, mes)` y una semana partida entre dos meses producía **dos
filas con la misma semana**, con el `order by` de la ventana empatado. En el
Clausura se parten cuatro semanas y tres ya tienen flujo.
*`v_cashflow_mensual` se corrigió sola:* solo lee `saldo_proyectado`. Sus
columnas de flujo siguen bien — ahí sumar flujos **sí** corresponde; el error era
sumar un flujo sobre un stock.
*Commit `6e8e236`, migración `20260802200000`.*

---

**El resguardo USD cuenta en la caja total.** `v_saldo_caja` incluye la fila de
`caja` de tipo `usd` —joinea por `cuenta_id` sin filtrar tipo— y
`v_saldo_caja_total` la suma, así que el KpiCard "En caja" del dashboard
**incluye el costo en pesos de los dólares**.

*Se confirma así.* El resguardo es **patrimonio de Campa**: los dólares están
comprados, son plata de la empresa, y excluirlos del total haría que la caja
total mostrara menos de lo que hay. Es lo que corresponde para la pregunta
"¿cuánto tiene Campa?".

*Está a valor de COSTO, no de mercado.* El saldo de `CAJA_USD` es lo que se
pagó, a promedio ponderado. El sistema no puede hacer otra cosa: **no hay
ninguna cotización del día en el schema** (§3.7). Con el dólar en alza, la caja
total muestra menos que el valor real de la posición — deliberado, es la
valuación al costo.

> **Refinamiento pendiente, no bug.** "En caja" se lee fácil como *disponible
> para operar*, y el resguardo es plata **inmovilizada a propósito**: no se
> toca para pagar un arbitraje. Con USD comprado, alguien puede mirar el
> dashboard y creer que tiene más disponible del que tiene.
>
> Lo que falta es el **desglose visible**: que el dashboard diga
> "En caja $X · incluye $Y en resguardo USD" en vez de un total mudo. El número
> no cambia; cambia lo que se entiende al leerlo.
>
> *Cuándo:* cuando haya USD comprado de verdad. Hoy la tenencia de producción
> es cero y el desglose mostraría "incluye $0", que es peor que no mostrarlo.

---

**Bloque 10 mínimo · autenticación, y el fallback de `crear_asiento` afuera.**

La decisión 89 sacó el fallback a `auth.users` de `registrar_cobro`, pero lo dejó
vivo en **`crear_asiento`**, que es la única vía de escritura al diario. O sea
que el problema seguía entero: sacarlo de una función y dejarlo en el motor que
esa función llama no cambia nada. Los dos daños seguían pasando.

*Se cerró construyendo lo mínimo de auth para que se pudiera sacar*, en tres
pasos (migraciones `20260810185307` y `20260810185405`):

1. **Login real.** `/login` con email y contraseña, `middleware.ts` que refresca
   la sesión y cierra el paso, y los cinco usuarios creados por la Admin API con
   emails placeholder `@campa.local`. Sin registro público, sin recuperación de
   contraseña —cinco personas, se repone del panel—.
2. **Las seis llamadas de escritura pasan el id de sesión**, leído con
   `getUser()` en cada handler: `p_responsable_id` en cobro y arqueo,
   `p_created_by` en gastos.
3. **El fallback afuera**: `coalesce(p_created_by, auth.uid())` y raise si no
   hay ninguno. Con sesión, el coalesce corta en `auth.uid()` y el tercer
   término ni se evalúa — el «permission denied for table users» desaparece por
   no ejecutarse, no por permiso.

*Verificado, y es la primera vez que se prueba así:* un gasto cargado **desde la
pantalla, en un navegador, con sesión de Mati**, quedó con `created_by` = el id
de Mati y no el de `facuubosch@gmail.com` que ponía el fallback. Todo lo probado
antes de esto había pasado por `service_role` desde MCP, que es un camino que
ningún usuario recorre.

> **Nota operativa que hay que tener presente en la próxima siembra.** Sembrar
> por SQL o MCP **ahora exige pasar `p_created_by` explícito**. `service_role`
> ya no alcanza: antes el fallback lo cubría en silencio. Todo lo cargado hasta
> hoy —socios, sponsors, USD, presupuesto, gastos— funcionó por esa red que ya
> no está.

> **⚠ Esto arregla la auditoría, NO la seguridad.** RLS sigue **apagado en las
> 47 tablas**, y la anon key va en el bundle del navegador: cualquiera con ella
> puede escribir la base **con o sin login**. El mínimo cambia *quién dice ser*
> el que escribe; no cambia *quién puede*. Antes de que la app esté en internet,
> RLS deja de ser "para después".

**Lo que el mínimo NO incluye**, y sigue pendiente del bloque 10 completo: roles
diferenciados (operador / admin / lectura), RLS por rol, permisos por pantalla, y
el usuario de sistema para los devengos automáticos.

---

**Las plantillas de mensaje viven en la base, no en TypeScript.** Era la
decisión que quedó abierta desde julio con las **dos** cosas construidas a la
vez: `plantilla_mail` modelada y sembrada con cuatro plantillas, y
`lib/mail/templates.ts` con dos escritas a mano. Ninguna se usaba, y mantener
las dos era la fábrica de drift que CLAUDE.md advierte.

*Gana la tabla*, por una razón concreta: que Guille o Mati puedan cambiar "te
pedimos regularizar el pago" sin un deploy. En TypeScript cada palabra distinta
es un commit, un build y un push — y el texto de un reclamo es exactamente lo
que se quiere ajustar después de mandarlo dos veces. `templates.ts` se borró
(verificado antes: no lo importaba nadie).

Con dos consecuencias que se resolvieron en el mismo trabajo:

· **`cuerpo_texto`**, la versión plana para WhatsApp. Va como columna y no como
  fila aparte: es el mismo reclamo en dos formatos, y con dos filas la primera
  vez que alguien edite una sola, el mail y el WhatsApp dirían cosas distintas.

· **Los dos canales salen de la plantilla.** Al principio WhatsApp usaba un
  texto que armaba la pantalla y el mail usaba la plantilla — dos redacciones
  para el mismo reclamo, o sea el drift que la tabla venía a evitar, reaparecido
  por otro lado. Ahora la pantalla aporta sólo los datos.

> **El bug que sólo se vio al renderizar con datos reales.** El primer intento
> pasaba en `{{detalle}}` el mensaje entero que armaba la pantalla —con su
> saludo y su cierre— y la plantilla le agregaba los suyos: el resultado tenía
> dos saludos, dos despedidas y "te pedimos regularizar" repetido. Con los
> placeholders sin resolver, la plantilla parecía correcta. La lección es del
> proceso, no del código: una plantilla se revisa **renderizada**, no en
> abstracto.

---

**`email_usuario()` es `security definer` y expone `auth.users.email` a
cualquier `authenticated`.** Es una decisión de acceso tomada a conciencia, no
un descuido, y está atada al pendiente de RLS de más arriba.

*El problema.* `plantilla_mail` guarda `updated_by uuid` para poder contestar
quién cambió el texto que se le manda a 300 equipos. Pero un uuid no le dice
nada a nadie, y `authenticated` **no puede leer `auth.users`** —da "permission
denied for table users"—, así que resolverlo a un email desde la app es
imposible sin cruzar esa pared. Es la misma pared que hizo caer el fallback de
`crear_asiento` (decisión del bloque 10 mínimo), y la razón por la que
`/auditoria` muestra hoy los primeros ocho caracteres del uuid en vez de un
nombre.

*La forma elegida.* Una función `security definer` con `search_path` fijo, un
solo dato de salida —el email— y `execute` únicamente para `authenticated`. Es
lo más chico que resuelve el caso: no da acceso a la tabla, sólo contesta una
pregunta puntual.

> **`revoke ... from public` NO alcanza.** Supabase tiene *default privileges*
> que le dan `execute` a `anon` y a `authenticated` sobre toda función nueva de
> `public`, y son grants directos a esos roles, no al pseudo-rol `PUBLIC`.
> Verificado con `has_function_privilege` **después** de aplicar: sin un
> `revoke ... from anon` explícito, `anon` podía ejecutarla — o sea que
> cualquiera con la anon key, sin loguearse, obtenía el email de un usuario a
> partir de su uuid. La migración lleva los dos revoke.

*Qué queda para revisar con RLS.* Hoy **cualquier logueado ve el email de
cualquier otro**. Con cinco personas de la comisión eso es lo que se quiere: la
pregunta "¿quién tocó esto?" no se contesta con `a1b2c3d4`. Cuando llegue RLS
—o cuando entre al sistema gente que no es de la comisión— hay que decidir
**quién puede ver el email de quién**, y esta función es el primer lugar donde
mirar.

*Y el corolario útil:* cuando eso se resuelva, **`/auditoria` puede usar
`email_usuario()`** y dejar de mostrar uuids recortados. La herramienta ya
está; no se cambió esa pantalla en el mismo commit a propósito, para no mezclar
carriles.

---

**Reordenamiento del plan de cuentas.** El plan había crecido por acumulación:
categorías duplicadas, gastos clasificados bajo cuentas que no les
correspondían, y una cuenta que el cambio de modelo había dejado sin sentido. Se
reordenó en tres pasos, de menor a mayor riesgo, cada uno ensayado con
`begin`/`rollback` antes de aplicar.

**El principio que ordenó todo:** *un renombre o un cambio de `cat_gasto` no
toca el libro diario.* `registrar_gasto` resuelve la cuenta del asiento desde
`cat_gasto.cuenta_id`, así que mientras la cuenta no cambie, el asiento no se
entera. Por eso la verificación de cada paso fue la misma —que el total de la
cuenta afectada no se moviera— y por eso la regla 4 nunca entró en juego: no se
editó ningún asiento, se reclasificaron gastos.

*Grupo 1 · renombres y limpieza.* «Extras» existía **dos veces** —en `GAS_BAR` y
en `GAS_FECHA`— y en la matriz del P&L habrían sido dos filas idénticas sin
nada que las distinga: pasaron a «Extras Bar» y «Otros Gastos Fecha».
«Mantenimiento» → «Mantenimiento Predio» y «Mantenimiento - Personal» →
«Sueldos Predio», que convivían y no se distinguían. Se borraron los 7 conceptos
de «Viáticos» —duplicaban categorías que ya existen por su cuenta:
Estacionamiento, Guardias y Limpieza son de `GAS_PREDIO`— y la categoría
«Mantenimiento eventual», que nunca se usó: lo eventual es la `naturaleza` del
gasto, no una categoría aparte.

> Los `update` van acotados por `cuenta_id`, y no es defensivo: con dos «Extras»
> que se renombran distinto, un `where nombre = 'Extras'` los pisa a los dos.

*Grupo 2 · categorías que cambiaron de cuenta.* `GAS_SUELDOS` tenía adentro
cosas que no son sueldos: «Impositivos» (IVA, IIBB, F931, UTEDYC…) y «Planes de
Pago» (ARCA, Municipalidad, Rentas) se fueron a `GAS_IMPUESTOS`, que estaba
vacía; «Nafta» a `GAS_PREDIO`. Las tres tenían **0 gastos y 0 líneas de
presupuesto**, así que nada histórico se reclasificó.

> **El riesgo de este grupo no estaba en la cuenta sino en el `area`:**
> `cat_gasto` tiene `unique (area, nombre)` —por ÁREA, no por cuenta—, que es
> además la razón por la que los dos «Extras» podían convivir. «Nafta» fue la
> única que cambió de área y se verificó que no chocara.
>
> Impositivos y Planes de Pago **no** cambiaron de área: `area` sólo admite
> torneo, predio, bar y administración, y los impuestos son administración. La
> cuenta dice *qué* gasto es; el área, *de qué parte del negocio* sale la plata.
> Son los dos ejes del concepto 4, y sólo uno se movió.

*Grupo 3 · lo delicado.* «Alquiler» y «Alquileres» eran la misma cosa con dos
criterios de subdivisión —género y lugar—: **queda el de lugar**, porque se
alquila un predio, no un género. Los 2 gastos y la línea de presupuesto se
reapuntaron **antes** de borrar: `concepto_gasto` tiene `on delete cascade`
desde `cat_gasto`, pero la FK de `gasto` no, así que un borrado prematuro habría
fallado — que es lo correcto. `GAS_PREDIO` quedó en $2.227.000 antes y después.

Y se borró **`DEUDORES`**: nació para el devengo de ingresos, y con percibido
puro ese modelo no existe —lo que un equipo debe vive en `cuota`, no en el
diario—. Es la única cuenta del plan que no esperaba ningún circuito por
construir. Verificada huérfana en las cuatro tablas que referencian `cuenta`, y
sacada también de `supabase/seed.sql`, que era su única alta en el repo.

> **Las dos «naftas» quedan separadas a propósito.** «Nafta» (categoría, con
> «Nafta Agus» y «Nafta Guille») es combustible de los autos; «Nafta maquinaria»
> (concepto dentro de «Mantenimiento Predio») es del equipamiento. Son cosas
> distintas y el parecido de los nombres no las hace duplicados.

---

**El sueldo de cada socio en el P&L sale de `tercero_id`, no de un concepto de
gasto.** Y por eso **no se deben crear conceptos de sueldo de socio en
`cat_gasto` / `concepto_gasto`**.

*Cómo apareció.* «Agus» y «Guille» estaban cargados **dos veces**: como
`tercero` tipo `socio` —con sueldo acordado, devengos y $9.450.000 asentados
contra `GAS_SOCIOS`— y como `concepto_gasto` de «Sueldos administrativos», bajo
`GAS_SUELDOS`. Nada impedía cargar un gasto contra el concepto: el sueldo habría
quedado contado dos veces, en dos cuentas, por dos circuitos que no se hablan.
No llegó a pasar porque ningún gasto usa `concepto_id` todavía.

*Por qué el concepto no es el lugar.* `devengar_sueldos_socios` **no crea un
`gasto`**: llama a `crear_asiento` directo, con `GAS_SOCIOS` al debe y
`tercero_id` = el socio. Los asientos de la cuenta tienen `origen_id` en null y
no hay ningún `gasto` que apunte a `GAS_SOCIOS`. Y `asiento_linea` no tiene
columna de concepto: es `(asiento_id, cuenta_id, debe, haber, tercero_id)`. El
concepto llega al diario sólo por `asiento.origen_id → gasto → cat_gasto`, y el
módulo de socios no pasa por ahí.

Entonces un concepto «Sueldo Agus» sería un lugar que **nadie escribe nunca** —
el devengo mensual no lo mira— y que **cualquiera puede cargar a mano** desde
`/gastos`. Es la misma duplicación, mudada de cuenta.

*Lo que sí resuelve la pregunta.* «Ver el sueldo de cada socio por separado» se
contesta **agrupando `asiento_linea` por `tercero_id`**, que ya está en cada
línea que el devengo escribe. El expandible de `GAS_SOCIOS` en Resultados sale
de ahí, no del catálogo — y como el dato es el que el propio asiento guarda, no
se puede desincronizar.

> Es la tercera de las tres opciones que se habían planteado para el ítem de
> sueldos (`tercero` tipo empleado · tabla `empleado` · derivar de
> `tercero_id`). Para **socios** queda decidida acá. Para los **empleados** que
> hoy son conceptos a mano —Augusto, Estudio contable, Jero, Mati, Rodri, Yas—
> sigue abierta: ninguno tiene otro circuito, así que el concepto no miente,
> pero tampoco hay un padrón de empleados del que salgan.

---

**~~Los financieros entran al P&L en el rediseño de Resultados~~ — CERRADA.**
`FIN_DIF_CAMBIO` tenía **$244.500** de resultado que no aparecían en ninguna
pantalla: las vistas de resultado filtraban `tipo in ('ingreso','egreso')` y lo
dejaban fuera. Una diferencia de cambio es resultado del ejercicio y tiene que
verse.

**Entró en `v_pl_mensual`**, que nació incluyendo las tres clases de cuenta. Era
el 3.4 del reordenamiento del plan de cuentas, y se resolvió acá.

*El signo.* Para una cuenta de resultado, **haber = ganancia**: la fórmula es
`haber − debe`, la misma que un ingreso. Una diferencia desfavorable va al debe
y resta sola, sin condicionales — por eso la vista resuelve el signo una sola
vez, con un `case` sobre `tipo`, y de ahí en más el monto ya viene con el signo
que suma al resultado.

*La reconciliación, verificada contra la base:*

| | |
|---|---|
| Ingresos (cobrados) | $23.012.000 |
| Egresos (devengados) | $25.437.000 |
| **Resultado operativo** | **−$2.425.000** |
| Diferencia de cambio | **+$244.500** |
| **Resultado con financieros** | **−$2.180.500** |

En la pantalla van como **tercer bloque**, «Resultado financiero», arriba de la
fila de resultado — así se lee que suman, sin mezclarse con los ingresos
operativos, que es lo que serían si se los metiera en ese bloque.

*Por qué no se hizo en el reordenamiento, que es donde estaba planificado.* Se
intentó y las dos mitades no cerraban:

· **`v_dashboard` no era el lugar.** Su `resultado` filtra `a.torneo_id = t.id`:
  es por TORNEO, no de la empresa. Y los asientos financieros tienen
  `torneo_id` **null** —una ganancia por tenencia de dólares no es de un
  torneo—, así que agregar `'financiero'` a su array **no habría cambiado un
  solo número**. Una migración sobre la pantalla de inicio que no hace nada es
  el peor tipo de cambio: riesgo sin beneficio. **No se tocó, y eso dejó de ser
  deuda: no es su lugar.**

· **Las dos vistas por-torneo no se podían dropear antes** de que existiera el
  reemplazo, porque las usaba `/resultados`. Se fueron en el mismo commit que
  la pantalla nueva, sin ventana rota.

---

**El resultado se mira a nivel empresa, no por torneo.** Con el rediseño de
Resultados se dropearon **`v_resultado_producto`** y **`v_comparador_torneos`**,
que partían el resultado por torneo con «Estructura permanente» como una fila
más. Contradecían el principio de negocio unificado (§1.d): no hay rentabilidad
por torneo, predio ni categoría, porque repartir los costos compartidos exigiría
un criterio arbitrario.

> **`v_comparador_torneos` además estaba mal.** Multiplicaba los importes por la
> cantidad de equipos —$481.936.000 de ingresos de Clausura contra los
> $17.212.000 reales, factor exacto 28— por un fan-out de join contra
> `equipo_torneo`. **No se arregló: se borró.** Arreglar una vista que no
> debería existir es trabajo que después hay que tirar.

*Lo que las reemplaza* son cuatro vistas a nivel empresa, y el reparto entre
ellas responde a una sola regla — **cada número que la pantalla muestra sale de
una vista, incluidas las filas de total**:

| Vista | Grano | Para qué |
|---|---|---|
| `v_pl_mensual` | año × mes × cuenta | La matriz. Los 12 meses generados, ceros donde no hubo movimiento |
| `v_pl_mensual_item` | + ítem | El desglose de cada egreso |
| `v_pl_mensual_total` | año × mes | Las filas «Total ingresos», «Total egresos» y «Resultado» |
| `v_pl_kpi` | año | El encabezado. Suma `v_pl_mensual_total` |

`v_pl_mensual_total` apareció construyendo la pantalla, no diseñando las vistas:
sin ella la matriz tenía que **sumar sus propias columnas en el cliente** para
dibujar las filas de total — el `.reduce()` que la regla 1 prohíbe, y justo
donde aparecen las diferencias de centavos contra el encabezado.

*Dos decisiones de la matriz que no son obvias:*

· **Los 12 meses se generan; las cuentas vacías no se muestran.** Un mes en cero
  es información —el negocio estuvo quieto— y por eso la columna existe aunque
  `periodo` no tenga la fila. Una CUENTA con doce ceros es otra cosa: no informa
  nada y dejaría la matriz mayormente blanca.

· **El ítem de `GAS_SOCIOS` sale de `tercero_id`**, no de un concepto de gasto —
  la decisión que se tomó al sacar a Agus y Guille del catálogo de sueldos. El
  expandible de esa cuenta se abre por socio, con el dato que el propio asiento
  guarda.

---

**Un `<select>` de filtro tiene que mostrar lo que la pantalla está mostrando.**
`FiltrosUrl` sacaba su valor sólo de la query string, así que en las pantallas
donde **no existe un "todos" real** —el año de Resultados, el torneo del
Tarifario— el control quedaba en la opción vacía («Año…») mientras la tabla de
abajo mostraba 2026. El control mentía sobre lo que se estaba viendo.

Se agregó `valorPorDefecto` al tipo `FiltroUrl`: la pantalla dice cuál eligió
cuando la URL no trae nada. **No cambia la URL** —sigue limpia hasta que alguien
elija— sólo lo que el control refleja.

Apareció construyendo Resultados y afectaba también al Tarifario, así que se
arregló en los dos.

> Y en `KpiCard` se agregó el formato `porcentaje`. No existía: el único
> antecedente —la tasa de cobranza— usa `entero`, que habría redondeado un
> margen de **−9,5 % a −10 %**. En una cifra de encabezado, medio punto de
> facturación es un dato, no una aproximación.

---

**Los nombres de archivo de las migraciones tienen que ser la versión que la
base registra.** Nueve migraciones de agosto quedaron en el repo con un
timestamp elegido a mano —`20260812190000_…`— mientras la base había registrado
otro —`20260812141034_…`—, porque al aplicarlas por MCP el timestamp lo pone la
herramienta.

El orden relativo era el mismo, así que una reconstrucción daba lo mismo. El
problema es otro: **el CLI compara por versión**, así que `supabase db push`
habría visto nueve migraciones sin aplicar e intentado correrlas de nuevo. En
este caso no habrían hecho daño —son `create or replace view` y `update`/`delete`
acotados por nombres que ya no existen— pero eso es suerte, no diseño.

Se renombraron los nueve archivos a su versión registrada. *Para las que
vengan:* si se aplica por MCP, el archivo se nombra con la versión que quedó
registrada, no con una inventada antes.

> Se suma a la deuda de reproducibilidad de § Abiertas: la base ya no se podía
> reconstruir desde `migrations/` por las cuentas que faltan, y encima el repo
> y la base numeraban distinto.

---

## Abiertas

Pendientes de definir con el cliente. **No inventar la respuesta:**

- Nivel de automatización de reclamos (manual / mixto / automático)
- Umbral de activación de bienes (lo definen con el estudio contable)
- Proveedor de mail y dominio de envío
- Formato del recibo: si necesita numeración formal

### Técnicas

No dependen del cliente; se resuelven entre nosotros.

**⚠ La base NO se puede reconstruir desde `supabase/migrations/`.** Es la deuda
más seria de las abiertas, y se descubrió relevando si `seed.sql` seguía vivo
(reordenamiento del plan de cuentas, 3.3).

Corriendo las 54 migraciones sobre una base limpia, el plan de cuentas queda con
**unas 5 cuentas en vez de 29**. `001_schema.sql` crea la tabla `cuenta` y
**ninguna fila**: verificado, cero `insert into cuenta`. Las únicas altas en
migraciones son `GAS_SOCIOS`, `SOCIOS_A_PAGAR`, `DEUDORES_SPONSORS`,
`INGRESO_DIFERIDO` y `CAJA_CENTRAL`, cada una en la suya.

**Las otras trece —todas las de ingreso, casi todas las de egreso y las tres
cajas— viven sólo en `supabase/seed.sql`**, que ningún automatismo ejecuta:

· **No hay `supabase/config.toml`.** No es que le falte `[db.seed]`: el archivo
  no existe, así que `supabase start` y `supabase db reset` no tienen entorno
  local que levantar. El CLI se usa sólo linkeado a la base hosted, para
  `gen types` y aplicar migraciones.

· **El README documenta un flujo con `psql` que lista 3 migraciones** —`001`,
  `002`, `003`— más `seed.sql`. Hay **54** en el repo. Está desactualizado por
  51 y no reconstruye nada desde hace meses. (`arquitectura.md` §3.3 citaba
  además un `campa_schema.sql` que no existe; corregido al reordenar el plan.)

**La falla es silenciosa**, que es lo peor: aplicar las migraciones no da ningún
error. Rompe después, en el primer `crear_asiento`, con "cuenta no encontrada" —
un mensaje que habla de una cuenta y no de que falta medio plan.

Choca de frente con el checklist de CLAUDE.md, *"si tocaste SQL: la migración
corre sobre base limpia"*: **la línea de base misma no es reproducible**. No se
notó nunca porque no hay entorno local — todo se aplicó incremental sobre la
hosted, donde las cuentas ya estaban desde el primer día.

*Opciones, para decidir después:*

- **(a) Una migración que siembre el plan de cuentas** con `on conflict do
  nothing`. Lo vuelve reproducible **sin tocar la base hosted**: sobre la
  existente no hace nada, sobre una limpia lo crea. Es la que menos riesgo
  tiene.
- **(b) Formalizar `seed.sql` como parte del arranque** y arreglar el README.
  Más barato de escribir, pero deja el plan de cuentas partido entre dos
  fuentes y depende de que alguien se acuerde de correr el seed.

*Cuándo:* **ahora es el momento.** El reordenamiento del plan de cuentas ya
cerró (28 cuentas, categorías reordenadas), así que la foto final está quieta:
una migración que la siembre con `on conflict do nothing` la deja consolidada,
en vez de ser el resultado de un seed viejo más cinco migraciones de
corrección. Cuanto más se demore, más larga es la cadena a replicar.

---

**Los sueldos de empleados son seis nombres escritos a mano, sin padrón detrás.**
«Sueldos administrativos» tiene como conceptos a Augusto, Estudio contable,
Jero, Mati, Rodri y Yas. Ninguno es `tercero`, ninguno tiene otro circuito que
lo pague, y ninguno tiene gastos ni presupuesto cargados — o sea que **hoy no
duplican nada**. (Los que sí duplicaban, Agus y Guille, se sacaron: eran socios
con su propio devengo.)

Pero que no dupliquen no los hace un buen modelo. Son texto libre en un catálogo:
nada impide escribir el mismo nombre dos veces con distinta grafía, ni
relacionarlos con quien efectivamente cobra. «Mati» además existe como usuario
del sistema (`mati@campa.local`) sin ninguna relación entre los dos registros.

*Las tres opciones,* de menor a mayor: un `tercero` tipo `empleado`; una tabla
`empleado` con sueldo versionado, espejo de `sueldo_socio`; o que el ítem del
P&L salga de `asiento_linea.tercero_id`, como ya quedó decidido para socios.

*Cuándo:* cuando se cargue el primer gasto de sueldo de verdad. Hasta entonces
son inofensivos, y elegir sin saber cómo se van a pagar sería adivinar.

---

**Política de ejercicios futuros.** Hoy el ejercicio se carga a mano: hay un
seed para 2026 (`supabase/seeds/00_ejercicio_2026.sql`) y nada más.

`periodo_de_fecha()` crea los períodos mensuales bajo demanda, pero **aborta
si no encuentra un ejercicio que contenga la fecha**. Como `crear_asiento()`
lo llama, y con percibido puro todo cobro emite asiento, sin ejercicio no se
puede cobrar. Es un bloqueo duro, no una advertencia.

Hay que decidir entre:

- **Un seed por año**, cargado a mano. Explícito y auditable, pero alguien
  tiene que acordarse antes del primer movimiento del año.
- **Autocrearlo** en `periodo_de_fecha`, derivando el año calendario de la
  fecha. Nunca bloquea, pero toca una función del núcleo contable y crea
  ejercicios sin que nadie lo haya pedido.

*Cuándo:* antes de que aparezca el primer movimiento con fecha de 2027. No es
urgente, pero el síntoma si se olvida es un cobro que falla en producción con
un mensaje que habla de ejercicios, no de cobranza.

**~~Puerta `anular_gasto()`~~ — CERRADA.** Construida en la migración
`20260809141359_escritura_gastos.sql`, junto con `registrar_gasto` y
`pagar_gasto`. Contraasienta los dos asientos en orden inverso —pago primero,
devengo después— y limpia `pagado_at`, `medio_pago` y `asiento_pag_id`, que
era el **caso espejo** que esta entrada dejaba sin cubrir: anular el pago sin
el devengo mostraba la fila como `pagado` con el diario diciendo lo contrario.

Probada extremo a extremo contra la base: los cuatro asientos del circuito
netean 0 en las tres cuentas y la caja del predio vuelve al saldo previo.

> Esta entrada quedó marcada como pendiente **un commit de más**: se cerró en
> `701b22e` y se corrigió acá. Es exactamente lo que la regla 13 previene, y
> por eso queda anotado en vez de borrado.

**Una mejora para cuando se toque `preview_cobro`.** No es urgente y el
componente `AsientoPreview` ya está listo para aprovecharla sin cambios.

**(a) Que devuelva el nombre de cuenta, no el código.** Hoy la función arma las
líneas con `'cuenta', v_cuenta_caja` y con los códigos `ING_INSCRIPCIONES` /
`ING_PARTIDOS`, así que al operador se le muestra literalmente
`CAJA_TRANSFERENCIA`. La tabla `cuenta` tiene el nombre bueno
(`Caja Transferencia`, `Ingresos por partidos`): alcanza con un join y agregar
la clave `nombre` al `jsonb_build_object`. El componente ya prefiere `nombre` y
cae al código si no viene.

**(b) Que el balance sea real y no un literal.** La función cierra con
`'total_haber', v_debe` —la misma variable que `total_debe`— y
`'balanceado', true` literal. O sea que los totales que se muestran no se
derivan de las líneas que se muestran, y **el badge no puede dar rojo nunca**.
No está mal —el asiento balancea por construcción y la función aborta antes si
la imputación no cuadra— pero el indicador hoy no informa nada. Derivar ambos
de las líneas efectivamente construidas convierte un adorno en una
verificación.

*Cuándo:* cuando se toque `preview_cobro` por cualquier otro motivo. **La otra
mitad de esta entrada ya se cumplió**: `preview_gasto` y `preview_pago_gasto`
nacieron con las dos cosas bien —devuelven `nombre` y derivan los totales de
las líneas—, y ese es el contrato que `leerPreviewAsiento` (`lib/db/preview.ts`)
fija para las que vengan. `preview_cobro` es la única que falta alinear.

**~~El sueldo vigente de un socio no está en ninguna vista~~ — CERRADA.**
`sueldo_socio` guarda el historial versionado y `sueldo_vigente(socio, fecha)`
lo resuelve, pero las dos vistas del módulo —`v_saldo_socio` y
`v_socio_detalle_mensual`— derivan de `SOCIOS_A_PAGAR` y no lo traían. La
pantalla mostraba devengado, retirado y saldo **sin el número que les da
contexto**: un saldo en cero no distingue "todavía no se devengó nada" de "se
retiró todo lo devengado".

Lo trae **`v_socio_lista`** (migración `20260812140000`), junto con
`vigente_desde`. **No** se agregó a `v_saldo_socio` como decía esta entrada: la
lista es una vista nueva y aditiva, y meterle una columna a `v_saldo_socio`
—que el detalle sigue usando— era tocar algo que anda para no crear algo que no
existía.

Se resolvió **antes** de lo que esta entrada preveía —decía "cuando se
construya la escritura"— porque la lista lo necesitaba primero: una fila por
socio sin el sueldo al lado no dice si el saldo es mucho o poco.

> **El precio, anotado donde se paga.** `v_socio_lista` resuelve el vigente con
> un `left join lateral` que **repite la regla** de `sueldo_vigente()` —la
> misma que usa `devengar_sueldos_socios` para decidir cuánto asentar—. Se
> eligió así para que el monto y la fecha salgan del MISMO renglón: llamando a
> la función para el monto y buscando la fecha aparte, podrían venir de filas
> distintas. **Si la regla cambia, se cambian las dos.** Verificado al aplicar
> que hoy coinciden en los dos socios.

---

**La pantalla de socios no escalaba, y se partió en lista + detalle.** Nació
como un bloque grande por socio —tres KpiCards y la tabla mensual completa,
apilados— y con **dos** socios y **tres** meses ya ocupaba más de una pantalla
(913px medidos, 1,12 pantallas). Es la misma forma que tenía sponsors antes de
partirse, y el mismo remedio.

Con un agravante que sponsors no tenía: **la tabla mensual no tiene techo**. Un
contrato de sponsor se termina; el sueldo de un socio se devenga todos los meses
mientras sea socio. `devengar_sueldos_socios` corre una vez por mes y
`v_socio_detalle_mensual` agrupa por período, así que son **12 filas por socio
por año, para siempre**. Un retiro no agrega fila: se suma al `retirado` del mes
que le toca.

`/socios` pasa a ser una fila por socio (539px, 0,66 pantallas con los mismos
datos) y `/socios/[socioId]` se queda con el mes a mes de ESE socio. Las dos
vistas viejas **no se tocaron**: el detalle las usa tal cual.

Dos decisiones de esas vistas que valen más que su código:

· **`saldo > 0` es el club debiéndole al socio; `saldo < 0` es el socio que
  retiró de más.** `SOCIOS_A_PAGAR` es pasivo, el devengo va al haber y el
  retiro al debe. El que pide atención es el negativo, y por eso gana el orden
  de prioridad del estado. Que ese caso exista no es un bug:
  `crear_retiro_socio` no valida saldo suficiente a propósito (decisión 71) —
  pero tenía que verse, y no se veía.

· **`saldo_a_favor` y `saldo_en_contra` van separados, no neteados.** Un club
  que le debe $3.400.000 a uno y al que otro le debe $450.000 no está en la
  misma situación que uno con $2.950.000 netos: son dos movimientos de plata en
  direcciones opuestas, con dos conversaciones distintas. El neto se lee
  restando; las dos mitades de un neto no se recuperan.

> **El botón "Registrar retiro" está en el detalle y deshabilitado, no
> ausente.** Facu marcó que no se veía cómo registrar un retiro. El lugar
> marcado contesta eso sin fingir que ya se puede: `crear_retiro_socio` existe
> y está completa, pero es una de las seis funciones sin `p_created_by`, así
> que desde que se sacó el fallback **no puede escribir sin sesión** — un botón
> cableado hoy explota con "permission denied for table users". La escritura
> —formulario, Server Action y el parámetro de la función— va junta, y es otro
> carril.

**~~Las puertas de socios, sponsors y USD no aceptan responsable~~ — PARCIAL.**
Se resolvió para las dos que lo necesitaban de verdad: `devengar_sueldos_socios`
y `devengar_sponsors` ahora aceptan `p_created_by` y lo propagan (migración
`20260810185405`). Sin eso, al sacar el fallback quedaban sin forma de escribir.

Las otras seis —`crear_retiro_socio`, `crear_contrato_sponsor`,
`registrar_cobro_sponsor`, `cargar_cuotas_sponsor`, `comprar_usd`, `vender_usd`—
**siguen sin el parámetro**, y desde que se sacó el fallback **no pueden escribir
sin sesión**. No molesta hoy porque ninguna tiene pantalla: se disparan a mano
por SQL, y ahí hay que pasar el responsable de otra forma o darles el parámetro.

*Cuándo:* cuando cada una tenga UI. El patrón ya está fijado por gastos.

> **El `p_created_by` de los devengos es transitorio.** Un proceso mensual no
> tiene operador: lo correcto es un **usuario de sistema**, y eso depende del
> modelo de roles del bloque 10 completo. Mientras tanto lo pasa quien dispara
> el proceso, que hoy es honesto porque alguien aprieta el botón. Las opciones
> —usuario de sistema en `auth.users`, `created_by` nullable, o las dos— quedan
> abiertas.

**`envio` quedó sin uso y se superpone con `reclamo`.** `envio` existe desde el
schema inicial —`tercero_id`, `plantilla`, `destinatario`, `payload`,
`enviado_at`, `enviado_por`— con **0 filas**, para registrar mails mandados.

El módulo de reclamos construyó `reclamo`, que cubre eso y más: el canal
`manual` —un reclamo por teléfono también es un reclamo—, el monto y las cuotas
congelados, y los `cuota_ids` reclamados. Hoy hay **dos tablas para una parte
del mismo problema**.

*Cómo apareció:* al relevar el módulo miré `plantilla_mail` y `lib/mail/`, y no
`envio`. Debí haberla visto antes de diseñar `reclamo`.

Las salidas posibles: borrar `envio` y que `reclamo` sea el único registro; o
dejarla para los envíos que **no** son reclamos —`recibo_pago`, `aviso_7dias`—,
que hoy tampoco se mandan. La segunda tiene sentido si esos avisos se
construyen; si no, es una tabla vacía que confunde.

*Cuándo:* cuando se construya el primer envío que no sea un reclamo. Mientras
tanto no molesta, pero está anotada para que nadie la use pensando que es la vía
del reclamo.

**`fn_audit` audita cambios que no cambian nada.** El trigger inserta una fila
en `audit_log` por cada UPDATE, sin comparar antes con después. Resultado
medido sobre 1.134 eventos:

| | eventos | con `campos_cambiados = 0` |
|---|---|---|
| UPDATE | 865 | **727** |
| DELETE | 269 | 0 |

**El 64% del log no audita nada**, y **719 de esos 727 son `equipo_torneo`**:
la ficha se reescribe con los mismos valores cada vez que se toca una cuota
suya. Los que sí cambian algo cambian lo esperable — `pagado_at` 47 veces,
`total_plan` 38, `total_facturado` 37.

El arreglo es comparar en el trigger y no escribir si `old` y `new` son
iguales, algo así como `if to_jsonb(old) is not distinct from to_jsonb(new)
then return new; end if;` antes del insert.

**Bug latente en el mismo trigger:** `fn_audit` guarda `nuevo` **sólo en
UPDATE** (`case when TG_OP = 'UPDATE' then to_jsonb(new) end`). Hoy no molesta
porque los triggers están declarados sólo para UPDATE y DELETE, así que no hay
INSERTs auditados. Pero **el día que se agregue INSERT al trigger, cada alta se
guardaría con los dos snapshots en null**: sin `anterior` porque no lo había, y
sin `nuevo` porque el `case` no lo cubre. Quedaría un evento que dice "se creó
algo" sin decir qué, y `v_auditoria` lo contaría como cero campos — o sea que
el filtro "sólo con cambios" escondería las altas.

`v_auditoria` (migración `20260809171605`) **no arregla nada de esto**: lo hace
visible. Cuenta el diff en SQL para que la pantalla pueda filtrar el ruido, y
deja los DELETE siempre por encima de cero para que un borrado nunca se
confunda con un no-op.

*Cuándo:* cuando se toque el trigger. No es urgente —el log de más no rompe
nada, sólo abulta— pero cuanto más tarde, más filas vacías hay que filtrar. El
bug del INSERT sí hay que resolverlo **antes** de auditar altas, no después.
