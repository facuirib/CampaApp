> **Fuente de diseño · Módulo de socios.** **Ya implementada.**
>
> Primer módulo posterior al rediseño calendario-por-serie. Introduce dos
> patrones que el sistema no tenía: parámetro versionado con historial, y
> proceso mensual que escribe solo.
>
> Este archivo es el **camino**: el razonamiento y los trade-offs. El
> **resultado** vive en `docs/arquitectura.md` §3.19 y en `docs/decisiones.md`
> (decisiones 68-72). Ante una diferencia **manda el resultado**.
>
> Resultado: `arquitectura.md` §3.19 · decisiones 68-72
> Migración: `20260802113135_modulo_socios` · Seed: `03_socios.sql`
>
> ---
>
> **⚠ Una corrección posterior a la aprobación**, marcada en el cuerpo como
> `[CORREGIDO]`. El borrador decía que `GAS_SOCIOS` **baja la contribución del
> torneo**; con las reglas vigentes eso no puede pasar. El sueldo de un socio es
> **estructura permanente** —existe todos los meses, haya torneo o no— e
> imputarlo a un torneo exigiría prorratearlo entre los que corren ese mes, que
> es exactamente lo que la **decisión 5** prohíbe. El asiento va con
> `torneo_id = NULL` y cae bajo "Estructura permanente": baja el **resultado de
> la empresa**, no la contribución del torneo. Confirmado con Facu (Opción 1)
> antes de aplicar.
>
> Es la única edición hecha sobre el texto aprobado, y va marcada en vez de
> reescrita en silencio: si el "camino" se sanea para que parezca que siempre
> supo la respuesta, deja de servir para entender cómo se llegó.

---

# Módulo de Socios

> Draft para integrar a arquitectura.md y decisiones.md. Diseño aprobado con Facu.
> Primer módulo post-rediseño. Introduce dos patrones nuevos: parámetro versionado
> con historial, y proceso mensual que escribe solo.

## El negocio

Los socios (Guille, Agus — dueños) tienen un sueldo mensual acordado. Retiran plata
de la caja cuando quieren. El sistema lleva la cuenta: cuánto se les devengó vs
cuánto retiraron, y el saldo a favor (o en contra) acumulado.

- Sueldo = fijo mensual (no reparto de ganancias). Puede cambiar en el tiempo.
- Se acumula: remanente no retirado queda a favor, se retira cuando el socio quiera.
- Retirar de más se descuenta del saldo (queda en contra).
- Saldo corriente acumulado, no reseteo mensual.

## Forma B — devengo (NO percibido puro)

A diferencia de los ingresos de equipos (percibido puro), el sueldo del socio SE
DEVENGA. Razón: es un compromiso cierto del negocio (se acordó pagarlo), existe cada
mes aunque no se retire. No registrarlo distorsiona: la caja parece toda del negocio
cuando parte ya está comprometida con los socios.

- Ingreso de equipo: percibido puro (puede no pagar → no se registra hasta cobrar).
- Sueldo de socio: devengo (compromiso cierto → se registra cada mes).
Son situaciones distintas y merecen tratamiento distinto.

## Los dos asientos

Devengo (mensual, automático):
    GAS_SOCIOS       debe   X      (egreso — baja el resultado de la EMPRESA)   [CORREGIDO]
    SOCIOS_A_PAGAR   haber  X      (pasivo — lo que se le debe al socio)

Retiro (cuando el socio saca plata):
    SOCIOS_A_PAGAR   debe   X      (cancela el pasivo)
    <caja>           haber  X      (sale la plata)

Saldo a favor del socio = saldo de SOCIOS_A_PAGAR imputado a ese socio
(devengado − retirado). Positivo = a favor; negativo = retiró de más.

## Cuentas nuevas (decisión: egreso propio)

- GAS_SOCIOS (tipo egreso) — el sueldo del socio BAJA el resultado de la EMPRESA
  [CORREGIDO: el borrador decía "la contribución del torneo"], en cuenta propia,
  separada de GAS_SUELDOS (empleados). Así se lee el impacto y se distingue de
  sueldos operativos. El asiento va con torneo_id NULL = estructura permanente,
  porque imputarlo a un torneo exigiría el prorrateo que la decisión 5 prohíbe.
  [Decisión de Facu: egreso, no patrimonio. El sueldo de socios se trata como costo
  del negocio, no como distribución de utilidad. [CORREGIDO: la frase original decía
  que la rentabilidad del torneo se ve después de los sueldos de socios; en realidad
  la contribución de cada torneo queda intacta y lo que baja es el resultado de la
  empresa.]]
- SOCIOS_A_PAGAR (tipo pasivo) — el pasivo devengado no retirado.

El tipo de cuenta decide el P&L solo (v_resultado_producto filtra ingreso/egreso).
GAS_SOCIOS como egreso aparece; si fuera patrimonio no aparecería. No se toca ninguna
vista.

## NO mezclar con el fondo de inversión (§3.15)

El fondo de inversión ya modela plata de socios, pero distinto: colocación/rescate
contra FONDO_INVERSION, sin tocar resultado (movimiento de fondos). Un retiro de
sueldo (cancela pasivo devengado) ≠ un rescate de fondo (mueve respaldo). Cuentas y
conceptos SEPARADOS. Si terminaran en la misma cuenta o indicador, v_dependencia_fondo
dejaría de significar lo que dice.

## Sueldo acordado versionado (patrón nuevo #1)

Primer parámetro versionado de verdad del sistema (config_contable es una vigencia
degenerada de 1 fila sin historial — no sirve de molde).

  sueldo_socio (id, socio_id → tercero, monto numeric NN, vigente_desde date NN,
                created_by, created_at)

El sueldo vigente en un mes = el de mayor vigente_desde <= fin de ese mes. Cambiar
el sueldo = insertar una fila nueva con nueva vigencia. El historial permite recalcular
meses viejos con el sueldo que regía entonces.

## Devengo automático (patrón nuevo #2)

Primer proceso que escribe solo (el precedente, proponer_amortizaciones, propone y el
operador confirma — decisión 23). Justificación: el sueldo es monto acordado y conocido,
no una estimación como la amortización. Devengar directo es defendible.

  devengar_sueldos_socios(periodo_id) → int (cuántos devengó)
  - Por cada socio con sueldo vigente en ese período: asiento GAS_SOCIOS / SOCIOS_A_PAGAR
    por el monto vigente.
  - Idempotente: unique (socio_id, periodo_id) en una tabla devengo_socio (o marca),
    not exists antes de insertar. Correrlo dos veces no duplica.
  - Se corre POR PERÍODO explícitamente (no cron invisible). Función idempotente que
    alguien dispara al cerrar/procesar el mes.
  - periodo_de_fecha / periodo ya existen como ancla. Aborta si el período está cerrado.

## El retiro

Asiento SOCIOS_A_PAGAR (debe) / caja (haber). La caja:
- CAJA_TRANSFERENCIA o CAJA_CENTRAL → no requiere predio (camino natural).
- CAJA_EFECTIVO de un predio → el asiento declara el predio (si no, el arqueo de ese
  día no cuadra). crear_asiento ya lo exige.
Función crear_retiro_socio(socio_id, monto, medio, fecha, predio_id opcional) o vía
el registrador de asientos general — decidir en construcción.

## Las vistas (lo que se lee)

- v_saldo_socio: saldo actual por socio (Σ SOCIOS_A_PAGAR del socio). A favor / en contra.
- v_socio_detalle_mensual: por socio y período — devengado, retirado, saldo acumulado.
  Las dos cosas que Facu pidió ver: saldo actual + detalle mes a mes.

## Guille y Agus

Se cargan como tercero tipo 'socio' (el tipo ya existe en el CHECK). No hace falta
tabla socio (§3.4: equipos/sponsors/socios comparten mecánica). Seed o alta manual.

## Decisiones nuevas para decisiones.md

- Sueldo de socio por Forma B (devengo), a diferencia de ingresos (percibido puro).
- Cuenta GAS_SOCIOS (egreso propio) — baja el resultado de la empresa [CORREGIDO:
  decía "baja contribución"], separada de empleados, imputada a estructura permanente.
- Sueldo acordado versionado con historial (primer parámetro versionado real).
- Devengo mensual escribe solo (idempotente por período) — rompe con el precedente
  de amortización que propone; justificado porque el sueldo es cierto, no estimado.
- Retiro de sueldo separado del fondo de inversión (cuentas/conceptos distintos).

## Alcance

Backend: 2 cuentas, tabla sueldo_socio versionada, devengar_sueldos_socios, el retiro,
2 vistas, carga de Guille/Agus. La pantalla (cargar sueldo, registrar retiro, ver
saldos) es front de Horacio después. Módulo liviano comparado con el rediseño.

## Lo que se mantiene

- Regla A2: los saldos salen del libro diario (SOCIOS_A_PAGAR), no de cálculos aparte.
- Percibido puro intacto para ingresos de equipos.
- crear_asiento sin cambios (ya expresa los dos asientos, origen 'socio' ya válido).
