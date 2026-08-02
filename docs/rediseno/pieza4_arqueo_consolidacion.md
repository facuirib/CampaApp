> **Fuente de diseño · Pieza 4 · arqueo y consolidación de efectivo.** Ya implementada.
>
> Recuelga el arqueo de dia_cancha y modela el circuito en dos etapas (arqueo en predio → entrega a central).
>
> Este archivo es el **camino**: el razonamiento, los trade-offs y las
> alternativas que se descartaron. El **resultado** —lo que la base hace
> hoy— vive en `arquitectura.md §3.6` y `docs/decisiones.md`.
> Ante una diferencia entre los dos, **manda el resultado**: este documento
> se conserva como estaba al aprobarse y no se actualiza.
>
> Resultado: arquitectura.md §3.6 · decisiones 57-62
> Migraciones: `20260802094852_caja_central · 20260802095023_arqueo_dia_cancha`

---

# Pieza 4: Arqueo por (fecha, predio) + Consolidación de efectivo

> Draft para integrar a arquitectura.md y decisiones.md. Diseño aprobado con Facu.
> Pieza 4 del rediseño. Recuelga el arqueo y modela el circuito de efectivo en dos
> etapas (arqueo en predio → entrega a central).

## El circuito de efectivo real

COBRO (finde)      →  ARQUEO (finde)          →  ENTREGA (lunes)
efectivo entra        control: contado vs        plata predio → central
"caja predio"         sistema (congelado);       (un asiento de traslado)
                      registra diferencia;       arqueo pasa a 'entregado'
                      responsable = quien
                      tiene la plata hasta
                      la entrega

Punto clave (decisión de Facu): NO hay estado contable intermedio "en tránsito".
El arqueo mismo es el estado. Un arqueo hecho pero no entregado SIGNIFICA "la plata
la tiene el responsable del arqueo". El saldo sin rendir de un responsable se
calcula sumando sus arqueos pendientes de entrega — no necesita cuenta propia.

## Recolgado del arqueo (lo barato)

arqueo hoy: (jornada_id NN, predio_id NN, ...). Tabla vacía, cero consumidores,
cero FKs entrantes, ninguna vista la lee.

Cambio: jornada_id + predio_id → dia_cancha_id (FK a dia_cancha).
- Una columna en vez de dos.
- unique (dia_cancha_id) — corrige que hoy nada impide dos arqueos del mismo
  predio+fecha.
- dia_cancha ya existe (pieza 5) y puede tener días sin fútbol (decisión 56) —
  así un arqueo de un sábado de solo-bar tiene dónde colgar. La decisión 56 es
  precondición de ésta.

## El saldo esperado (el trabajo con sustancia)

Hoy no existe función/vista que responda "cuánto efectivo debería haber en el
predio X al cierre del día Y". v_saldo_caja da el acumulado a hoy, sin corte por
fecha. Hay que construir el cálculo con corte temporal, desde el libro diario:
efectivo cobrado en ese predio hasta esa fecha, menos gastos en efectivo, etc.

saldo_sistema se CONGELA: se calcula al momento de arquear y se guarda (la tabla
ya tiene la columna NOT NULL). El arqueo es acta histórica — si mañana se corrige
un asiento viejo, el saldo_sistema de ese arqueo no cambia. Mismo espíritu que
total_facturado/pagado_at, pero acá es congelamiento a propósito (foto del momento).

## La caja central

Hoy hay 4 cajas: efectivo TIR, efectivo AEP, transferencia global, USD global.
No hay caja central ni mecanismo de tránsito entre cajas. Se crea la caja central
(efectivo, sin predio / global) — donde la plata de los predios termina.

## Estado del arqueo

arqueo gana un estado: pendiente_entrega | entregado (o similar).
- Nace 'pendiente_entrega' al crearse (finde).
- Pasa a 'entregado' cuando se registra la entrega a central (lunes).
- responsable_id (ya existe, NN) = quién tiene la plata mientras está pendiente.

## Movimiento contable: UNO solo, al entregar

Respetando "sin estado intermedio": el movimiento de plata es un único asiento
predio → central, al ENTREGAR. Entre arqueo y entrega, la plata está "asociada al
arqueo" (responsable_id), no en una cuenta intermedia. El arqueo registra el
control (contado vs sistema, diferencia) pero el traslado contable ocurre en la
entrega.
[A confirmar en construcción: si el efectivo del predio baja al arquear o al
entregar. Propuesta: baja al entregar, un solo asiento. El "quién la tiene" lo da
el responsable del arqueo pendiente.]

## La diferencia (contado ≠ sistema)

diferencia = saldo_contado - saldo_sistema (columna generated, ya existe).
- Se registra al arquear, sin forzar resolución.
- Faltante (contado < sistema) o sobrante: quedan registrados como diferencia.
- La RESOLUCIÓN (¿lo cubre el responsable? ¿es pérdida/quebranto?) es un paso
  POSTERIOR, no parte del arqueo. El asiento_id (nullable, ya existe) es el ajuste
  cuando se resuelva — puede venir después o no venir.

## Las funciones (las puertas)

- crear_arqueo(dia_cancha_id, saldo_contado, responsable_id) → registra el control:
  calcula y congela saldo_sistema, guarda saldo_contado, la diferencia sale sola,
  estado 'pendiente_entrega'. Valida unique (un arqueo por dia_cancha).
- registrar_entrega_central(arqueo_id, ...) → genera el asiento predio → central,
  marca el arqueo 'entregado'. Deja la caja del predio en cero (de ese arqueo).

Ambas agnósticas del torneo (regla 12). Una lógica para seed/futura app.

## Consultas que habilita

- Saldo sin rendir por responsable = Σ arqueos pendientes de entrega de ese
  responsable. (Sin cuenta contable propia — sale de los arqueos.)
- Diferencias de caja registradas, pendientes de resolución.
- Historial de arqueos por predio/fecha.

## Decisiones nuevas para decisiones.md

- Arqueo cuelga de dia_cancha_id (recolgado, decisión 46 implementada).
- Sin estado contable "en tránsito": el arqueo pendiente de entrega ES el estado;
  el responsable tiene la plata. Movimiento contable único al entregar.
- saldo_sistema congelado al arquear (acta histórica).
- Diferencia de arqueo registrada, resolución diferida (no se fuerza deuda/pérdida
  al arquear).
- Caja central creada.

## Lo que se mantiene

- Regla A2: el saldo esperado sale del libro diario, no se inventa.
- Percibido puro intacto (esto es efectivo/control, no cambia el reconocimiento).
- El efectivo se discrimina por predio vía asiento.predio_id (ya existe).

## Nota: divergencias doc↔schema detectadas (para corregir de paso)
- §3.6 documenta caja como (id, tipo unique); la real es (id, tipo, nombre,
  predio_id, activo). La real es la correcta.
- §3.6 documenta arqueo con fecha date not null; la real sigue con jornada_id
  (era el diseño de la decisión 46 escrito en presente). Esta pieza lo hace realidad
  vía dia_cancha_id.
- Tercera vez que aparece drift doc↔schema (antes: presupuesto_linea). Vale una
  pasada de verificación en algún momento.
