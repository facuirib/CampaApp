# X2 · Conciliación bancaria — Propuesta de diseño (sin código)

No hay ningún diseño previo en decisiones.md/arquitectura.md (la única mención de "conciliación" es sobre Mercado Pago/tarjeta del bar, y está explícitamente fuera de alcance). Esto es un punto de partida para discutir, no una propuesta lista para aplicar — no hay datos reales (0 transferencias en la base) para verificar contra nada, así que construir código ahora sería adivinar a ciegas.

## El problema

El banco tiene su registro (extracto). El sistema tiene el suyo (`pago`/`gasto` con `medio_pago='transferencia'`). Conciliar es verificar que coincidan y detectar diferencias.

## Modelo mínimo propuesto (2 piezas)

**1. Tabla `movimiento_bancario`**: una fila por línea del extracto. Campos: `fecha`, `monto`, `descripcion`, `conciliado` (bool, default false), `pago_id` (nullable, fk), `gasto_id` (nullable, fk) — el vínculo cuando se concilia. Solo uno de los dos, o ninguno si todavía no se concilió.

**2. Función `importar_extracto_bancario(p_filas jsonb)`**: recibe las filas ya parseadas (el parseo del archivo lo hace el front, no la función — parsear un CSV no es "calcular", es leer texto, no viola la regla 1). Inserta en `movimiento_bancario`.

**3. Función `conciliar_movimiento(p_movimiento_id, p_pago_id default null, p_gasto_id default null)`**: vincula manualmente un movimiento con un pago o gasto, marca `conciliado=true`. Rechaza si se pasan los dos o ninguno.

## Decisiones abiertas, necesarias antes de escribir código real

1. **¿El matching es 100% manual o se sugiere automático?** (por fecha+monto similar). Sugerencia: empezar 100% manual — más simple, y con el volumen de transferencias de un club amateur probablemente alcance sin automatizar.

2. **¿Formato del extracto?** Cada banco exporta distinto (columnas, separador, formato de fecha). Depende del banco real que use el club — no se puede definir sin esa información. El parseo en sí puede ir en el front (papaparse, ya disponible) una vez que se sepa el formato.

3. **¿Qué pasa con una diferencia que nunca concilia?** (ej. un cheque rebotó, o hay un movimiento del banco sin contraparte). ¿Queda visible indefinidamente en una pantalla de "pendientes", o hay un cierre/aceptación explícita?

4. **¿Se importa el extracto completo cada vez** (con riesgo de duplicar filas ya importadas), o hay que pensar una clave de unicidad (fecha+monto+descripción, aceptando que dos transferencias idénticas el mismo día colisionarían)?

Si hay opinión sobre estas 4, es buen momento — así la próxima vez que se retome X2, hay algo concreto para escribir en vez de arrancar de cero otra vez.