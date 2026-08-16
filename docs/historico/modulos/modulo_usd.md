> **Fuente de diseño · Módulo USD.** **Ya implementado.**
>
> Tercer módulo de la capa societaria, y el más liviano: la estructura ya
> existía en el schema original —tabla `usd_operacion`, caja usd, cuentas
> `CAJA_USD` y `FIN_DIF_CAMBIO`— y solo faltaba la lógica.
>
> Este archivo es el **camino**: el razonamiento y los trade-offs. El
> **resultado** vive en `docs/arquitectura.md` §3.7 y en `docs/decisiones.md`
> (decisiones 78-82). Ante una diferencia **manda el resultado**.
>
> Resultado: `arquitectura.md` §3.7 · decisiones 78-82
> Migraciones: `20260802130442_modulo_usd` · `20260802130633_usd_orden_ejecucion`
>
> ---
>
> **Lo que apareció al construir**, marcado en el cuerpo como `[AL CONSTRUIR]`.
> El diseño estaba bien —incluido el nombre `FIN_DIF_CAMBIO`, que usa
> correctamente en todo el texto—; esto es lo que no podía preverse desde el
> papel:
>
> · **La verificación de sincronía necesitó una columna nueva.** El replay del
>   PPP tiene que ir en orden de EJECUCIÓN, y ninguna clave existente servía:
>   `fecha` no, porque el PPP se calcula sobre el estado real del diario al
>   ejecutar; y `asiento.created_at` tampoco, porque `now()` devuelve la hora de
>   la TRANSACCIÓN y varias operaciones en una misma transacción quedan con el
>   mismo timestamp. **Lo detectó el test**, que daba DESINCRONIZADO después de
>   operaciones correctas. Se agregó `usd_operacion.orden`, una secuencia.
>
> · **Vender TODO saca el costo en libros exacto**, no el promedio redondeado —
>   si no, quedarían centavos en CAJA_USD sin un solo dólar detrás.
>
> · Se agregó un **check de signo** (cantidad positiva en compra, negativa en
>   venta), para que una carga a mano no invierta el signo y corra el promedio.

---

# Módulo USD — Caja en dólares (cobertura)

> Draft para integrar a arquitectura.md y decisiones.md. Diseño aprobado con Facu.
> Tercer módulo de la capa societaria. El más liviano: la estructura ya existe
> (tabla usd_operacion, caja usd, cuentas), solo falta la lógica.

## El negocio

Campa guarda excedentes en dólares como cobertura cambiaria (protegerse de la
devaluación del peso). Opera: comprar dólares (pesos → USD), vender (USD → pesos),
guardar. Plata de la EMPRESA, no de los socios (separada del fondo de inversión).

## Decisiones de valuación

- **PPP (promedio ponderado)**: los dólares en caja valen el promedio ponderado de
  las compras. Al vender, salen a ese promedio.
- **Diferencia de cambio REALIZADA (solo al vender)**: los dólares quedan a su costo
  hasta que se venden. La ganancia/pérdida se reconoce al concretar la venta, no por
  revalúo periódico. Sin ganancias "en papel".
- **Nivel empresa** (torneo_id NULL), cuenta FIN_DIF_CAMBIO (resultado). Separado del
  fondo de inversión de socios.

## La estructura YA EXISTE (no se crea nada nuevo)

- usd_operacion (fecha, tipo, cantidad, tc, monto_pesos, motivo, asiento_id) — la
  cantidad de dólares vive acá. cantidad negativa en venta (§3.7).
- caja usd → cuenta CAJA_USD (activo), global sin predio. Lleva PESOS (el costo en
  libros). Tras pieza 4 apunta por cuenta_id, v_saldo_caja la resuelve.
- Cuentas CAJA_USD y FIN_DIF_CAMBIO ya existen en el plan.

Dos números distintos, ambos necesarios: TENENCIA (USD, de usd_operacion) y COSTO EN
LIBROS (pesos, del diario CAJA_USD). El PPP es el puente. El diario NO se contamina
con multimoneda — decisión de diseño ya tomada y correcta.

## Poda: sacar 'revaluacion' (decisión nueva)

usd_operacion.tipo hoy admite ('compra','venta','revaluacion'). Con el modelo
realizado NO hay revaluación. Se saca del CHECK → solo ('compra','venta').
[AL CONSTRUIR: se agregó además un check de SIGNO —cantidad > 0 en compra, < 0 en
venta— para que una carga a mano no invierta el signo y corra el promedio.] Misma
clase de limpieza que por_jornada en la pieza 5: un valor del dominio que el modelo
no usa es una trampa. Si algún día se quiere revalúo, se agrega.

## Los asientos

COMPRA (USD 1.000 a $1.000 = $1.000.000):
    CAJA_USD          debe   1.000.000
    <caja pesos>      haber  1.000.000
  + usd_operacion (compra, cantidad +1000, tc 1000, monto_pesos 1.000.000)

VENTA (USD 1.000 a $1.200 = $1.200.000, cuando el promedio en libros era $1.000):
    <caja pesos>      debe   1.200.000
    CAJA_USD          haber  1.000.000   (salen al PPP)
    FIN_DIF_CAMBIO    haber  200.000     (ganancia realizada)
  + usd_operacion (venta, cantidad -1000, tc 1200, monto_pesos 1.200.000)
  Si el dólar hubiera bajado, FIN_DIF_CAMBIO al debe (pérdida).

crear_asiento acepta las 3 líneas de la venta (balancean). origen='usd' ya en CHECK.
CAJA_USD y caja pesos transferencia no exigen predio.

## El PPP (el cálculo central)

En todo momento la caja USD tiene:
- tenencia_usd = Σ cantidad de usd_operacion
- costo_libros = saldo de CAJA_USD (pesos)
- costo_promedio = costo_libros / tenencia_usd

Al VENDER cantidad Q a tc_venta:
- costo de salida = Q × costo_promedio actual
  [AL CONSTRUIR: si Q es TODA la tenencia, el costo de salida es el costo en libros
  exacto y no el promedio redondeado — si no, quedarían centavos en CAJA_USD sin un
  solo dólar detrás. Mismo criterio que el remanente del último devengo de sponsors.]
- recibido = Q × tc_venta
- diferencia = recibido − costo de salida → FIN_DIF_CAMBIO (ganancia si +, pérdida si −)
- CAJA_USD baja por el costo de salida (mantiene el promedio en la caja restante)

Ejemplo: compra 500@1000 + compra 500@1100 → 1000 USD / $1.050.000 (promedio 1050).
Vende 700@1200: costo salida 700×1050=735.000, recibido 840.000, ganancia 105.000.
Queda 300 USD / $315.000 (sigue a 1050).

## Funciones

- comprar_usd(fecha, cantidad, tc, motivo) → asiento compra + registra usd_operacion.
- vender_usd(fecha, cantidad, tc, motivo) → calcula PPP actual, arma asiento de 3
  líneas con la diferencia, registra usd_operacion. Valida que haya suficientes USD.
- (No hay proceso mensual — las operaciones son puntuales, no devengo. periodo_de_fecha
  resuelve al asentar.)

## Vistas

- v_tenencia_usd: cuántos USD hay, costo en libros, promedio ponderado actual.
- v_resultado_cambio: mostrar la diferencia de cambio realizada — hoy se registraría
  y no se vería. Decisión nueva: agregar la vista. [AL CONSTRUIR: se hizo como vista
  propia por mes, y no mezclada con los ingresos operativos: el P&L filtra por tipo y
  FIN_DIF_CAMBIO es `financiero`, que es justo lo que la decisión 12 quiere.]
- [AL CONSTRUIR — vista que el diseño no tenía] v_usd_sincronia: la red de seguridad.
  El promedio cruza DOS fuentes y nada las mantiene sincronizadas, así que un asiento
  directo a CAJA_USD que no pase por usd_operacion dejaría el promedio mal EN
  SILENCIO. La vista reconstruye el costo esperado rehaciendo el promedio operación
  por operación —no es Σ monto_pesos, porque en una venta monto_pesos es lo RECIBIDO
  y de CAJA_USD sale el costo al PPP— y lo compara contra el diario.
  El replay se ordena por usd_operacion.orden, una secuencia agregada al construir:
  ni fecha ni asiento.created_at sirven (ver el encabezado).

## Correcciones de doc

- §3.7: reemplazar la fila "Revaluación → no realizado" — el modelo es solo realizada.
  Actualizar la tabla de asientos USD al modelo compra/venta con diferencia realizada.
- Sacar la mención de revaluación donde aparezca.

## Decisiones nuevas para decisiones.md

- USD: valuación PPP, diferencia de cambio solo realizada (al vender), nivel empresa.
- Sacar 'revaluacion' del dominio de usd_operacion (modelo realizado).
- Diario monomoneda: la cantidad de dólares vive en usd_operacion, no en asiento_linea
  (confirmar como principio — ya estaba, se explicita).
- Agregar vista de tenencia USD y de resultado de cambio.

## Alcance

Backend: sacar revaluacion del CHECK, comprar_usd, vender_usd (con PPP), 2 vistas,
corrección de §3.7. NO se crea estructura (tabla, caja, cuentas ya existen). El más
liviano de los módulos. Pantalla de Horacio después.

## Lo que se cuida

- Regla A2: el costo en libros sale del diario (CAJA_USD); la tenencia de usd_operacion.
- Separado del fondo de inversión (otra tabla, otra cuenta, no se tocan).
- Diario monomoneda intacto (la complejidad del dólar aislada en usd_operacion).
- Percibido puro de equipos y los otros patrones, sin cambios.
