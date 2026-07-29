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
*Por qué:* el arqueo es por jornada + predio, y hay dos predios.

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

## Abiertas

Pendientes de definir con el cliente. **No inventar la respuesta:**

- Nivel de automatización de reclamos (manual / mixto / automático)
- Umbral de activación de bienes (lo definen con el estudio contable)
- Proveedor de mail y dominio de envío
- Formato del recibo: si necesita numeración formal
