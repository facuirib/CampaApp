# Decisiones cerradas

Cada una se discutió y se cerró. **No reabrir sin motivo nuevo** — si aparece uno,
agregar acá la fecha y la razón del cambio.

---

## Contables

**1 · Devengo progresivo por vencimiento** *(actualizada en el Draft 11)*
Armar la ficha crea todas las cuotas pero no factura nada. Cada cuota se devenga
al vencer: Deudores al debe, Ingresos al haber, por el monto de esa cuota. Cada
pago solo cancela Deudores; Ingresos no se vuelve a tocar.
**La deuda de un equipo es su mora:** cuotas vencidas e impagas. El cashflow sale
de la estructura de vencimientos, no de sumar fichas.
*Por qué:* sin devengo no se puede proyectar caja — no se sabe qué falta cobrar.
Progresivo y no total porque en la cobranza solo se reclama lo vencido, y devengar
el torneo entero al armar las fichas distorsionaba el P&L sin aportar información
de caja.
*Reemplaza:* la Opción A (deuda total al armar la ficha), vigente hasta el Draft 10.
Razonamiento completo en `arquitectura.md` §8 → Decisiones reemplazadas.
*Abierto:* qué dispara el asiento al vencer la cuota — `arquitectura.md` §3.4.

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

## Abiertas

Pendientes de definir con el cliente. **No inventar la respuesta:**

- Nivel de automatización de reclamos (manual / mixto / automático)
- Umbral de activación de bienes (lo definen con el estudio contable)
- Proveedor de mail y dominio de envío
- Formato del recibo: si necesita numeración formal
