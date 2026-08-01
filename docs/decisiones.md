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

**20 · Arqueo con ajuste que afecta la caja**
La diferencia genera asiento, no una nota al margen.

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

**27 · `total_facturado` sincronizado por trigger**
Se mantiene la columna pero un trigger la recalcula ante cualquier cambio en cuota.
*Por qué:* era un número duplicado sin nada que lo mantuviera al día.

**28 · `pago.cuota_id` deprecada**
No se escribe. Se elimina cuando el bloque 3 (Cobranza) esté terminado.
*Por qué:* con `pago_imputacion` hay dos caminos para lo mismo.

---

## Diseño del cobro

Tomadas, **pendientes de implementar**. Ninguna existe todavía en la base.
Detalle y razonamiento en `arquitectura.md` §3.4 → El circuito de cobro.

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
el precio. Y como `total_facturado` se recalcula por trigger desde las cuotas
(decisión 27), sigue siendo correcto después de un ajuste manual sin tener que
consultar el tarifario.

---

## Calendario por serie

Tomadas, **pendientes de construir**. Ninguna existe todavía en la base, que
sigue con `jornada` por género y vacía. Detalle y razonamiento en
`arquitectura.md` §3.5 y §3.3.

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

**45 · La cantidad de partidos se deriva, no se carga**
`partidos por jornada = equipos de la serie ÷ 2`. 16 equipos dan 8 partidos, 14
dan 7. Sin excepciones conocidas.
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
---

## Abiertas

Pendientes de definir con el cliente. **No inventar la respuesta:**

- Nivel de automatización de reclamos (manual / mixto / automático)
- Umbral de activación de bienes (lo definen con el estudio contable)
- Proveedor de mail y dominio de envío
- Formato del recibo: si necesita numeración formal

### Técnicas

No dependen del cliente; se resuelven entre nosotros.

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
