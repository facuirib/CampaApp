> **Fuente de diseño · Módulo Cashflow.** Aprobado, pendiente de construir.
>
> La pieza que integra todo, y la última grande de backend. Mayormente lectura:
> junta en una línea de tiempo las fuentes que los módulos anteriores ya
> producen. Sin estructura nueva.
>
> Este archivo es el **camino**: el razonamiento y los trade-offs. El
> **resultado** vive en `docs/arquitectura.md` §3.10 y en `docs/decisiones.md`
> (decisiones 83-88). Ante una diferencia **manda el resultado**.
>
> ---
>
> **⚠ Un agujero del diseño, detectado al integrarlo.** El documento dice
> "gasto PAGADO → REAL, sale de ESTIMADO", y **eso no ocurre solo**: ESTIMADO
> sale del **presupuesto**, no de los gastos, y pagar un gasto no achica el
> presupuesto. Con 100.000 presupuestados para agosto y 100.000 pagados en
> agosto, el flujo mostraría 200.000.
>
> La asimetría es de fondo: una **cuota** es un compromiso individual con
> estado propio —por eso del lado de ingresos la regla sí funciona sola—
> mientras que una **línea de presupuesto** es un agregado sin estado. No hay
> nada que migre.
>
> Resolución propuesta: **cortar la línea de tiempo por fecha** (pasado REAL,
> futuro proyectado), que hace la exclusión estructural. Se cierra al construir.

---

# Módulo Cashflow — Flujo de fondos con niveles de certeza

> Draft para integrar a arquitectura.md y decisiones.md. Diseño aprobado con Facu.
> La pieza que integra todo. Mayormente LECTURA: junta las fuentes que ya existen en
> una línea de tiempo. Reemplaza la v_flujo_proyectado de §3.10 (que no compila).

## El objetivo (requisito de Facu)

Que Campa vea qué plata hay y va a haber, semana a semana, y que CADA NÚMERO diga de
dónde viene y cuán seguro es. Nunca duplicar estimaciones. Simple, claro, seguro.

## Los tres niveles de certeza (decisión central)

Cada flujo cae en UN SOLO nivel, determinado por su estado — automático y objetivo,
sin clasificación a mano:

| Nivel | Qué es | Fuente | Fecha |
|-------|--------|--------|-------|
| REAL | Ya pasó, está en el diario | movimientos de cajas | asiento.fecha |
| COMPROMETIDO | Pactado, fecha y monto ciertos | cuotas equipos (saldo) + sponsors | vence_at / fecha_cobro |
| ESTIMADO | Cálculo, sin fecha cierta | presupuesto distribuido | según calendario |

La confianza es una COLUMNA del modelo (cada flujo sabe su nivel), no una convención
de la pantalla. La vista agrupa por nivel.

## La regla anti-duplicación (el corazón de "números seguros")

Un flujo tiene UN nivel según su estado, y los niveles son excluyentes:
- Cuota COBRADA → REAL (en el diario). Su saldo pendiente es 0 → sale de COMPROMETIDO.
- Gasto PAGADO → REAL. Sale de ESTIMADO.
- La transición es automática: al concretarse, migra de proyectado a real. NUNCA se
  suma en dos niveles.
Por eso no se duplica: el estado determina el nivel, y un flujo tiene un solo estado.

## REAL — movimientos de caja (todas las cajas agregadas)

Sale de las líneas de las cuentas de caja (CAJA_EFECTIVO, CAJA_TRANSFERENCIA,
CAJA_CENTRAL, CAJA_USD — las que apunta caja.cuenta_id), por fecha de asiento.

Se agregan TODAS las cajas: así los traslados internos (predio→central, compra/venta
USD) se netean solos y no ensucian el flujo (mueven plata entre dos cajas, suman cero
en el agregado). Decisión: el flujo real es el movimiento neto de la posición de caja,
no de cada caja por separado. (El desglose por caja, si se quiere, es otra vista.)

Ojo: es por CAJA, no por tipo ingreso/egreso. Los gastos van por devengo y los sueldos
de socios también (GAS_*, SOCIOS_A_PAGAR no son caja). Solo se cuenta lo que tocó caja.

## COMPROMETIDO — lo pactado con fecha

Ingresos:
- Cuotas de equipos: v_estado_cuota, el SALDO pendiente (no el monto — hay parciales),
  con vence_at. EXCLUYE cuotas de jornada suspendida (decisión 51 — no se proyectan).
- Cuotas de sponsors: v_cuotas_sponsor_futuras (fecha_cobro, monto, cobrado_at null).
  La fuente más limpia del sistema (fechas y montos ciertos, validados).

Egresos comprometidos con fecha (si existen): compromiso (vence_at, sentido pagar),
cheque (fecha_cobro). Hoy compromiso está casi vacío (solo moratorias) — se suma lo
que haya.

## ESTIMADO — el presupuesto distribuido según el calendario

v_presupuesto_total da un TOTAL sin dimensión temporal. Para la línea de tiempo se
distribuye usando el CALENDARIO que ya existe:
- Costos por_partido → se reparten en las fechas de las jornadas (cada jornada trae
  sus partidos × costo).
- Costos por_dia_cancha → se reparten en los días-cancha (dia_cancha, sus fechas).
- Costos fijos (por_mes) → parejo por mes.
Así el estimado de egresos cae donde el calendario dice que ocurre la actividad, no
en un bulto. Reusa el calendario del rediseño.

Nota: el ESTIMADO es solo egresos (los ingresos proyectados ya son COMPROMETIDO —
cuotas y sponsors tienen fecha). Si un ingreso no tuviera fecha, sería estimado, pero
hoy todos los ingresos proyectados están pautados.

## Presentación

- Por SEMANA: date_trunc('week', fecha) sobre las fechas de los flujos. Sin tabla de
  semanas — una semana no es período contable y no debe serlo. Y/o por mes (periodo).
- Los tres niveles sumados por separado + saldo proyectado (acumulado).
- ALERTA de quiebre: si el saldo proyectado perfora cero en alguna semana (§3.16).
- Drill-down: qué compone cada celda (qué equipos pagan, qué sponsors, qué costos).

## §3.10 — reemplazada

v_flujo_proyectado de §3.10 NO existe y su SQL no compila (referencia cat_gasto.grupo,
presupuesto_linea.monto_mensual/cantidad_x_fecha, jornada.torneo_id — todo eliminado).
Se REEMPLAZA por completo con este modelo de 3 niveles. Anotar como reemplazada, igual
que la revaluación en §3.7. No copiar nada del SQL viejo.

## Estructura

Mayormente vistas. Probablemente:
- v_cashflow_real (movimientos de caja por fecha/semana).
- v_cashflow_comprometido (cuotas equipos saldo + sponsors + compromisos con fecha).
- v_cashflow_estimado (presupuesto distribuido según calendario).
- v_cashflow (unión de los tres con columna nivel, por semana/mes, saldo acumulado,
  alerta de quiebre).
Sin tablas nuevas (todo se deriva). La confianza (nivel) es una columna calculada por
cada sub-vista según su naturaleza.

## Decisiones nuevas para decisiones.md

- Cashflow con 3 niveles de certeza (REAL/COMPROMETIDO/ESTIMADO), automáticos.
- Anti-duplicación por estado: un flujo en un solo nivel; al concretarse migra.
- REAL = movimiento de cajas agregadas (traslados internos se netean).
- ESTIMADO = presupuesto distribuido según el calendario (jornadas/días-cancha/mes).
- Semana derivada de fechas (date_trunc), sin tabla de semanas.
- §3.10 v_flujo_proyectado reemplazada por completo.

## Alcance

Backend: 3-4 vistas, sin estructura nueva. Es integración y presentación de fuentes
existentes. La pantalla (con drill-down, alerta de quiebre) es front de Horacio — pero
las vistas le dan todo lo que necesita. Es la pieza que corona la capa de backend.

## Lo que se cuida

- Regla A2: todo sale del libro diario y las vistas existentes, nada se inventa.
- No duplicar: la regla de estado garantiza un flujo en un solo nivel.
- Percibido puro (equipos) y los tres patrones de reconocimiento, respetados: el
  cashflow LEE lo que cada uno produjo, no cambia cómo se reconoce.
- Los traslados internos (predio→central, USD) no ensucian: se netean en el agregado.
