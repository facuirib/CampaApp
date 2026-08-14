> **Fuente de diseño · Módulo de sponsors.** **Ya implementado.**
>
> Segundo módulo de la capa societaria. Estrena el tercer patrón de
> reconocimiento del sistema: devengo lineal con cobro independiente.
>
> Este archivo es el **camino**: el razonamiento y los trade-offs. El
> **resultado** vive en `docs/arquitectura.md` §3.20 y en `docs/decisiones.md`
> (decisiones 73-77). Ante una diferencia **manda el resultado**.
>
> Resultado: `arquitectura.md` §3.20 · decisiones 73-77
> Migración: `20260802121935_modulo_sponsors`
>
> ---
>
> **Lo que se resolvió al construir**, marcado en el cuerpo como
> `[AL CONSTRUIR]`. No son errores del diseño: son preguntas que dejaba
> abiertas, más una que no había visto.
>
> · De las tres cuentas, **`ING_SPONSORS` ya existía**; se crearon dos.
> · **`DEUDORES_SPONSORS` va propia**, no reusando la `DEUDORES` genérica.
> · **`registrar_cobro_sponsor` es propio**, no reusa `registrar_cobro`.
> · **`v_estado_sponsor` va por contrato**, no por sponsor.
> · **El redondeo no era simple:** el último período devenga el remanente, o
>   `INGRESO_DIFERIDO` nunca cerraría en cero.

---

# Módulo de Sponsors

> Draft para integrar a arquitectura.md y decisiones.md. Diseño aprobado con Facu.
> Segundo módulo de la capa societaria. Estrena el tercer patrón de reconocimiento
> del sistema: devengo lineal (periodificación) con cobro independiente.

## El negocio

Sponsors = empresas que aportan plata al torneo a cambio de visibilidad. Firman un
contrato anual (cubre ambos torneos), por un monto total, con fechas de pago
concretas. El aporte se "gana" a lo largo del año (dan visibilidad todo el tiempo),
pero se cobra en cuotas puntuales.

## Tres patrones de reconocimiento en el sistema (contexto)

- Equipos → percibido puro (al cobrar; puede no pagar).
- Socios → devengo mensual (compromiso cierto, se devenga el sueldo cada mes).
- Sponsors → devengo LINEAL prorrateado (se reconoce el contrato repartido en los
  meses que cubre). NUEVO.
Cada uno refleja una naturaleza distinta. La asimetría es deliberada.

## Los DOS calendarios (el corazón del módulo)

Un contrato tiene dos líneas de tiempo que NO coinciden:

1. RECONOCIMIENTO (para el P&L) — parejo, mensual. Un contrato de 1.200.000 de
   ago-2026 a jul-2027 reconoce 100.000/mes los 12 meses. Responde "¿cuánto ganó el
   negocio este mes?".
2. COBRO (para el cashflow) — las cuotas cuando el sponsor paga. Ej: 400.000 en ago,
   dic, abr. Responde "¿cuándo entra la plata?".

Ejemplo (mismo contrato):
  Mes   Reconocido(P&L)   Entra(cashflow)
  Ago   100.000           400.000
  Sep   100.000           0
  ...   100.000           ...
  Dic   100.000           400.000
  Abr   100.000           400.000

El modelo lleva los dos calendarios SEPARADOS.

## Contabilidad: tres momentos, tres asientos, cuentas que no se pisan

Al FIRMAR (registra la cuenta por cobrar y el ingreso diferido):
    DEUDORES_SPONSORS   debe   total     (nos deben todo el contrato)
    INGRESO_DIFERIDO    haber  total     (pasivo: ingreso aún no ganado)
  (No hay ingreso en P&L todavía — se firmó pero no se ganó nada aún.)

Cada MES (devengo lineal, proceso automático):
    INGRESO_DIFERIDO    debe   total/meses   (libera el pasivo)
    ING_SPONSORS        haber  total/meses   (ingreso ganado del mes → P&L)

Cada COBRO (cuota que paga el sponsor):
    <caja>              debe   monto cuota
    DEUDORES_SPONSORS   haber  monto cuota   (cancela parte de lo que nos deben)

Cada pregunta se responde con su cuenta:
- P&L → ING_SPONSORS (parejo, mensual).
- Cashflow → cuotas de cobro (fechas).
- Balance → INGRESO_DIFERIDO (falta ganar) + DEUDORES_SPONSORS (falta cobrar).

## Nivel empresa (torneo_id NULL)

El sponsor es anual/empresa (cubre ambos torneos). Todos los asientos con
torneo_id = NULL — nivel estructura permanente, como los sueldos de socios.
Respeta decisión 5 (no prorratear entre torneos). El ingreso de sponsors NO se
imputa a un torneo puntual.

## Cuentas nuevas (ver cuáles ya existen)

- DEUDORES_SPONSORS (activo / por cobrar) — [AL CONSTRUIR: va PROPIA. La DEUDORES
  genérica se diseñó para equipos y la decisión 1 la sacó de juego, así que
  reusarla mezclaría deuda de equipos —que no es saldo contable— con deuda de
  sponsors, que sí lo es.]
- INGRESO_DIFERIDO (pasivo) — el ingreso aún no ganado. [AL CONSTRUIR: nueva.
  Tampoco reusa ANTICIPOS: un anticipo es plata YA RECIBIDA.]
- ING_SPONSORS (ingreso) — el ingreso ganado, aparece en P&L. [AL CONSTRUIR: YA
  EXISTÍA en el plan desde el schema inicial, sin uso. No se creó.]

## Estructura

contrato_sponsor (id, sponsor_id → tercero, monto_total, vigente_desde, vigente_hasta,
                  created_by, created_at)
  El rango [desde, hasta] define en cuántos meses se prorratea (monto/meses).
  Reusa el patrón de vigencia estrenado en sueldo_socio.

cuota_cobro_sponsor (id, contrato_id, monto, fecha_cobro, ...)
  El cronograma de cobros — independiente del devengo. Alimenta el cashflow.
  La suma de las cuotas de cobro debería igualar el monto_total (validar).

devengo_sponsor (contrato_id, periodo_id, ...) — anti-duplicado del devengo lineal,
  unique (contrato_id, periodo_id). Como devengo_socio.

## Procesos y funciones

- crear_contrato_sponsor(...) → asiento de firma (deudores / ingreso diferido) +
  registra el contrato. Opcional: cargar el cronograma de cuotas de cobro.
- devengar_sponsors(periodo_id) → proceso mensual automático idempotente. Por cada
  contrato vigente en ese período: asiento ingreso_diferido / ing_sponsors, monto =
  total / meses del rango. [AL CONSTRUIR: el redondeo NO es simple. total/meses no
  siempre da exacto —1.000.000 en 3 meses deja 0,01— y esos centavos quedarían
  para siempre en INGRESO_DIFERIDO, que nunca cerraría en cero. El ÚLTIMO período
  devenga el remanente, calculado como total − cuota × (meses − 1) para que sea
  determinista y no dependa del orden.] Escribe
  solo, como devengar_sueldos_socios.
- registrar_cobro_sponsor(cuota_id, medio, ...) → asiento caja / deudores. Cancela
  la cuota de cobro. [AL CONSTRUIR: es PROPIO. registrar_cobro imputa contra cuota
  de equipos y llama a imputar_pago; el sponsor cobra contra DEUDORES_SPONSORS y no
  tiene cuotas de equipo. Mismo nombre coloquial, circuitos distintos.]

## Vistas

- v_estado_sponsor: [AL CONSTRUIR: por CONTRATO, no por sponsor — un sponsor puede
  tener contratos de años distintos y sumarlos borraría el sentido de "pendiente de
  devengar"] — total, devengado a la fecha, cobrado, pendiente de
  devengar, pendiente de cobrar.
- v_cuotas_sponsor_futuras: las cuotas de cobro con fecha futura → para el cashflow.
  ESTA es la que el módulo de cashflow va a consumir.

## Decisiones nuevas para decisiones.md

- Sponsor por devengo lineal (periodificación) — tercer patrón, distinto de equipos
  (percibido) y socios (devengo mensual de un fijo).
- Dos calendarios separados: reconocimiento (P&L, parejo) vs cobro (cashflow, cuotas).
- Ingreso diferido como pasivo que se libera mes a mes.
- Sponsor a nivel empresa (torneo_id NULL), respeta decisión 5.
- Cuotas de cobro de sponsor alimentan el cashflow (v_cuotas_sponsor_futuras).

## Alcance

Backend: 3 cuentas, contrato_sponsor + cuota_cobro_sponsor + devengo_sponsor,
crear_contrato + devengar_sponsors + registrar_cobro_sponsor, 2 vistas, carga de
sponsors como tercero. La pantalla es front de Horacio. Más pesado que socios (dos
calendarios + ingreso diferido), pero autocontenido.

## Lo que se mantiene / cuida

- Regla A2: todo sale del libro diario (las cuentas), no de cálculos aparte.
- NO mezclar con el fondo de inversión (§3.15) ni con los ingresos de equipos
  (percibido puro) — sponsors tienen su propio ingreso (ING_SPONSORS) y su propia
  cuenta por cobrar (DEUDORES_SPONSORS).
- El devengo de sponsors reusa el patrón de proceso mensual idempotente de socios.
- El contrato reusa el patrón de vigencia de sueldo_socio.
- torneo_id NULL en todo (nivel empresa).
